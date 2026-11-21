import type { ExpenseSaveOutcome } from "../../../../../applications/session/expense-model";
import type { ExpenseCommand } from "../../../../../core/expenses/work-expenses";
import type { IsoDate } from "../../../../../core/values/iso-date";
import type { ExpenseCache } from "../../../../../adapters/browser/storage/expense-cache";
import {
  containsExpenseCommands,
  decodeExpenseBackup,
  encodeExpenseBackup,
  parseExpenseHistory,
} from "../../../../../adapters/google/direct-expenses";
import type { ExpenseHistory } from "../../../../../adapters/google/direct-expenses";
import type { RestClient } from "../../../../../adapters/google/rest";
import type { Workbook } from "../../../../../applications/session/session-model";

export interface ExpenseSessionState extends ExpenseHistory {
  readonly ready: boolean;
  readonly initialized: boolean;
  readonly message: string;
  readonly pending: boolean;
  readonly cached: boolean;
}
type Access =
  | { readonly ok: true; readonly token: string; readonly workbook: Workbook }
  | { readonly ok: false; readonly message: string };

/** The state of the expense session and the bookkeeping that every operation shares: the copy, the guards, `set`, `keep` and `accept`. */
export abstract class ExpenseSessionCore {
  protected current: ExpenseSessionState = {
    days: [],
    commands: [],
    conflicts: [],
    ready: false,
    initialized: false,
    message: "",
    pending: false,
    cached: false,
  };
  protected readonly listeners = new Set<() => void>();
  protected workbookId: string | null = null;
  protected pendingCommand: ExpenseCommand | null = null;
  protected pendingRestore: string | null = null;
  protected epoch = 0;
  protected busy = false;
  protected sequence = 0;
  protected refreshing: Promise<void> | null = null;
  constructor(
    protected readonly deps: {
      readonly rest: RestClient;
      readonly cache?: ExpenseCache;
      readonly newId: () => string;
      readonly access: (purpose: "read" | "write" | "background") => Promise<Access>;
      readonly workbookId?: string | null;
      readonly today?: () => IsoDate;
      readonly onViewResult?: (updated: boolean) => void;
    },
  ) {
    const copy = deps.cache?.load();
    if (copy !== null && copy !== undefined && (deps.workbookId === undefined || deps.workbookId === copy.workbookId)) {
      const history = parseExpenseHistory(copy.commands);
      if (history !== null) {
        this.workbookId = copy.workbookId;
        this.pendingCommand = copy.pending;
        this.pendingRestore = copy.pendingRestore ?? null;
        const pending = this.pendingCommand !== null || this.pendingRestore !== null;
        this.current = {
          ...history,
          initialized: copy.initialized,
          ready: true,
          cached: true,
          pending,
          message: pending
            ? "A previous save needs checking. Its outcome will be reconciled before another write."
            : "",
        };
      }
    }
  }
  get state(): ExpenseSessionState {
    return this.current;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  protected set(next: ExpenseSessionState): void {
    this.current = next;
    for (const listener of this.listeners) listener();
  }
  protected keep(): void {
    if (this.workbookId !== null)
      this.deps.cache?.save({
        workbookId: this.workbookId,
        commands: this.current.commands,
        initialized: this.current.initialized,
        pending: this.pendingCommand,
        pendingRestore: this.pendingRestore,
      });
  }
  forget(): void {
    this.epoch++;
    this.workbookId = null;
    this.pendingCommand = null;
    this.pendingRestore = null;
    this.refreshing = null;
    this.deps.cache?.clear();
    this.set({
      days: [],
      commands: [],
      conflicts: [],
      ready: false,
      initialized: false,
      message: "",
      pending: false,
      cached: false,
    });
  }
  /** Only the confirmed workbook-recovery journey may carry the device history to a replacement. */
  prepareWorkbookRecovery(workbookId: string): boolean {
    if (this.busy || this.pendingCommand !== null || this.pendingRestore !== null) return false;
    this.sequence++;
    this.refreshing = null;
    this.workbookId = workbookId;
    this.set({
      ...this.current,
      ready: false,
      cached: true,
      message:
        "Your expense copy is preserved. Restore it into the replacement workbook before recording new expenses.",
    });
    this.keep();
    return true;
  }
  protected containsKnownHistory(commands: readonly ExpenseCommand[]): boolean {
    return containsExpenseCommands(commands, this.current.commands);
  }
  protected accept(result: ExpenseSaveOutcome): ExpenseSaveOutcome {
    if (result.status === "saved" || result.status === "conflict") {
      const history = "commands" in result ? parseExpenseHistory(result.commands) : null;
      if (history === null || !this.containsKnownHistory(history.commands)) {
        const message =
          "The returned expense history does not include every known saved correction. Your device copy and original request were preserved. Check the workbook before another write.";
        this.set({
          ...this.current,
          ready: false,
          pending: this.pendingCommand !== null || this.pendingRestore !== null,
          message,
        });
        this.keep();
        return { status: "unknown", message };
      }
    }
    if (result.status !== "unknown") this.pendingCommand = null;
    if (result.status === "saved" || result.status === "conflict") {
      const history = "commands" in result ? parseExpenseHistory(result.commands) : null;
      this.set({
        ...this.current,
        ...(history ?? { days: result.days }),
        initialized: true,
        ready: true,
        cached: false,
        pending: false,
        message: result.status === "conflict" ? result.message : "",
      });
    } else this.set({ ...this.current, pending: this.pendingCommand !== null, message: result.message });
    this.keep();
    if (result.status === "saved") this.deps.onViewResult?.(result.viewUpdated);
    return result;
  }
  exportBackup(): string {
    return encodeExpenseBackup(this.current.commands);
  }
  previewBackup(text: string): ExpenseHistory | null {
    try {
      return decodeExpenseBackup(JSON.parse(text) as unknown);
    } catch {
      return null;
    }
  }
}
