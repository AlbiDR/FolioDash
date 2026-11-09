import type { ExpenseSaveOutcome } from "../../../applications/ExpenseModel";
import type { ExpenseCommand } from "../../../core/WorkExpenses";
import type { IsoDate } from "../../../core/IsoDate";
import type { ExpenseCache } from "../../../adapters/browser/ExpenseCache";
import { checkExpense, containsExpenseCommands, decodeExpenseBackup, encodeExpenseBackup, parseExpenseHistory, readExpenses, refreshExpenseView, restoreExpenses, saveExpense } from "../../../adapters/google/DirectExpenses";
import type { ExpenseHistory } from "../../../adapters/google/DirectExpenses";
import type { RestClient } from "../../../adapters/google/Rest";
import type { Workbook } from "../../../applications/SessionModel";
import { canonicalJson } from "../../../core/CanonicalJson";

type Request = Omit<ExpenseCommand, "id">;
export interface ExpenseSessionState extends ExpenseHistory {
  readonly ready: boolean;
  readonly initialized: boolean;
  readonly message: string;
  readonly pending: boolean;
  readonly cached: boolean;
}
type Access = { readonly ok: true; readonly token: string; readonly workbook: Workbook } | { readonly ok: false; readonly message: string };

/** Feature-specific state: the shared Google connection is supplied by the app session. */
export class ExpenseSession {
  private current: ExpenseSessionState = { days: [], commands: [], conflicts: [], ready: false, initialized: false, message: "", pending: false, cached: false };
  private readonly listeners = new Set<() => void>();
  private workbookId: string | null = null;
  private pendingCommand: ExpenseCommand | null = null;
  private pendingRestore: string | null = null;
  private epoch = 0;
  private busy = false;
  private sequence = 0;
  private refreshing: Promise<void> | null = null;
  constructor(private readonly deps: { readonly rest: RestClient; readonly cache?: ExpenseCache; readonly newId: () => string; readonly access: (purpose: "read" | "write") => Promise<Access>; readonly workbookId?: string | null; readonly today?: () => IsoDate; readonly onViewResult?: (updated: boolean) => void }) {
    const copy = deps.cache?.load();
    if (copy !== null && copy !== undefined && (deps.workbookId === undefined || deps.workbookId === copy.workbookId)) {
      const history = parseExpenseHistory(copy.commands);
      if (history !== null) {
        this.workbookId = copy.workbookId;
        this.pendingCommand = copy.pending;
        this.pendingRestore = copy.pendingRestore ?? null;
        const pending = this.pendingCommand !== null || this.pendingRestore !== null;
        this.current = { ...history, initialized: copy.initialized, ready: true, cached: true, pending, message: !pending ? "Showing this device's saved expense copy. Connect to check Google." : "A previous save needs checking. Its outcome will be reconciled before another write." };
      }
    }
  }
  get state(): ExpenseSessionState { return this.current; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private set(next: ExpenseSessionState): void { this.current = next; for (const listener of this.listeners) listener(); }
  private keep(): void {
    if (this.workbookId !== null) this.deps.cache?.save({ workbookId: this.workbookId, commands: this.current.commands, initialized: this.current.initialized, pending: this.pendingCommand, pendingRestore: this.pendingRestore });
  }
  forget(): void {
    this.epoch++;
    this.workbookId = null;
    this.pendingCommand = null;
    this.pendingRestore = null;
    this.refreshing = null;
    this.deps.cache?.clear();
    this.set({ days: [], commands: [], conflicts: [], ready: false, initialized: false, message: "", pending: false, cached: false });
  }
  refresh(): Promise<void> {
    if (this.refreshing !== null) return this.refreshing;
    const epoch = this.epoch;
    const refresh = this.load().catch(() => {
      if (epoch === this.epoch) this.set({ ...this.current, ready: false, message: "Your expense records could not be checked against Google. Your backup and device copy were preserved; connect and check again." });
    });
    this.refreshing = refresh;
    void refresh.then(() => { if (this.refreshing === refresh) this.refreshing = null; });
    return refresh;
  }
  private async load(): Promise<void> {
    if (this.busy) return;
    const sequence = ++this.sequence;
    const epoch = this.epoch;
    const access = await this.deps.access("read");
    if (epoch !== this.epoch || sequence !== this.sequence) return;
    if (!access.ok) { this.set({ ...this.current, ready: false, message: access.message }); return; }
    if (this.workbookId !== null && this.workbookId !== access.workbook.id) this.forget();
    this.workbookId = access.workbook.id;
    const readEpoch = this.epoch;
    const result = await readExpenses(this.deps.rest, access.token, access.workbook.id, this.current.initialized);
    if (readEpoch !== this.epoch || sequence !== this.sequence) return;
    if (result.status === "ok") {
      if (!this.containsKnownHistory(result.commands)) {
        this.set({ ...this.current, ready: false, message: "Google is missing or has changed expense history already saved on this device. Your copy was preserved. Download a backup and review the workbook before another write." });
        return;
      }
      this.set({ ...result, ready: true, cached: false, message: "", pending: this.pendingCommand !== null || this.pendingRestore !== null });
      this.keep();
    } else if (result.status === "absent") {
      this.set({ days: [], commands: [], conflicts: [], ready: true, initialized: false, message: "", pending: this.pendingCommand !== null || this.pendingRestore !== null, cached: false });
      this.keep();
    } else this.set({ ...this.current, ready: false, message: result.message });
  }
  async save(request: Request): Promise<ExpenseSaveOutcome> {
    if (this.busy) return { status: "not-saved", message: "An expense operation is already running. Wait for its outcome." };
    this.busy = true;
    this.sequence++;
    const epoch = this.epoch;
    try {
      if (this.pendingRestore !== null) return { status: "unknown", message: "Check the unresolved expense recovery before saving a day." };
      const access = await this.deps.access("write");
      if (epoch !== this.epoch) return { status: "unknown", message: "The account changed while checking this save. Reconnect to check the original workbook." };
      if (!access.ok) return { status: "not-saved", message: access.message };
      if (this.workbookId !== null && this.workbookId !== access.workbook.id) return { status: "not-saved", message: "The connected workbook changed. Reload expenses before saving." };
      this.workbookId = access.workbook.id;
      if (this.pendingCommand !== null) {
        const pending = this.pendingCommand;
        const result = await checkExpense(this.deps.rest, access.token, access.workbook.id, pending, this.current.initialized, this.deps.today?.());
        if (epoch !== this.epoch) return { status: "unknown", message: "The account changed. Check the original workbook before trying another write." };
        const accepted = this.accept(result);
        // Checking a previous write never implicitly submits the currently edited form.
        if (canonicalJson({ date: pending.date, amounts: pending.amounts, expectedRevision: pending.expectedRevision }) !== canonicalJson(request)) return { status: "not-saved", message: "The previous save was checked. Review the current day before saving this different draft." };
        return accepted;
      }
      if (!this.current.ready) return { status: "not-saved", message: "Load and check your expense records before saving." };
      this.pendingCommand = { ...request, id: this.deps.newId() };
      this.keep();
      const result = await saveExpense(this.deps.rest, access.token, access.workbook.id, this.pendingCommand, this.current.initialized, this.deps.today?.());
      if (epoch !== this.epoch) return { status: "unknown", message: "The account changed during the save. Check the original workbook before another write." };
      return this.accept(result);
    } catch {
      if (epoch !== this.epoch) return { status: "unknown", message: "The account changed. Check the original workbook before another save." };
      this.set({ ...this.current, pending: this.pendingCommand !== null, message: "The save outcome could not be checked. Keep this draft and check again." });
      this.keep();
      return { status: "unknown", message: this.current.message };
    } finally { this.busy = false; }
  }
  private containsKnownHistory(commands: readonly ExpenseCommand[]): boolean {
    return containsExpenseCommands(commands, this.current.commands);
  }
  private accept(result: ExpenseSaveOutcome): ExpenseSaveOutcome {
    if (result.status === "saved" || result.status === "conflict") {
      const history = "commands" in result ? parseExpenseHistory(result.commands) : null;
      if (history === null || !this.containsKnownHistory(history.commands)) {
        const message = "The returned expense history does not include every known saved correction. Your device copy and original request were preserved. Check the workbook before another write.";
        this.set({ ...this.current, ready: false, pending: this.pendingCommand !== null || this.pendingRestore !== null, message });
        this.keep();
        return { status: "unknown", message };
      }
    }
    if (result.status !== "unknown") this.pendingCommand = null;
    if (result.status === "saved" || result.status === "conflict") {
      const history = "commands" in result ? parseExpenseHistory(result.commands) : null;
      this.set({ ...this.current, ...(history ?? { days: result.days }), initialized: true, ready: true, cached: false, pending: false, message: result.status === "conflict" ? result.message : "" });
    } else this.set({ ...this.current, pending: this.pendingCommand !== null, message: result.message });
    this.keep();
    if (result.status === "saved") this.deps.onViewResult?.(result.viewUpdated);
    return result;
  }
  exportBackup(): string { return encodeExpenseBackup(this.current.commands); }
  async checkPending(): Promise<ExpenseSaveOutcome> {
    if (this.pendingRestore !== null) return this.restoreBackup(this.pendingRestore);
    const pending = this.pendingCommand;
    if (pending === null) return { status: "not-saved", message: "There is no unresolved expense save." };
    return this.save({ date: pending.date, amounts: pending.amounts, expectedRevision: pending.expectedRevision });
  }
  previewBackup(text: string): ExpenseHistory | null {
    try { return decodeExpenseBackup(JSON.parse(text) as unknown); } catch { return null; }
  }
  async restoreBackup(text: string): Promise<ExpenseSaveOutcome> {
    const history = this.previewBackup(text);
    if (history === null) return { status: "not-saved", message: "This expense backup failed its format or integrity checks." };
    if (this.pendingRestore === null && !containsExpenseCommands(history.commands, this.current.commands)) return { status: "not-saved", message: "This backup omits saved corrections already known on this device. Preserve the current expense backup before choosing a recovery source." };
    if (this.pendingRestore !== null) {
      const original = this.previewBackup(this.pendingRestore);
      if (original === null || canonicalJson(original.commands) !== canonicalJson(history.commands)) return { status: "unknown", message: "A different expense recovery is unresolved. Check the original recovery before selecting another backup." };
    }
    if (this.busy || this.pendingCommand !== null) return { status: "not-saved", message: "Resolve the current save before restoring expenses." };
    this.busy = true;
    this.sequence++;
    const epoch = this.epoch;
    try {
      const access = await this.deps.access("write");
      if (epoch !== this.epoch) return { status: "unknown", message: "The account changed. Check the original workbook before continuing recovery." };
      if (!access.ok) return { status: "not-saved", message: access.message };
      if (this.pendingRestore !== null && this.workbookId !== access.workbook.id) return { status: "unknown", message: "The workbook changed. Check the original recovery workbook before continuing." };
      // Recovery may target a newly recreated workbook, but never merges with existing expense history.
      const before = await readExpenses(this.deps.rest, access.token, access.workbook.id);
      if (epoch !== this.epoch) return { status: "unknown", message: "The account changed during recovery. Check the original workbook." };
      if (this.pendingRestore !== null && !(before.status === "ok" && containsExpenseCommands(before.commands, history.commands))) return { status: "unknown", message: "The original recovery is not confirmed yet. Keep the backup and check again; no recovery was resubmitted." };
      this.workbookId = access.workbook.id;
      this.pendingRestore = text;
      this.keep();
      const result = before.status === "ok" && containsExpenseCommands(before.commands, history.commands)
        ? before : await restoreExpenses(this.deps.rest, access.token, access.workbook.id, history.commands);
      if (epoch !== this.epoch) return { status: "unknown", message: "The account changed during recovery. Check the original workbook." };
      if (result.status !== "ok") {
        if (result.status !== "unavailable") this.pendingRestore = null;
        this.set({ ...this.current, pending: this.pendingRestore !== null });
        this.keep();
        return { status: result.status === "unavailable" ? "unknown" : "not-saved", message: "message" in result ? result.message : "Expense recovery could not be confirmed." };
      }
      this.workbookId = access.workbook.id;
      const viewUpdated = await refreshExpenseView(this.deps.rest, access.token, access.workbook.id, result.days, result.conflicts, this.deps.today?.());
      if (epoch !== this.epoch) return { status: "unknown", message: "The account changed after recovery. Check the original workbook." };
      const outcome = { ...result, status: "saved" as const, viewUpdated };
      this.pendingRestore = null;
      return this.accept(outcome);
    } catch {
      if (epoch === this.epoch) { this.set({ ...this.current, pending: this.pendingRestore !== null }); this.keep(); }
      return { status: "unknown", message: "Expense recovery could not be confirmed. Preserve the backup and check the workbook before retrying." };
    } finally { this.busy = false; }
  }
}
