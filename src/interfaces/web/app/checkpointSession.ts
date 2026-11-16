import { type CheckpointOutcome, appendCheckpoint, checkCheckpoint, preflightCheckpoint, readCheckpoints } from "../../../adapters/google/DirectCheckpoints";
import type { CheckpointCopy, CheckpointLock, CheckpointStore } from "../../../adapters/browser/CheckpointStore";
import type { RestClient } from "../../../adapters/google/Rest";
import type { Workbook } from "../../../applications/SessionModel";
import { canonicalJson } from "../../../core/CanonicalJson";
import { type Checkpoint, type CheckpointCommand, activeCheckpoints } from "../../../core/Checkpoints";
import type { IsoDate } from "../../../core/IsoDate";
import type { EuroCents } from "../../../core/Money";

type Access = { readonly ok: true; readonly token: string; readonly workbook: Workbook } | { readonly ok: false; readonly message: string };

export interface PreservedCheckpoints {
  readonly workbookId: string;
  readonly active: readonly Checkpoint[];
  /** An unresolved command that belongs to that workbook. It is never sent anywhere from here. */
  readonly pending: readonly CheckpointCommand[];
}

export interface CheckpointSessionState {
  /** The log was read from Google and matches everything this device knows. Writing needs this. */
  readonly ready: boolean;
  readonly initialized: boolean;
  readonly commands: readonly CheckpointCommand[];
  readonly active: readonly Checkpoint[];
  /** Unresolved commands for the connected workbook. While any exists, nothing else can be saved. */
  readonly pending: readonly CheckpointCommand[];
  /** Copies bound to other workbooks: read-only, never overwritten, never sent. */
  readonly preserved: readonly PreservedCheckpoints[];
  readonly message: string;
  readonly cached: boolean;
}

export type CheckpointWriteResult =
  | { readonly status: "saved"; readonly message: string }
  | { readonly status: "no-change"; readonly message: string }
  | { readonly status: "refused" | "not-saved"; readonly message: string }
  | { readonly status: "unknown"; readonly message: string };

const EMPTY: CheckpointSessionState = { ready: false, initialized: false, commands: [], active: [], pending: [], preserved: [], message: "", cached: false };

/** Every command the device knows must still be in Google's log, with the same content. */
function containsKnown(remote: readonly CheckpointCommand[], known: readonly CheckpointCommand[]): boolean {
  const byId = new Map(remote.map((command) => [command.id, canonicalJson(command)]));
  return known.every((command) => byId.get(command.id) === canonicalJson(command));
}

/** Feature state for checkpoints. The Google connection comes from the app session. */
export class CheckpointSession {
  private current: CheckpointSessionState;
  private readonly listeners = new Set<() => void>();
  private workbookId: string | null;
  private epoch = 0;
  private sequence = 0;
  private busy = false;
  private refreshing: Promise<void> | null = null;

  constructor(private readonly deps: {
    readonly rest: RestClient;
    readonly store: CheckpointStore;
    readonly lock: CheckpointLock;
    readonly newId: () => string;
    readonly access: (purpose: "read" | "write") => Promise<Access>;
    readonly workbookId?: string | null;
    readonly today?: () => IsoDate;
  }) {
    this.workbookId = deps.workbookId ?? null;
    this.current = this.hydrate();
  }

  get state(): CheckpointSessionState { return this.current; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private set(next: CheckpointSessionState): void { this.current = next; for (const listener of this.listeners) listener(); }

  /**
   * Loads what this device holds. Copies bound to the connected workbook become the current log; every
   * other copy is preserved read-only, with its unresolved command, and nothing here overwrites it.
   */
  private hydrate(): CheckpointSessionState {
    const preserved: PreservedCheckpoints[] = [];
    let currentCopy: CheckpointCopy | null = null;
    for (const id of this.deps.store.workbooks()) {
      const copy = this.deps.store.loadCopy(id);
      const pending = this.deps.store.loadReceipts(id);
      if (id === this.workbookId) { currentCopy = copy; continue; }
      if (copy !== null || pending.length > 0) preserved.push({ workbookId: id, active: activeCheckpoints(copy?.commands ?? []), pending });
    }
    const pending = this.workbookId === null ? [] : this.deps.store.loadReceipts(this.workbookId);
    const commands = currentCopy?.commands ?? [];
    return {
      ...EMPTY,
      commands, active: activeCheckpoints(commands), initialized: currentCopy?.initialized ?? false, pending, preserved, cached: currentCopy !== null,
      message: pending.length > 0 ? "A previous checkpoint save needs checking. Its outcome is reconciled before anything else is saved." : "",
    };
  }

  /** The user's explicit Forget this device, or a sign-out. The only thing that removes copies. */
  forget(): void {
    this.epoch++;
    this.workbookId = null;
    this.refreshing = null;
    this.deps.store.clearAll();
    this.set({ ...EMPTY });
  }

  refresh(): Promise<void> {
    if (this.refreshing !== null) return this.refreshing;
    const epoch = this.epoch;
    const run = this.load().catch(() => {
      if (epoch === this.epoch) this.set({ ...this.current, ready: false, message: "Your checkpoints could not be checked against Google. Your device copy was kept." });
    });
    this.refreshing = run;
    void run.then(() => { if (this.refreshing === run) this.refreshing = null; });
    return run;
  }

  private async load(): Promise<void> {
    if (this.busy) return;
    const sequence = ++this.sequence;
    const epoch = this.epoch;
    const access = await this.deps.access("read");
    if (epoch !== this.epoch || sequence !== this.sequence) return;
    if (!access.ok) { this.set({ ...this.current, ready: false, message: access.message }); return; }
    // A different workbook never clears anything: the old copy simply becomes a preserved one.
    if (this.workbookId !== access.workbook.id) { this.workbookId = access.workbook.id; this.set({ ...this.hydrate() }); }
    const id = access.workbook.id;
    const result = await readCheckpoints(this.deps.rest, access.token, id, this.current.initialized);
    if (epoch !== this.epoch || sequence !== this.sequence) return;
    if (result.status === "ok") {
      if (!containsKnown(result.commands, this.current.commands)) {
        this.set({ ...this.current, ready: false, message: "Google is missing checkpoints already saved on this device. Your copy was kept. Review the workbook before saving another checkpoint." });
        return;
      }
      const saved = this.deps.store.saveCopy({ workbookId: id, commands: result.commands, initialized: true });
      this.set({ ...this.current, ready: true, initialized: true, commands: result.commands, active: activeCheckpoints(result.commands), cached: false, pending: this.deps.store.loadReceipts(id), message: saved ? "" : "This device could not keep a local copy of your checkpoints. They are safe in Google." });
    } else if (result.status === "absent") {
      this.set({ ...this.current, ready: true, initialized: false, commands: [], active: [], cached: false, pending: this.deps.store.loadReceipts(id), message: "" });
    } else {
      this.set({ ...this.current, ready: false, message: result.message });
    }
  }

  /** Records a value-only observation of the portfolio's total value. */
  add(request: { readonly date: IsoDate; readonly cents: EuroCents; readonly note: string }): Promise<CheckpointWriteResult> {
    return this.write({ id: this.deps.newId(), kind: "add", date: request.date, cents: request.cents, note: request.note });
  }
  /** Withdraws an active checkpoint. */
  void(target: string): Promise<CheckpointWriteResult> {
    return this.write({ id: this.deps.newId(), kind: "void", target });
  }

  private async write(command: CheckpointCommand): Promise<CheckpointWriteResult> {
    if (this.busy) return { status: "not-saved", message: "A checkpoint operation is already running. Wait for its outcome." };
    this.busy = true;
    this.sequence++;
    const epoch = this.epoch;
    try {
      if (this.current.pending.length > 0) return { status: "unknown", message: "A previous checkpoint save needs checking first. Use Check outcome." };
      if (!this.current.ready) return { status: "not-saved", message: "Load and check your checkpoints before saving." };
      const access = await this.deps.access("write");
      if (epoch !== this.epoch) return this.accountChanged();
      if (!access.ok) return { status: "not-saved", message: access.message };
      if (this.workbookId !== access.workbook.id) return { status: "not-saved", message: "The connected workbook changed. Reload checkpoints before saving." };
      const id = access.workbook.id;
      const today = this.deps.today?.() ?? todayOf(new Date());
      const held = await this.deps.lock.run(() => this.locked(access.token, id, command, today, epoch));
      if (held.status === "unsupported") return { status: "not-saved", message: "This browser cannot keep several windows from saving at once, so nothing was sent. Checkpoints can still be read." };
      if (held.status === "busy") return { status: "not-saved", message: "Another window is saving a checkpoint. Wait a moment and try again." };
      return held.value;
    } catch {
      if (epoch !== this.epoch) return this.accountChanged();
      this.refreshPending();
      return { status: "unknown", message: "The save outcome could not be checked. Use Check outcome before saving again." };
    } finally { this.busy = false; }
  }

  private accountChanged(): CheckpointWriteResult {
    return { status: "unknown", message: "The account changed while saving. Check the original workbook before another save." };
  }
  private refreshPending(): void {
    if (this.workbookId !== null) this.set({ ...this.current, pending: this.deps.store.loadReceipts(this.workbookId) });
  }

  /** The whole critical section. Runs only while this window holds the lock. */
  private async locked(token: string, id: string, command: CheckpointCommand, today: IsoDate, epoch: number): Promise<CheckpointWriteResult> {
    const receipts = this.deps.store.loadReceipts(id);
    if (receipts.length > 0) {
      this.set({ ...this.current, pending: receipts, message: "A previous checkpoint save needs checking first." });
      return { status: "unknown", message: "A previous checkpoint save, possibly from another window, needs checking first. Use Check outcome." };
    }
    const preflight = await preflightCheckpoint(this.deps.rest, token, id, command, today, this.current.initialized);
    if (epoch !== this.epoch) return this.accountChanged();
    if (preflight.status === "unavailable") return { status: "not-saved", message: preflight.message };
    if (preflight.status === "refused") return { status: "refused", message: preflight.message };
    if (preflight.status === "no-op") return { status: "no-change", message: "Nothing to change: that checkpoint is already withdrawn." };
    // The receipt must be durable before anything is sent, or a lost answer plus a reload could lose the command.
    if (!this.deps.store.saveReceipts(id, [command])) return { status: "not-saved", message: "This device cannot keep a safe record of the save, so nothing was sent. Free some browser storage and try again." };
    this.set({ ...this.current, pending: [command] });
    const outcome = await appendCheckpoint(this.deps.rest, token, id, command, today, this.current.initialized);
    if (epoch !== this.epoch) return this.accountChanged();
    return this.resolve(id, outcome);
  }

  /**
   * Turns an outcome into the final state. A confirmed command is persisted in the history copy and read
   * back before its receipt is removed; a receipt is kept on any failure. An outcome that may have appended
   * anything stays unknown.
   */
  private resolve(id: string, outcome: CheckpointOutcome): CheckpointWriteResult {
    if (outcome.status === "unknown") {
      this.set({ ...this.current, pending: this.deps.store.loadReceipts(id), message: outcome.message });
      return { status: "unknown", message: outcome.message };
    }
    const commands = "commands" in outcome ? outcome.commands : undefined;
    if (commands !== undefined) {
      if (!containsKnown(commands, this.current.commands)) {
        const message = "Google's log does not include every checkpoint known on this device. Your copy and the unsent command were kept. Review the workbook before saving again.";
        this.set({ ...this.current, ready: false, pending: this.deps.store.loadReceipts(id), message });
        return { status: "unknown", message };
      }
      const kept = this.deps.store.saveCopy({ workbookId: id, commands, initialized: true });
      if (!kept) {
        // Acknowledged or not, nothing is lost: the receipt stays until the local copy can be written.
        const message = outcome.status === "saved" ? "Saved in Google, but this device could not update its local copy. Use Check outcome to finish." : "This device could not update its local copy. Use Check outcome to finish.";
        this.set({ ...this.current, commands, active: activeCheckpoints(commands), initialized: true, pending: this.deps.store.loadReceipts(id), message });
        return { status: "unknown", message };
      }
      this.set({ ...this.current, commands, active: activeCheckpoints(commands), initialized: true, cached: false });
    }
    const cleared = this.deps.store.saveReceipts(id, []);
    this.set({ ...this.current, pending: cleared ? [] : this.deps.store.loadReceipts(id), message: cleared ? "" : "A finished save could not be cleared from this device. Use Check outcome." });
    if (outcome.status === "saved") return { status: "saved", message: "" };
    if (outcome.status === "no-op") return { status: "no-change", message: "Nothing to change: that checkpoint is already withdrawn." };
    return { status: outcome.status === "refused" ? "refused" : "not-saved", message: outcome.message };
  }

  /** Reads the unresolved command back from Google. Never submits anything. */
  async checkPending(): Promise<CheckpointWriteResult> {
    if (this.busy) return { status: "not-saved", message: "A checkpoint operation is already running. Wait for its outcome." };
    const id = this.workbookId;
    if (id === null) return { status: "not-saved", message: "Connect first." };
    this.busy = true;
    this.sequence++;
    const epoch = this.epoch;
    try {
      const access = await this.deps.access("read");
      if (epoch !== this.epoch) return this.accountChanged();
      if (!access.ok) return { status: "not-saved", message: access.message };
      if (access.workbook.id !== id) return { status: "not-saved", message: "The connected workbook changed. Reconnect to the original workbook to check this save." };
      const held = await this.deps.lock.run(async (): Promise<CheckpointWriteResult> => {
        const receipts = this.deps.store.loadReceipts(id);
        const command = receipts[0];
        if (command === undefined) { this.set({ ...this.current, pending: [] }); return { status: "no-change", message: "There is no unresolved checkpoint save." }; }
        const outcome = await checkCheckpoint(this.deps.rest, access.token, id, command, true);
        if (epoch !== this.epoch) return this.accountChanged();
        return this.resolve(id, outcome);
      });
      if (held.status === "unsupported") return { status: "not-saved", message: "This browser cannot keep several windows from saving at once, so nothing was changed." };
      if (held.status === "busy") return { status: "not-saved", message: "Another window is working on checkpoints. Wait a moment and try again." };
      return held.value;
    } catch {
      return { status: "unknown", message: "The save outcome could not be checked yet. Keep this page open and try again." };
    } finally { this.busy = false; }
  }

  /** Plain text of a preserved copy, for copying out of the app. */
  preservedText(workbookId: string): string {
    const entry = this.current.preserved.find((item) => item.workbookId === workbookId);
    if (entry === undefined) return "";
    return entry.active.map((item) => `${item.date}\t${(item.cents / 100).toFixed(2)}\t${item.note}`).join("\n");
  }
}

/** The user's local calendar date. */
function todayOf(now: Date): IsoDate {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` as IsoDate;
}
