import { includesKnown, readCheckpoints } from "../../../../../adapters/google/direct-checkpoints";
import type {
  CheckpointCopy,
  CheckpointLock,
  CheckpointReceipt,
  CheckpointStore,
} from "../../../../../adapters/browser/storage/checkpoint-store";
import type { RestClient } from "../../../../../adapters/google/rest";
import type { Workbook } from "../../../../../applications/session/session-model";
import { type Checkpoint, type CheckpointCommand, activeCheckpoints } from "../../../../../core/portfolio/checkpoints";
import type { IsoDate } from "../../../../../core/values/iso-date";

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

export const EMPTY: CheckpointSessionState = {
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
export const UNREADABLE =
  "This device's record of a checkpoint save in progress could not be read, so nothing can be saved. It was left untouched. Reload, or use Forget this device only if you accept losing it.";

/** Every command the device knows must still be in the other list, with the same content. */
export function containsKnown(remote: readonly CheckpointCommand[], known: readonly CheckpointCommand[]): boolean {
  return includesKnown(remote, known);
}

/** The state of the checkpoint session and what every operation shares: the device copy, the guards, `set`, `load` and the bookkeeping around them. */
export abstract class CheckpointSessionCore {
  protected current: CheckpointSessionState;
  protected readonly listeners = new Set<() => void>();
  protected workbookId: string | null;
  protected epoch = 0;
  protected sequence = 0;
  protected busy = false;
  protected refreshing: Promise<void> | null = null;

  constructor(
    protected readonly deps: {
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
  protected set(next: CheckpointSessionState): void {
    this.current = { ...next, generation: this.epoch };
    for (const listener of this.listeners) listener();
  }

  /** What the device holds for one workbook. Unreadable is reported, never mistaken for empty. */
  protected receiptsOf(id: string): { readonly receipts: readonly CheckpointReceipt[]; readonly unreadable: boolean } {
    const read = this.deps.store.loadReceipts(id);
    return read.status === "present"
      ? { receipts: read.receipts, unreadable: false }
      : { receipts: [], unreadable: read.status === "unreadable" };
  }

  /**
   * Loads what this device holds. Copies bound to the connected workbook become the current log; every
   * other copy is preserved read-only, with its unresolved command, and nothing here overwrites it.
   */
  protected hydrate(): CheckpointSessionState {
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
  /**
   * Stores a log as the device copy only if it still holds everything the device already stored. Another
   * window may have saved since this one read, and an older view must never replace a newer copy.
   */
  protected persistCopy(
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
  protected knownCommands(id: string): readonly CheckpointCommand[] {
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
  protected adopt(id: string, commands: readonly CheckpointCommand[]): string | null {
    if (!containsKnown(commands, this.knownCommands(id))) return null;
    const initialized = this.current.initialized || commands.length > 0;
    const kept = initialized ? this.persistCopy(id, commands, true) : "saved";
    this.set({ ...this.current, commands, active: activeCheckpoints(commands), initialized });
    return kept === "saved"
      ? null
      : "This device could not update its local copy of your checkpoints. They are safe in Google.";
  }

  protected async load(): Promise<void> {
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
  protected accountChanged(): CheckpointWriteResult {
    return {
      status: "unknown",
      message: "The account changed while saving. Check the original workbook before another save.",
    };
  }
  protected refreshPending(): void {
    if (this.workbookId === null) return;
    const own = this.receiptsOf(this.workbookId);
    this.set({
      ...this.current,
      pending: own.receipts.map((receipt) => receipt.command),
      receiptsUnreadable: own.unreadable,
    });
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
