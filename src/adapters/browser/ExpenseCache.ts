import type { KeyValueStore } from "./LedgerCache";
import type { ExpenseCommand } from "../../core/WorkExpenses";
import { decodeExpenseBackup, encodeExpenseBackup, parseExpenseHistory } from "../google/DirectExpenses";
import { parseExpenseCommand } from "../../core/WorkExpenses";

export interface ExpenseCopy {
  readonly workbookId: string;
  readonly commands: readonly ExpenseCommand[];
  readonly initialized: boolean;
  readonly pending: ExpenseCommand | null;
  readonly pendingRestore?: string | null;
}

export interface ExpenseCache {
  load(): ExpenseCopy | null;
  save(copy: ExpenseCopy): boolean;
  clear(): void;
}

/** Rebuildable expense history, bound to one workbook. No tokens or original spreadsheets. */
export function createExpenseCache(open: () => KeyValueStore, key = "foliodash.expenses.v1"): ExpenseCache {
  const clear = (): void => { try { open().removeItem(key); } catch { /* Storage may be blocked. */ } };
  return {
    load() {
      try {
        const text = open().getItem(key);
        if (text === null) return null;
        const value: unknown = JSON.parse(text);
        if (typeof value !== "object" || value === null || !("version" in value) || value.version !== 1 || !("workbookId" in value) || typeof value.workbookId !== "string" || !("backup" in value) || !("initialized" in value) || typeof value.initialized !== "boolean") return null;
        const history = decodeExpenseBackup(value.backup);
        if (history === null || value.workbookId.trim() === "" || (!value.initialized && history.commands.length > 0)) return null;
        const rawPending = "pending" in value ? value.pending : null;
        const pending = rawPending === null ? null : parseExpenseCommand(rawPending);
        if (rawPending !== null && pending === null) return null;
        if (pending !== null && parseExpenseHistory([...history.commands, pending]) === null) return null;
        const pendingRestore = "pendingRestore" in value ? value.pendingRestore : null;
        if (pendingRestore !== null && (typeof pendingRestore !== "string" || decodeExpenseBackup(JSON.parse(pendingRestore) as unknown) === null)) return null;
        if (pending !== null && pendingRestore !== null) return null;
        return { workbookId: value.workbookId, commands: history.commands, initialized: value.initialized, pending, pendingRestore };
      } catch { return null; }
    },
    save(copy) {
      try {
        const text = JSON.stringify({ version: 1, workbookId: copy.workbookId, backup: JSON.parse(encodeExpenseBackup(copy.commands)) as unknown, initialized: copy.initialized, pending: copy.pending, pendingRestore: copy.pendingRestore ?? null });
        if (text.length > 2_000_000) return false;
        open().setItem(key, text);
        return true;
      } catch { return false; }
    },
    clear,
  };
}
