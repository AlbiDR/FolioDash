import {
  type CheckpointOutcome,
  appendCheckpoint,
  checkCheckpoint,
  includesKnown,
  preflightCheckpoint,
  readCheckpoints,
} from "../../../adapters/google/direct-checkpoints";
import type {
  CheckpointCopy,
  CheckpointLock,
  CheckpointReceipt,
  CheckpointStore,
} from "../../../adapters/browser/checkpoint-store";
import type { RestClient } from "../../../adapters/google/rest";
import type { Workbook } from "../../../applications/session-model";
import { type Checkpoint, type CheckpointCommand, activeCheckpoints } from "../../../core/checkpoints";
import type { IsoDate } from "../../../core/iso-date";
import type { EuroCents } from "../../../core/money";

type Access =
  | { readonly ok: true; readonly token: string; readonly workbook: Workbook }
  | { readonly ok: false; readonly message: string };

export interface PreservedCheckpoints {
  readonly workbookId: string;
  readonly active: readonly Checkpoint[];
  /** An unresolved command that belongs to that workbook. It is never sent anywhere from here. */
  readonly pending: readonly CheckpointCommand[];
  /** This device's record of an unsent save for that workbook could not be read. It is kept untouched. */
  readonly unreadable: boolean;
}

export interface CheckpointSessionState {
  /** The log was read from Google and matches everything this device knows. Writing needs this. */
  readonly ready: boolean;
  readonly initialized: boolean;
  readonly commands: readonly CheckpointCommand[];
  readonly active: readonly Checkpoint[];
  /** Unresolved commands for the connected workbook. While any exists, nothing else can be saved. */
  readonly pending: readonly CheckpointCommand[];
  /** The device's record of an unsent save could not be read, so nothing can be saved until it can. */
  readonly receiptsUnreadable: boolean;
  /** The last integrity check of the log failed (altered, missing or lacking known checkpoints): draw no markers. */
  readonly suspect: boolean;
  /** Copies bound to other workbooks: read-only, never overwritten, never sent. */
  readonly preserved: readonly PreservedCheckpoints[];
  readonly message: string;
  readonly cached: boolean;
  /** Changes whenever this device is forgotten, so a screen can discard private drafts with it. */
  readonly generation: number;
}

export type CheckpointWriteResult =
  | { readonly status: "saved"; readonly message: string }
  | { readonly status: "no-change"; readonly message: string }
  | { readonly status: "refused" | "not-saved"; readonly message: string }
  | { readonly status: "unknown"; readonly message: string };

const EMPTY: CheckpointSessionState = {
  ready: false,
  initialized: false,
  commands: [],
  active: [],
  pending: [],
  receiptsUnreadable: false,
  suspect: false,
  preserved: [],
  message: "",
  cached: false,
  generation: 0,
};
const UNREADABLE =
  "This device's record of a checkpoint save in progress could not be read, so nothing can be saved. It was left untouched. Reload, or use Forget this device only if you accept losing it.";

/** Every command the device knows must still be in the other list, with the same content. */
function containsKnown(remote: readonly CheckpointCommand[], known: readonly CheckpointCommand[]): boolean {
  return includesKnown(remote, known);
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

  constructor(
    private readonly deps: {
      readonly rest: RestClient;
      readonly store: CheckpointStore;
      readonly lock: CheckpointLock;
      readonly newId: () => string;
      readonly access: (purpose: "read" | "write") => Promise<Access>;
      readonly workbookId?: string | null;
      readonly today?: () => IsoDate;
    },
  ) {
    this.workbookId = deps.workbookId ?? null;
    this.current = this.hydrate();
  }

  get state(): CheckpointSessionState {
    return this.current;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private set(next: CheckpointSessionState): void {
    this.current = { ...next, generation: this.epoch };
    for (const listener of this.listeners) listener();
  }

  /** What the device holds for one workbook. Unreadable is reported, never mistaken for empty. */
  private receiptsOf(id: string): { readonly receipts: readonly CheckpointReceipt[]; readonly unreadable: boolean } {
    const read = this.deps.store.loadReceipts(id);
    return read.status === "present"
      ? { receipts: read.receipts, unreadable: false }
      : { receipts: [], unreadable: read.status === "unreadable" };
  }

  /**
   * Loads what this device holds. Copies bound to the connected workbook become the current log; every
   * other copy is preserved read-only, with its unresolved command, and nothing here overwrites it.
   */
  private hydrate(): CheckpointSessionState {
    const preserved: PreservedCheckpoints[] = [];
    let currentCopy: CheckpointCopy | null = null;
    for (const id of this.deps.store.workbooks()) {
      const copy = this.deps.store.loadCopy(id);
      const held = this.receiptsOf(id);
      if (id === this.workbookId) {
        currentCopy = copy;
        continue;
      }
      if (copy !== null || held.receipts.length > 0 || held.unreadable)
        preserved.push({
          workbookId: id,
          active: activeCheckpoints(copy?.commands ?? []),
          pending: held.receipts.map((receipt) => receipt.command),
          unreadable: held.unreadable,
        });
    }
    const own =
      this.workbookId === null
        ? { receipts: [] as readonly CheckpointReceipt[], unreadable: false }
        : this.receiptsOf(this.workbookId);
    const commands = currentCopy?.commands ?? [];
    return {
      ...EMPTY,
      commands,
      active: activeCheckpoints(commands),
      initialized: currentCopy?.initialized ?? false,
      pending: own.receipts.map((receipt) => receipt.command),
      receiptsUnreadable: own.unreadable,
      preserved,
      cached: currentCopy !== null,
      message: own.unreadable
        ? UNREADABLE
        : own.receipts.length > 0
          ? "A previous checkpoint save needs checking. Its outcome is reconciled before anything else is saved."
          : "",
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
      if (epoch === this.epoch)
        this.set({
          ...this.current,
          ready: false,
          message: "Your checkpoints could not be checked against Google. Your device copy was kept.",
        });
    });
    this.refreshing = run;
    void run.then(() => {
      if (this.refreshing === run) this.refreshing = null;
    });
    return run;
  }

  /**
   * Stores a log as the device copy only if it still holds everything the device already stored. Another
   * window may have saved since this one read, and an older view must never replace a newer copy.
   */
  private persistCopy(
    id: string,
    commands: readonly CheckpointCommand[],
    initialized = true,
  ): "saved" | "stale" | "failed" {
    const stored = this.deps.store.loadCopy(id);
    if (stored !== null && !containsKnown(commands, stored.commands)) return "stale";
    return this.deps.store.saveCopy({ workbookId: id, commands, initialized }) ? "saved" : "failed";
  }

  /**
   * Everything this device knows for a workbook: this window's log together with the shared device copy, which
   * another window may have extended. Google must hold all of it before anything is written or believed.
   */
  private knownCommands(id: string): readonly CheckpointCommand[] {
    const stored = this.deps.store.loadCopy(id);
    if (stored === null) return this.current.commands;
    const byId = new Map(this.current.commands.map((command) => [command.id, command]));
    for (const command of stored.commands) if (!byId.has(command.id)) byId.set(command.id, command);
    return [...byId.values()];
  }

  /**
   * Takes an authoritative log Google just returned, without writing anything to Google: the list and the device
   * copy catch up (for example with a withdrawal another device made). Returns a message when the copy could not be kept.
   */
  private adopt(id: string, commands: readonly CheckpointCommand[]): string | null {
    if (!containsKnown(commands, this.knownCommands(id))) return null;
    const initialized = this.current.initialized || commands.length > 0;
    const kept = initialized ? this.persistCopy(id, commands, true) : "saved";
    this.set({ ...this.current, commands, active: activeCheckpoints(commands), initialized });
    return kept === "saved"
      ? null
      : "This device could not update its local copy of your checkpoints. They are safe in Google.";
  }

  private async load(): Promise<void> {
    if (this.busy) return;
    const sequence = ++this.sequence;
    const epoch = this.epoch;
    const access = await this.deps.access("read");
    if (epoch !== this.epoch || sequence !== this.sequence) return;
    if (!access.ok) {
      this.set({ ...this.current, ready: false, message: access.message });
      return;
    }
    // A different workbook never clears anything: the old copy simply becomes a preserved one.
    if (this.workbookId !== access.workbook.id) {
      this.workbookId = access.workbook.id;
      this.set({ ...this.hydrate() });
    }
    const id = access.workbook.id;
    const result = await readCheckpoints(this.deps.rest, access.token, id, this.current.initialized);
    if (epoch !== this.epoch || sequence !== this.sequence) return;
    if (result.status === "ok") {
      const missing =
        "Google is missing checkpoints already saved on this device. Your copy was kept. Review the workbook before saving another checkpoint.";
      // Known history includes what another window stored, not only this window's own view.
      if (!containsKnown(result.commands, this.knownCommands(id))) {
        this.set({ ...this.current, ready: false, suspect: true, message: missing });
        return;
      }
      // The device copy is written inside the same lock saves use, never over a newer one, and never after the account changed.
      const held = await this.deps.lock.run(() =>
        Promise.resolve(epoch !== this.epoch ? ("cancelled" as const) : this.persistCopy(id, result.commands)),
      );
      if (epoch !== this.epoch || sequence !== this.sequence) return;
      const persisted = held.status === "held" ? held.value : "skipped";
      if (persisted === "cancelled") return;
      if (persisted === "stale") {
        this.set({ ...this.current, ready: false, suspect: true, message: missing });
        return;
      }
      const own = this.receiptsOf(id);
      this.set({
        ...this.current,
        ready: true,
        suspect: false,
        initialized: true,
        commands: result.commands,
        active: activeCheckpoints(result.commands),
        cached: false,
        pending: own.receipts.map((receipt) => receipt.command),
        receiptsUnreadable: own.unreadable,
        message: own.unreadable
          ? UNREADABLE
          : persisted === "failed"
            ? "This device could not keep a local copy of your checkpoints. They are safe in Google."
            : "",
      });
    } else if (result.status === "absent") {
      // An empty answer is still an answer about history: it must not hide checkpoints this device already knows,
      // including ones another window saved after this refresh began.
      const stored = this.deps.store.loadCopy(id);
      if (this.knownCommands(id).length > 0 || stored?.initialized === true) {
        this.set({
          ...this.current,
          ready: false,
          suspect: true,
          message:
            "Google shows no checkpoint log, but this device knows of checkpoints. Your copy was kept. Review the workbook before saving another checkpoint.",
        });
        return;
      }
      const own = this.receiptsOf(id);
      this.set({
        ...this.current,
        ready: true,
        suspect: false,
        initialized: false,
        commands: [],
        active: [],
        cached: false,
        pending: own.receipts.map((receipt) => receipt.command),
        receiptsUnreadable: own.unreadable,
        message: own.unreadable ? UNREADABLE : "",
      });
    } else {
      // Any unsuccessful read stops the markers; the device copy stays listed on the screen with the explanation.
      this.set({ ...this.current, ready: false, suspect: true, message: result.message });
    }
  }

  /** Records a value-only observation of the portfolio's total value. */
  add(request: {
    readonly date: IsoDate;
    readonly cents: EuroCents;
    readonly note: string;
  }): Promise<CheckpointWriteResult> {
    return this.write({
      id: this.deps.newId(),
      kind: "add",
      date: request.date,
      cents: request.cents,
      note: request.note,
    });
  }
  /** Withdraws an active checkpoint. */
  void(target: string): Promise<CheckpointWriteResult> {
    return this.write({ id: this.deps.newId(), kind: "void", target });
  }

  private async write(command: CheckpointCommand): Promise<CheckpointWriteResult> {
    if (this.busy)
      return { status: "not-saved", message: "A checkpoint operation is already running. Wait for its outcome." };
    this.busy = true;
    this.sequence++;
    const epoch = this.epoch;
    try {
      if (this.current.receiptsUnreadable) return { status: "unknown", message: UNREADABLE };
      if (this.current.pending.length > 0)
        return { status: "unknown", message: "A previous checkpoint save needs checking first. Use Check outcome." };
      if (!this.current.ready)
        return { status: "not-saved", message: "Load and check your checkpoints before saving." };
      const access = await this.deps.access("write");
      if (epoch !== this.epoch) return this.accountChanged();
      if (!access.ok) return { status: "not-saved", message: access.message };
      if (this.workbookId !== access.workbook.id)
        return { status: "not-saved", message: "The connected workbook changed. Reload checkpoints before saving." };
      const id = access.workbook.id;
      const today = this.deps.today?.() ?? todayOf(new Date());
      const held = await this.deps.lock.run(() => this.locked(access.token, id, command, today, epoch));
      if (held.status === "unsupported")
        return {
          status: "not-saved",
          message:
            "This browser cannot keep several windows from saving at once, so nothing was sent. Checkpoints can still be read.",
        };
      if (held.status === "busy")
        return { status: "not-saved", message: "Another window is saving a checkpoint. Wait a moment and try again." };
      return held.value;
    } catch {
      if (epoch !== this.epoch) return this.accountChanged();
      this.refreshPending();
      return {
        status: "unknown",
        message: "The save outcome could not be checked. Use Check outcome before saving again.",
      };
    } finally {
      this.busy = false;
    }
  }

  private accountChanged(): CheckpointWriteResult {
    return {
      status: "unknown",
      message: "The account changed while saving. Check the original workbook before another save.",
    };
  }
  private refreshPending(): void {
    if (this.workbookId === null) return;
    const own = this.receiptsOf(this.workbookId);
    this.set({
      ...this.current,
      pending: own.receipts.map((receipt) => receipt.command),
      receiptsUnreadable: own.unreadable,
    });
  }

  /** The whole critical section. Runs only while this window holds the lock. */
  private async locked(
    token: string,
    id: string,
    command: CheckpointCommand,
    today: IsoDate,
    epoch: number,
  ): Promise<CheckpointWriteResult> {
    // Forget or an account change may have happened while this window waited for the lock.
    if (epoch !== this.epoch) return this.accountChanged();
    const stored = this.receiptsOf(id);
    // A record that cannot be read is treated as an unresolved save, never as an empty one.
    if (stored.unreadable) {
      this.set({ ...this.current, receiptsUnreadable: true, message: UNREADABLE });
      return { status: "unknown", message: UNREADABLE };
    }
    if (stored.receipts.length > 0) {
      this.set({
        ...this.current,
        pending: stored.receipts.map((receipt) => receipt.command),
        message: "A previous checkpoint save needs checking first.",
      });
      return {
        status: "unknown",
        message: "A previous checkpoint save, possibly from another window, needs checking first. Use Check outcome.",
      };
    }
    const known = this.knownCommands(id);
    const preflight = await preflightCheckpoint(
      this.deps.rest,
      token,
      id,
      command,
      today,
      this.current.initialized,
      known,
    );
    if (epoch !== this.epoch) return this.accountChanged();
    if (preflight.status === "unavailable") return { status: "not-saved", message: preflight.message };
    // A refusal or a no-op still tells this window what Google holds now, so the list and chart catch up at once.
    if (preflight.status === "refused") {
      const note = this.adopt(id, preflight.commands ?? []);
      return { status: "refused", message: note === null ? preflight.message : `${preflight.message} ${note}` };
    }
    if (preflight.status === "no-op") {
      const note = this.adopt(id, preflight.commands);
      return {
        status: "no-change",
        message:
          note === null
            ? "Nothing to change: that checkpoint is already withdrawn."
            : `Nothing to change: that checkpoint is already withdrawn. ${note}`,
      };
    }
    // The receipt must be durable before anything is sent, or a lost answer plus a reload could lose the command.
    const receipt: CheckpointReceipt = { command, phase: "sent" };
    if (!this.deps.store.saveReceipts(id, [receipt]))
      return {
        status: "not-saved",
        message:
          "This device cannot keep a safe record of the save, so nothing was sent. Free some browser storage and try again.",
      };
    this.set({ ...this.current, pending: [command] });
    const outcome = await appendCheckpoint(
      this.deps.rest,
      token,
      id,
      command,
      today,
      this.current.initialized,
      known,
      () => epoch === this.epoch,
    );
    if (epoch !== this.epoch) return this.accountChanged();
    return this.resolve(id, receipt, outcome);
  }

  /**
   * Turns an outcome into the final state. A confirmed command is persisted in the history copy and read
   * back before its receipt is removed; a receipt is kept on any failure. An outcome known not to have
   * appended anything first records that on the receipt, so cleaning up later never needs the command to
   * exist in Google. An outcome that may have appended anything stays unknown.
   */
  private resolve(
    id: string,
    receipt: CheckpointReceipt,
    outcome: CheckpointOutcome,
    observedInitialized?: boolean,
  ): CheckpointWriteResult {
    if (outcome.status === "unknown") {
      this.refreshPending();
      this.set({ ...this.current, message: outcome.message });
      return { status: "unknown", message: outcome.message };
    }
    if (outcome.status === "conflict") {
      // The command exists with different content: never evidence that nothing was sent. Keep the receipt and the known history.
      this.refreshPending();
      this.set({ ...this.current, ready: false, suspect: true, message: outcome.message });
      return { status: "unknown", message: outcome.message };
    }
    const known = this.knownCommands(id);
    if (outcome.status !== "saved" && receipt.phase !== "not-submitted") {
      if (!this.deps.store.saveReceipts(id, [{ command: receipt.command, phase: "not-submitted" }])) {
        const message = "This device could not record that nothing was sent. Use Check outcome to finish.";
        this.refreshPending();
        this.set({ ...this.current, message });
        return { status: "unknown", message };
      }
    }
    const commands = "commands" in outcome ? outcome.commands : undefined;
    if (commands !== undefined) {
      if (!containsKnown(commands, known)) {
        const message =
          "Google's log does not include every checkpoint known on this device. Your copy and the unsent command were kept. Review the workbook before saving again.";
        this.refreshPending();
        this.set({ ...this.current, ready: false, suspect: true, message });
        return { status: "unknown", message };
      }
      // An absent log stays uninitialised; only a log that exists (or one that was saved) is remembered as initialized.
      const initialized =
        observedInitialized ?? (outcome.status === "saved" || this.current.initialized || commands.length > 0);
      const kept = !initialized && commands.length === 0 ? "saved" : this.persistCopy(id, commands, initialized);
      if (kept !== "saved") {
        // Nothing is lost: the receipt stays until the local copy can be written.
        const message =
          kept === "stale"
            ? "Another window holds newer checkpoint data. Use Check outcome to finish."
            : outcome.status === "saved"
              ? "Saved in Google, but this device could not update its local copy. Use Check outcome to finish."
              : "This device could not update its local copy. Use Check outcome to finish.";
        this.refreshPending();
        this.set({ ...this.current, commands, active: activeCheckpoints(commands), initialized, message });
        return { status: "unknown", message };
      }
      this.set({
        ...this.current,
        commands,
        active: activeCheckpoints(commands),
        initialized,
        cached: false,
        suspect: false,
      });
    }
    const cleared = this.deps.store.saveReceipts(id, []);
    if (!cleared) {
      const message = "A finished save could not be cleared from this device. Use Check outcome.";
      this.refreshPending();
      this.set({ ...this.current, message });
      return { status: "unknown", message };
    }
    this.set({ ...this.current, pending: [], receiptsUnreadable: false, message: "" });
    if (outcome.status === "saved") return { status: "saved", message: "" };
    if (outcome.status === "no-op")
      return { status: "no-change", message: "Nothing to change: that checkpoint is already withdrawn." };
    return { status: outcome.status === "refused" ? "refused" : "not-saved", message: outcome.message };
  }

  /** Reads the unresolved command back from Google. Never submits anything. */
  async checkPending(): Promise<CheckpointWriteResult> {
    if (this.busy)
      return { status: "not-saved", message: "A checkpoint operation is already running. Wait for its outcome." };
    const id = this.workbookId;
    if (id === null) return { status: "not-saved", message: "Connect first." };
    this.busy = true;
    this.sequence++;
    const epoch = this.epoch;
    try {
      const access = await this.deps.access("read");
      if (epoch !== this.epoch) return this.accountChanged();
      if (!access.ok) return { status: "not-saved", message: access.message };
      if (access.workbook.id !== id)
        return {
          status: "not-saved",
          message: "The connected workbook changed. Reconnect to the original workbook to check this save.",
        };
      const held = await this.deps.lock.run(async (): Promise<CheckpointWriteResult> => {
        const stored = this.receiptsOf(id);
        if (stored.unreadable) return { status: "unknown", message: UNREADABLE };
        const receipt = stored.receipts[0];
        if (receipt === undefined) {
          this.set({ ...this.current, pending: [], receiptsUnreadable: false });
          return { status: "no-change", message: "There is no unresolved checkpoint save." };
        }
        if (receipt.phase === "not-submitted") {
          // Known never sent: clean up from the authoritative log, with no need for the command to exist in Google.
          const read = await readCheckpoints(this.deps.rest, access.token, id, this.current.initialized);
          if (epoch !== this.epoch) return this.accountChanged();
          if (read.status !== "ok" && read.status !== "absent")
            return {
              status: "unknown",
              message: "The save outcome could not be checked yet. Keep this page open and try again.",
            };
          const settled = this.resolve(
            id,
            receipt,
            { status: "not-submitted", message: "", commands: read.status === "ok" ? read.commands : [] },
            read.status === "ok",
          );
          return settled.status === "unknown"
            ? settled
            : { status: "no-change", message: "The earlier save was never sent. It is cleared." };
        }
        const outcome = await checkCheckpoint(this.deps.rest, access.token, id, receipt.command, true);
        if (epoch !== this.epoch) return this.accountChanged();
        return this.resolve(id, receipt, outcome);
      });
      if (held.status === "unsupported")
        return {
          status: "not-saved",
          message: "This browser cannot keep several windows from saving at once, so nothing was changed.",
        };
      if (held.status === "busy")
        return {
          status: "not-saved",
          message: "Another window is working on checkpoints. Wait a moment and try again.",
        };
      return held.value;
    } catch {
      return {
        status: "unknown",
        message: "The save outcome could not be checked yet. Keep this page open and try again.",
      };
    } finally {
      this.busy = false;
    }
  }

  /** Plain text of a preserved copy, for copying out of the app. With `masked`, amounts are not included. */
  preservedText(workbookId: string, masked = false): string {
    const entry = this.current.preserved.find((item) => item.workbookId === workbookId);
    if (entry === undefined) return "";
    const amount = (cents: number): string => (masked ? "hidden" : (cents / 100).toFixed(2));
    const confirmed = entry.active.map((item) => `${item.date}\t${amount(item.cents)}\t${item.note}`);
    // A save whose outcome was never confirmed may be the only record of that observation, so it is exported, labelled.
    const unconfirmed = entry.pending.map((command) =>
      command.kind === "add"
        ? `UNCONFIRMED\t${command.date}\t${amount(command.cents)}\t${command.note}`
        : `UNCONFIRMED\twithdraw checkpoint ${command.target}`,
    );
    return [...confirmed, ...unconfirmed].join("\n");
  }
}

/** The user's local calendar date. */
function todayOf(now: Date): IsoDate {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` as IsoDate;
}
