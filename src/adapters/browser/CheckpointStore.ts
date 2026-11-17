import { canonicalJson } from "../../core/CanonicalJson";
import { type CheckpointCommand, parseCheckpointCommand, parseCheckpointHistory } from "../../core/Checkpoints";
import type { KeyValueStore } from "./LedgerCache";

/**
 * What this device keeps of the checkpoint log. Everything is bound to one workbook and sits
 * under a build prefix, so the synthetic acceptance build can never see or touch real copies.
 *
 * Two kinds of record are kept apart on purpose. The history copy is replaced whenever a log is
 * read. A receipt is the command a window is about to send: it lives in its own key so another
 * window refreshing its copy can never erase it. Every write is read back before it is believed,
 * because a full or blocked store must stop a save, not let it go out without a receipt.
 */

const MAX_CHARACTERS = 2_000_000;

export interface CheckpointCopy {
  readonly workbookId: string;
  readonly commands: readonly CheckpointCommand[];
  /** Whether this log was ever seen to exist in the workbook, so its disappearance is reported, not reset. */
  readonly initialized: boolean;
}

/**
 * The command a window is about to send. `sent` means it may have reached Google; `not-submitted` means
 * it is known not to have, so cleaning up needs no trace of it in Google.
 */
export interface CheckpointReceipt {
  readonly command: CheckpointCommand;
  readonly phase: "sent" | "not-submitted";
}

/** What is stored for a workbook. Unreadable is not the same as absent: it must block every write. */
export type ReceiptRead =
  | { readonly status: "none" }
  | { readonly status: "present"; readonly receipts: readonly CheckpointReceipt[] }
  | { readonly status: "unreadable" };

export interface CheckpointStore {
  workbooks(): readonly string[];
  loadCopy(workbookId: string): CheckpointCopy | null;
  /** True only when the copy was written and read back identically. */
  saveCopy(copy: CheckpointCopy): boolean;
  loadReceipts(workbookId: string): ReceiptRead;
  /** True only when the receipts were written and read back identically. An empty list removes them. */
  saveReceipts(workbookId: string, receipts: readonly CheckpointReceipt[]): boolean;
  /** Only the explicit Forget this device or a sign-out removes anything. Removes this build's records only. */
  clearAll(): void;
}

export function createCheckpointStore(open: () => KeyValueStore, prefix: string): CheckpointStore {
  const copyKey = (id: string): string => `${prefix}checkpoints.copy.v1:${id}`;
  const receiptKey = (id: string): string => `${prefix}checkpoints.pending.v1:${id}`;
  const indexKey = `${prefix}checkpoints.index.v1`;
  const store = (): KeyValueStore | null => {
    try {
      return open();
    } catch {
      return null;
    }
  };

  const readIndex = (): string[] => {
    try {
      const value: unknown = JSON.parse(store()?.getItem(indexKey) ?? "[]");
      return Array.isArray(value)
        ? (value as unknown[]).filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
        : [];
    } catch {
      return [];
    }
  };
  const writeVerified = (key: string, text: string): boolean => {
    if (text.length > MAX_CHARACTERS) return false;
    try {
      const target = store();
      if (target === null) return false;
      target.setItem(key, text);
      return target.getItem(key) === text;
    } catch {
      return false;
    }
  };
  const remember = (id: string): boolean => {
    const known = readIndex();
    return known.includes(id) ? true : writeVerified(indexKey, JSON.stringify([...known, id]));
  };

  return {
    workbooks: () => readIndex(),
    loadCopy(workbookId) {
      try {
        const text = store()?.getItem(copyKey(workbookId)) ?? null;
        if (text === null) return null;
        const value: unknown = JSON.parse(text);
        if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
        const record = value as Record<string, unknown>;
        if (
          record["version"] !== 1 ||
          record["workbookId"] !== workbookId ||
          typeof record["initialized"] !== "boolean"
        )
          return null;
        const history = parseCheckpointHistory(record["commands"]);
        return history === null ? null : { workbookId, commands: history.commands, initialized: record["initialized"] };
      } catch {
        return null;
      }
    },
    saveCopy(copy) {
      if (copy.workbookId.trim() === "") return false;
      if (!remember(copy.workbookId)) return false;
      return writeVerified(
        copyKey(copy.workbookId),
        canonicalJson({
          version: 1,
          workbookId: copy.workbookId,
          initialized: copy.initialized,
          commands: copy.commands,
        }),
      );
    },
    loadReceipts(workbookId) {
      try {
        const target = store();
        if (target === null) return { status: "unreadable" };
        const text = target.getItem(receiptKey(workbookId));
        if (text === null) return { status: "none" };
        const value: unknown = JSON.parse(text);
        if (typeof value !== "object" || value === null || Array.isArray(value)) return { status: "unreadable" };
        const record = value as Record<string, unknown>;
        if (
          record["version"] !== 1 ||
          record["workbookId"] !== workbookId ||
          !Array.isArray(record["receipts"]) ||
          record["receipts"].length === 0
        )
          return { status: "unreadable" };
        const receipts: CheckpointReceipt[] = [];
        for (const raw of record["receipts"] as unknown[]) {
          const entry =
            typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
          const command = entry === null ? null : parseCheckpointCommand(entry["command"]);
          const phase = entry?.["phase"];
          if (command === null || (phase !== "sent" && phase !== "not-submitted")) return { status: "unreadable" };
          receipts.push({ command, phase });
        }
        return { status: "present", receipts };
      } catch {
        return { status: "unreadable" };
      }
    },
    saveReceipts(workbookId, receipts) {
      if (receipts.length === 0) {
        try {
          const target = store();
          if (target === null) return false;
          target.removeItem(receiptKey(workbookId));
          return target.getItem(receiptKey(workbookId)) === null;
        } catch {
          return false;
        }
      }
      if (!remember(workbookId)) return false;
      return writeVerified(receiptKey(workbookId), canonicalJson({ version: 1, workbookId, receipts }));
    },
    clearAll() {
      const target = store();
      if (target === null) return;
      try {
        for (const id of readIndex()) {
          target.removeItem(copyKey(id));
          target.removeItem(receiptKey(id));
        }
        target.removeItem(indexKey);
      } catch {
        /* Storage may be blocked. */
      }
    },
  };
}

export type CheckpointLockResult<T> =
  | { readonly status: "held"; readonly value: T }
  /** Another window of this browser is writing right now. */
  | { readonly status: "busy" }
  /** This browser cannot coordinate windows, so writes are refused. */
  | { readonly status: "unsupported" };

export interface CheckpointLock {
  run<T>(work: () => Promise<T>): Promise<CheckpointLockResult<T>>;
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { readonly ifAvailable: true; readonly mode: "exclusive" },
    callback: (lock: object | null) => Promise<T>,
  ): Promise<T>;
}

/**
 * One exclusive Web Locks section per browser origin: read receipts, persist the receipt, append, check
 * and clear all happen inside it, so two windows cannot interleave. A lock another window holds is not
 * waited for. Without Web Locks nothing is shared safely, so nothing is written.
 */
export function createCheckpointLock(name: string, locks: LockManagerLike | undefined): CheckpointLock {
  return {
    async run<T>(work: () => Promise<T>): Promise<CheckpointLockResult<T>> {
      if (locks === undefined) return { status: "unsupported" };
      try {
        return await locks.request<CheckpointLockResult<T>>(
          name,
          { ifAvailable: true, mode: "exclusive" },
          async (lock) => (lock === null ? { status: "busy" } : { status: "held", value: await work() }),
        );
      } catch {
        return { status: "unsupported" };
      }
    },
  };
}
