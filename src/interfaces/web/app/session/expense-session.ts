import type { ExpenseSaveOutcome } from "../../../../applications/session/expense-model";
import type { ExpenseCommand } from "../../../../core/expenses/work-expenses";
import {
  checkExpense,
  containsExpenseCommands,
  readExpenses,
  refreshExpenseView,
  restoreExpenses,
  saveExpense,
} from "../../../../adapters/google/direct-expenses";
import { canonicalJson } from "../../../../core/integrity/canonical-json";
import { ExpenseSessionCore } from "./expense/expense-session-core";

type Request = Omit<ExpenseCommand, "id">;

/** Feature-specific state: the shared Google connection is supplied by the app session. */
export class ExpenseSession extends ExpenseSessionCore {
  refresh(purpose: "read" | "background" = "read"): Promise<void> {
    if (this.refreshing !== null) return this.refreshing;
    const epoch = this.epoch;
    const refresh = this.load(purpose).catch(() => {
      if (epoch === this.epoch)
        this.set({
          ...this.current,
          ready: false,
          message:
            "Your expense records could not be checked against Google. Your backup and device copy were preserved; connect and check again.",
        });
    });
    this.refreshing = refresh;
    void refresh.then(() => {
      if (this.refreshing === refresh) this.refreshing = null;
    });
    return refresh;
  }
  private async load(purpose: "read" | "background"): Promise<void> {
    if (this.busy) return;
    const sequence = ++this.sequence;
    const epoch = this.epoch;
    const access = await this.deps.access(purpose);
    if (epoch !== this.epoch || sequence !== this.sequence) return;
    if (!access.ok) {
      this.set({ ...this.current, ready: false, message: access.message });
      return;
    }
    if (this.workbookId !== null && this.workbookId !== access.workbook.id) this.forget();
    this.workbookId = access.workbook.id;
    const readEpoch = this.epoch;
    const result = await readExpenses(this.deps.rest, access.token, access.workbook.id, this.current.initialized);
    if (readEpoch !== this.epoch || sequence !== this.sequence) return;
    if (result.status === "ok") {
      if (!this.containsKnownHistory(result.commands)) {
        this.set({
          ...this.current,
          ready: false,
          message:
            "Google is missing or has changed expense history already saved on this device. Your copy was preserved. Download a backup and review the workbook before another write.",
        });
        return;
      }
      this.set({
        ...result,
        ready: true,
        cached: false,
        message: "",
        pending: this.pendingCommand !== null || this.pendingRestore !== null,
      });
      this.keep();
    } else if (result.status === "absent") {
      this.set({
        days: [],
        commands: [],
        conflicts: [],
        ready: true,
        initialized: false,
        message: "",
        pending: this.pendingCommand !== null || this.pendingRestore !== null,
        cached: false,
      });
      this.keep();
    } else this.set({ ...this.current, ready: false, message: result.message });
  }
  async save(request: Request): Promise<ExpenseSaveOutcome> {
    if (this.busy)
      return { status: "not-saved", message: "An expense operation is already running. Wait for its outcome." };
    this.busy = true;
    this.sequence++;
    const epoch = this.epoch;
    try {
      if (this.pendingRestore !== null)
        return { status: "unknown", message: "Check the unresolved expense recovery before saving a day." };
      const access = await this.deps.access("write");
      if (epoch !== this.epoch)
        return {
          status: "unknown",
          message: "The account changed while checking this save. Reconnect to check the original workbook.",
        };
      if (!access.ok) return { status: "not-saved", message: access.message };
      if (this.workbookId !== null && this.workbookId !== access.workbook.id)
        return { status: "not-saved", message: "The connected workbook changed. Reload expenses before saving." };
      this.workbookId = access.workbook.id;
      if (this.pendingCommand !== null) {
        const pending = this.pendingCommand;
        const result = await checkExpense(
          this.deps.rest,
          access.token,
          access.workbook.id,
          pending,
          this.current.initialized,
          this.deps.today?.(),
        );
        if (epoch !== this.epoch)
          return {
            status: "unknown",
            message: "The account changed. Check the original workbook before trying another write.",
          };
        const accepted = this.accept(result);
        // Checking a previous write never implicitly submits the currently edited form.
        if (
          canonicalJson({
            date: pending.date,
            amounts: pending.amounts,
            expectedRevision: pending.expectedRevision,
          }) !== canonicalJson(request)
        )
          return {
            status: "not-saved",
            message: "The previous save was checked. Review the current day before saving this different draft.",
          };
        return accepted;
      }
      if (!this.current.ready)
        return { status: "not-saved", message: "Load and check your expense records before saving." };
      this.pendingCommand = { ...request, id: this.deps.newId() };
      this.keep();
      const result = await saveExpense(
        this.deps.rest,
        access.token,
        access.workbook.id,
        this.pendingCommand,
        this.current.initialized,
        this.deps.today?.(),
      );
      if (epoch !== this.epoch)
        return {
          status: "unknown",
          message: "The account changed during the save. Check the original workbook before another write.",
        };
      return this.accept(result);
    } catch {
      if (epoch !== this.epoch)
        return { status: "unknown", message: "The account changed. Check the original workbook before another save." };
      this.set({
        ...this.current,
        pending: this.pendingCommand !== null,
        message: "The save outcome could not be checked. Keep this draft and check again.",
      });
      this.keep();
      return { status: "unknown", message: this.current.message };
    } finally {
      this.busy = false;
    }
  }
  async checkPending(): Promise<ExpenseSaveOutcome> {
    if (this.pendingRestore !== null) return this.restoreBackup(this.pendingRestore);
    const pending = this.pendingCommand;
    if (pending === null) return { status: "not-saved", message: "There is no unresolved expense save." };
    return this.save({ date: pending.date, amounts: pending.amounts, expectedRevision: pending.expectedRevision });
  }
  async restoreBackup(text: string): Promise<ExpenseSaveOutcome> {
    const history = this.previewBackup(text);
    if (history === null)
      return { status: "not-saved", message: "This expense backup failed its format or integrity checks." };
    if (this.pendingRestore === null && !containsExpenseCommands(history.commands, this.current.commands))
      return {
        status: "not-saved",
        message:
          "This backup omits saved corrections already known on this device. Preserve the current expense backup before choosing a recovery source.",
      };
    if (this.pendingRestore !== null) {
      const original = this.previewBackup(this.pendingRestore);
      if (original === null || canonicalJson(original.commands) !== canonicalJson(history.commands))
        return {
          status: "unknown",
          message:
            "A different expense recovery is unresolved. Check the original recovery before selecting another backup.",
        };
    }
    if (this.busy || this.pendingCommand !== null)
      return { status: "not-saved", message: "Resolve the current save before restoring expenses." };
    this.busy = true;
    this.sequence++;
    const epoch = this.epoch;
    try {
      const access = await this.deps.access("write");
      if (epoch !== this.epoch)
        return {
          status: "unknown",
          message: "The account changed. Check the original workbook before continuing recovery.",
        };
      if (!access.ok) return { status: "not-saved", message: access.message };
      if (this.pendingRestore !== null && this.workbookId !== access.workbook.id)
        return {
          status: "unknown",
          message: "The workbook changed. Check the original recovery workbook before continuing.",
        };
      // Recovery may target a newly recreated workbook, but never merges with existing expense history.
      const before = await readExpenses(this.deps.rest, access.token, access.workbook.id);
      if (epoch !== this.epoch)
        return { status: "unknown", message: "The account changed during recovery. Check the original workbook." };
      if (
        this.pendingRestore !== null &&
        !(before.status === "ok" && containsExpenseCommands(before.commands, history.commands))
      )
        return {
          status: "unknown",
          message:
            "The original recovery is not confirmed yet. Keep the backup and check again; no recovery was resubmitted.",
        };
      // A failed preflight read has not submitted a recovery write.
      if (before.status !== "ok" && before.status !== "absent") return { status: "not-saved", message: before.message };
      this.workbookId = access.workbook.id;
      this.pendingRestore = text;
      this.keep();
      const result =
        before.status === "ok" && containsExpenseCommands(before.commands, history.commands)
          ? before
          : await restoreExpenses(this.deps.rest, access.token, access.workbook.id, history.commands);
      if (epoch !== this.epoch)
        return { status: "unknown", message: "The account changed during recovery. Check the original workbook." };
      if (result.status !== "ok") {
        if (result.status !== "unavailable") this.pendingRestore = null;
        this.set({ ...this.current, pending: this.pendingRestore !== null });
        this.keep();
        return {
          status: result.status === "unavailable" ? "unknown" : "not-saved",
          message: "message" in result ? result.message : "Expense recovery could not be confirmed.",
        };
      }
      this.workbookId = access.workbook.id;
      const viewUpdated = await refreshExpenseView(
        this.deps.rest,
        access.token,
        access.workbook.id,
        result.days,
        result.conflicts,
        this.deps.today?.(),
      );
      if (epoch !== this.epoch)
        return { status: "unknown", message: "The account changed after recovery. Check the original workbook." };
      const outcome = { ...result, status: "saved" as const, viewUpdated };
      this.pendingRestore = null;
      return this.accept(outcome);
    } catch {
      if (epoch === this.epoch) {
        this.set({ ...this.current, pending: this.pendingRestore !== null });
        this.keep();
      }
      return {
        status: "unknown",
        message: "Expense recovery could not be confirmed. Preserve the backup and check the workbook before retrying.",
      };
    } finally {
      this.busy = false;
    }
  }
}
