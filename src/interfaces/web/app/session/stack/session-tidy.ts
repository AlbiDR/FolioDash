import type { TidyOutcome, Workbook } from "../../../../../applications/session/session-model";
import { readAllDirect, statementTabTitle } from "../../../../../adapters/google/direct-ledger";
import { needsOrganization, writeGridTabs } from "../../../../../adapters/google/google-workbook";
import {
  EXPENSE_VIEW_TITLE,
  containsExpenseCommands,
  expenseView,
  readExpenses,
} from "../../../../../adapters/google/direct-expenses";
import { rawGrid } from "../../../../../applications/ledger/sheet-grid";
import { previousReadableViews, readableView } from "../../../../../applications/ledger/readable-view";
import { VIEW_TAB } from "../../../../../adapters/google/sheets-layout";
import { type IsoDate, toIsoDate } from "../../../../../core/values/iso-date";
import { type RawSheet, parseStoredSheet } from "../../../../../core/statements/raw-sheet";
import type { LedgerState } from "../../../../../core/portfolio/ledger";
import { NEEDS } from "./session-policy";
import { SessionAccess } from "./session-access";

/** The readable spreadsheet views and their organization: queued after a quiet moment, written once, tidied on request. */
export abstract class SessionTidy extends SessionAccess {
  protected pendingTabs = new Map<IsoDate, RawSheet>();
  protected pendingView: { readonly workbook: Workbook; readonly state: LedgerState } | null = null;
  protected quietTimer: ReturnType<typeof setTimeout> | null = null;
  protected tidied: string | null = null;
  protected organizationChecked: string | null = null;
  protected organizationCheck: Promise<void> | null = null;
  protected organizationPending = false;
  protected flushing: Promise<void> | null = null;
  protected organizing: Promise<TidyOutcome> | null = null;

  /** Resolves when the readable tabs written after a save have finished. They never delay a save and never affect it. */
  async idle(): Promise<void> {
    while (this.background.size > 0) await Promise.allSettled([...this.background]);
    if (this.quietTimer !== null) {
      clearTimeout(this.quietTimer);
      this.quietTimer = null;
    }
    await this.flushViews();
    while (this.background.size > 0) await Promise.allSettled([...this.background]);
  }

  protected hasPendingView(): boolean {
    return this.pendingView !== null;
  }

  protected queueViews(
    workbook: Workbook,
    state: LedgerState,
    months: readonly { readonly date: IsoDate; readonly sheet: RawSheet }[],
    organize = false,
  ): void {
    this.organizationPending ||= organize;
    this.pendingView = { workbook, state };
    for (const month of months) this.pendingTabs.set(month.date, month.sheet);
    if (this.quietTimer !== null) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      this.quietTimer = null;
      this.later(this.flushViews());
    }, this.deps.quietMilliseconds ?? 1500);
  }

  protected async scheduleOrganization(
    workbook: Workbook,
    token: string,
    state: LedgerState,
    generation: number,
  ): Promise<void> {
    if (this.organizationPending) {
      this.queueViews(workbook, state, [], true);
      return;
    }
    if (this.organizationChecked === workbook.id || this.organizationCheck !== null) return;
    const work = (async () => {
      const needed = await needsOrganization(this.deps.rest, token, workbook.id);
      if (generation !== this.generation || this.current.workbook?.id !== workbook.id) return;
      if (!needed.ok) {
        this.set({
          ...this.current,
          organization: {
            status: "pending",
            message:
              "Spreadsheet organization could not be checked. It will be checked again when Google is available.",
          },
        });
        return;
      }
      this.organizationChecked = workbook.id;
      if (needed.value) {
        this.set({
          ...this.current,
          organization: {
            status: "pending",
            message: "Your spreadsheet needs the current layout. Organization will run after activity settles.",
          },
        });
        this.queueViews(workbook, state, [], true);
      } else
        this.set({
          ...this.current,
          organization: {
            status: "current",
            message: "The spreadsheet uses the current layout. Saved views are maintained automatically.",
          },
        });
    })();
    this.organizationCheck = work;
    try {
      await work;
    } finally {
      if (this.organizationCheck === work) this.organizationCheck = null;
    }
  }

  /** Serialize maintenance and view writes; refused derived views wait for a later connection/save. */
  protected flushViews(): Promise<void> {
    if (this.flushing !== null) return this.flushing;
    const work = this.writePendingViews();
    this.flushing = work;
    void work.finally(() => {
      if (this.flushing === work) this.flushing = null;
    });
    return work;
  }

  protected async writePendingViews(): Promise<void> {
    const view = this.pendingView;
    const token = this.validToken();
    if (view === null || token === null || this.current.sheet !== "ok") return;
    const generation = this.generation;
    const tabs = [...this.pendingTabs.entries()].map(([date, sheet]) => ({ date, sheet }));
    const full = this.organizationPending;
    this.pendingView = null;
    this.pendingTabs = new Map();
    const result = full
      ? await this.organizeWorkbook(view.workbook, token)
      : await writeGridTabs(this.deps.rest, token, view.workbook.id, [
          { title: VIEW_TAB, grid: readableView(view.state), legacyGrids: () => previousReadableViews(view.state) },
          ...tabs.map((tab) => ({
            title: statementTabTitle(tab.date),
            grid: this.deps.present(tab.sheet),
            legacyGrids: [rawGrid(tab.sheet)],
          })),
        ]);
    if (generation !== this.generation || this.current.workbook?.id !== view.workbook.id) return;
    const success = "status" in result ? result.status === "tidied" : result.ok;
    if (success) {
      if (!full)
        this.set({
          ...this.current,
          organization: {
            status: "preservedTabs" in result && result.preservedTabs ? "needs-attention" : "current",
            message:
              "preservedTabs" in result && result.preservedTabs
                ? "Saved views were refreshed. Unrecognised duplicate candidates were preserved for review."
                : "Saved spreadsheet views were refreshed and organized.",
          },
        });
    } else {
      if (!this.hasPendingView()) this.pendingView = view;
      for (const tab of tabs) if (!this.pendingTabs.has(tab.date)) this.pendingTabs.set(tab.date, tab.sheet);
      const message =
        "message" in result && typeof result.message === "string"
          ? result.message
          : "The readable spreadsheet views could not be refreshed. Saved records are preserved; maintenance will retry on a later connection or save.";
      this.set({ ...this.current, organization: { status: "needs-attention", message } });
    }
  }

  /**
   * Checks both record stores, then rebuilds and organizes their readable views in
   * one atomic batch. Record values and concurrent-write markers are never changed.
   */
  async tidySheet(): Promise<TidyOutcome> {
    const { workbook } = this.current;
    if (workbook === null) return { status: "failed", message: "There is no Google Sheet to tidy yet." };
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    if (this.flushing !== null) await this.flushing;
    const pending = this.pendingView;
    const outcome = await this.organizeWorkbook(workbook, signed.token);
    if (outcome.status === "tidied" && this.pendingView === pending) {
      this.pendingView = null;
      this.pendingTabs = new Map();
      if (this.quietTimer !== null) clearTimeout(this.quietTimer);
      this.quietTimer = null;
    }
    return outcome;
  }

  protected organizeWorkbook(workbook: Workbook, token: string): Promise<TidyOutcome> {
    if (this.organizing !== null) return this.organizing;
    const generation = this.generation;
    const work = this.performOrganization(workbook, token).then((outcome) => {
      if (generation === this.generation && outcome.status !== "tidied") {
        this.organizationPending = true;
        this.set({
          ...this.current,
          organization: {
            status: "needs-attention",
            message: "message" in outcome ? outcome.message : "Spreadsheet organization needs a Google connection.",
          },
        });
      }
      return outcome;
    });
    this.organizing = work;
    void work.finally(() => {
      if (this.organizing === work) this.organizing = null;
    });
    return work;
  }

  protected async performOrganization(workbook: Workbook, token: string): Promise<TidyOutcome> {
    const generation = this.generation;
    const localRevision = this.current.ledger.revision;
    this.set({
      ...this.current,
      organization: { status: "organizing", message: "Organizing your spreadsheet from checked records…" },
    });
    const all = await readAllDirect(this.deps.rest, token, workbook.id);
    if (all.status === "damaged") return { status: "needs-attention", message: `${all.message} Nothing was changed.` };
    if (all.status === "unavailable") {
      return all.failure === "missing" || all.failure === "not-a-ledger"
        ? { status: "needs-attention", message: NEEDS[all.failure === "missing" ? "missing" : "not-a-ledger"] }
        : { status: "failed", message: "Google could not be reached, so nothing was changed." };
    }
    const months = all.sources.flatMap((source) => {
      const sheet = parseStoredSheet(source.sheet);
      return sheet === null ? [] : [{ date: source.date, sheet }];
    });
    const expenses = await readExpenses(this.deps.rest, token, workbook.id, this.expenses.state.initialized);
    if (expenses.status === "damaged" || expenses.status === "unavailable")
      return { status: "needs-attention", message: `${expenses.message} Organization was not started.` };
    if (expenses.status === "ok" && !containsExpenseCommands(expenses.commands, this.expenses.state.commands))
      return {
        status: "needs-attention",
        message:
          "Google is missing expense corrections known on this device. Organization was not started; preserve the device copy and review the workbook.",
      };
    const now = new Date(this.deps.now());
    const today = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    if (today === null)
      return {
        status: "failed",
        message: "The device date is outside the supported range. Organization was not started.",
      };
    if (generation !== this.generation || this.current.workbook?.id !== workbook.id)
      return {
        status: "failed",
        message: "The connected account changed before organization. No layout batch was submitted.",
      };
    const written = await writeGridTabs(
      this.deps.rest,
      token,
      workbook.id,
      [
        { title: VIEW_TAB, grid: readableView(all.state), legacyGrids: () => previousReadableViews(all.state) },
        ...(expenses.status === "ok"
          ? [{ title: EXPENSE_VIEW_TITLE, grid: expenseView(expenses.days, expenses.conflicts, today) }]
          : []),
        ...months.map((month) => ({
          title: statementTabTitle(month.date),
          grid: this.deps.present(month.sheet),
          legacyGrids: [rawGrid(month.sheet)],
        })),
      ],
      { completeOrganization: true },
    );
    if (!written.ok)
      return {
        status: "failed",
        message:
          written.message ??
          "Organization could not be confirmed. Google may have applied the layout if its response was lost. If a tab has an unrecognised or duplicate ownership marker, or an unmarked tab differs from the saved view, it is preserved and organization stops. Check your connection and workbook before trying again. Saved financial records are never rewritten by this action.",
      };
    if (generation === this.generation) {
      this.organizationPending = false;
      this.organizationChecked = workbook.id;
      this.set({
        ...this.current,
        organization: {
          status: written.preservedTabs ? "needs-attention" : "current",
          message: written.preservedTabs
            ? `${String(written.preservedTabs)} unrecognised duplicate candidate(s) were preserved for review. Verified generated views were organized.`
            : `Spreadsheet organized. ${String(written.consolidatedTabs ?? 0)} verified duplicate tab(s) consolidated.`,
        },
      });
    }
    if (
      generation === this.generation &&
      (this.current.ledger.revision !== localRevision ||
        !containsExpenseCommands(expenses.status === "ok" ? expenses.commands : [], this.expenses.state.commands))
    ) {
      this.set({
        ...this.current,
        organization: {
          status: "pending",
          message:
            "A save completed during organization. The newest readable views will be refreshed after activity settles.",
        },
      });
      this.queueViews(workbook, this.current.ledger, [], true);
    }
    return {
      status: "tidied",
      months: months.length,
      withoutStatement: all.state.snapshots.length - months.length,
      ...(written.consolidatedTabs ? { consolidatedTabs: written.consolidatedTabs } : {}),
      ...(written.preservedTabs ? { preservedTabs: written.preservedTabs } : {}),
    };
  }
}
