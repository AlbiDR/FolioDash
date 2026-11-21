import type {
  ConnectOutcome,
  RestoreOutcome,
  SheetStatus,
  VerifyOutcome,
  Workbook,
} from "../../../../../applications/session/session-model";
import {
  type DirectDeps,
  ensureWorkbook,
  readAllDirect,
  readDirect,
  refreshView,
  restoreDirect,
  tidyLedgerTab,
} from "../../../../../adapters/google/direct-ledger";
import { verifyRebuild } from "../../../../../applications/import/rebuild";
import type { IsoDate } from "../../../../../core/values/iso-date";
import type { RawSheet } from "../../../../../core/statements/raw-sheet";
import { canonicalJson } from "../../../../../core/integrity/canonical-json";
import { EMPTY_LEDGER } from "../../../../../core/portfolio/ledger";
import type { RecordResult } from "../../../../../applications/import/import-model";
import { NEEDS, WRITE_MINIMUM_MILLISECONDS } from "./session-policy";
import { SessionTidy } from "./session-tidy";

const AUTO_CHECK_MINIMUM_MILLISECONDS = 30_000;

/** Reading the spreadsheet: connecting, loading, refreshing, restoring from the device copy and checking the history. */
export abstract class SessionSync extends SessionTidy {
  protected syncSequence = 0;
  protected freshness: Promise<void> | null = null;
  protected verifying: Promise<VerifyOutcome> | null = null;

  /** Signs in, finds or creates the spreadsheet, and loads the ledger. This is the whole of getting started. */
  async connect(): Promise<ConnectOutcome> {
    if (this.connecting !== null) return this.connecting;
    const work = this.connectOnce();
    this.connecting = work;
    try {
      return await work;
    } finally {
      if (this.connecting === work) this.connecting = null;
    }
  }

  protected async connectOnce(): Promise<ConnectOutcome> {
    const generation = this.generation;
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    const ensured = await ensureWorkbook(this.deps.rest, signed.token, this.deps.workbookIdentity);
    if (generation !== this.generation) return { status: "superseded" };
    if (ensured.status !== "ready") return { status: "call-failed", failure: ensured.failure };
    return this.load(ensured.workbook, signed.token, ensured.created, generation);
  }

  /** Confirms the saved copy against the spreadsheet. A failed or odd answer never replaces the copy. */
  async refresh(): Promise<ConnectOutcome> {
    if (this.current.workbook === null) return this.connect();
    const generation = this.generation;
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    if (generation !== this.generation) return { status: "superseded" };
    return this.load(this.current.workbook, signed.token, false, generation);
  }

  protected async load(
    workbook: Workbook,
    accessToken: string,
    created: boolean,
    generation: number,
  ): Promise<ConnectOutcome> {
    const sequence = ++this.syncSequence;
    const read = await readDirect(this.deps.rest, accessToken, workbook.id);
    if (generation !== this.generation || sequence !== this.syncSequence) return { status: "superseded" };
    if (this.current.workbook !== null && this.current.workbook.id !== workbook.id) {
      // A newly selected account/workbook cannot inherit the previous feature's private cache.
      this.verifying = null;
      this.deps.cache.clear();
      this.expenses.forget();
      this.set({ mode: "online", ledger: EMPTY_LEDGER, workbook, syncedAt: null, sheet: "unchecked", trailingRows: 0 });
    }
    const copy = this.current.ledger;
    const attention = (sheet: Exclude<SheetStatus, "unchecked" | "ok">): ConnectOutcome => {
      // The device copy is left exactly as it was, so it can still be shown and, with consent, restored.
      this.set({
        ...this.current,
        mode: this.current.mode === "signed-out" ? "signed-out" : "online",
        connection: "connected",
        workbook,
        sheet,
      });
      return { status: "needs-attention", sheet, message: NEEDS[sheet] };
    };
    switch (read.status) {
      case "call-failed":
        this.set({
          ...this.current,
          connection: read.failure === "unauthorised" ? this.unrenewedConnection() : "offline",
        });
        return { status: "call-failed", failure: read.failure };
      case "unrecognised":
        this.set({ ...this.current, connection: "offline" });
        return { status: "call-failed", failure: "unexpected" };
      case "workbook-unavailable":
        return attention("missing");
      case "damaged":
        return attention("damaged");
      case "refused":
        return attention("not-a-ledger");
      case "ok":
        break;
    }
    if (read.state.snapshots.length === 0 && copy.snapshots.length > 0) return attention("emptied");
    const changed = read.state.revision !== copy.revision;
    // Only reuse an identical copy after checking the authoritative rows. A revision alone cannot validate a device copy.
    const ledger = !changed && canonicalJson(copy) === canonicalJson(read.state) ? copy : read.state;
    this.keep(workbook, ledger);
    this.set({
      mode: "online",
      connection: "connected",
      ledger,
      workbook,
      syncedAt: this.deps.now(),
      sheet: "ok",
      trailingRows: read.ignoredTrailingRows,
      recoveryTarget: read.recoveryTarget ?? null,
    });
    if (this.tidied !== workbook.id) {
      this.tidied = workbook.id;
      this.later(tidyLedgerTab(this.deps.rest, accessToken, workbook.id));
    }
    this.later(this.scheduleOrganization(workbook, accessToken, ledger, generation));
    if (this.pendingView !== null && !this.organizationPending) this.queueViews(workbook, ledger, []);
    this.refreshFeatures();
    return {
      status: "connected",
      created,
      statements: read.state.snapshots.length,
      changed,
    };
  }

  protected refreshFeatures(): void {
    this.later(Promise.all([this.expenses.refresh("background"), this.checkpoints.refresh("background")]));
  }

  /** A bounded read using existing access. Background work never opens OAuth or creates a workbook. */
  refreshIfNeeded(): Promise<void> {
    if (this.freshness !== null) return this.freshness;
    if (this.current.workbook === null || this.deps.now() - this.lastAutoCheck < AUTO_CHECK_MINIMUM_MILLISECONDS)
      return Promise.resolve();
    // Google's window is open: the renewal in progress will bring its own check.
    if (this.signingIn !== null) return Promise.resolve();
    const token = this.validToken();
    if (token === null) {
      this.dropToken();
      const connection = this.unrenewedConnection();
      if (this.current.connection !== connection) this.set({ ...this.current, connection });
      return Promise.resolve();
    }
    this.lastAutoCheck = this.deps.now();
    const generation = this.generation;
    const workbook = this.current.workbook;
    const work = this.load(workbook, token, false, generation)
      .then(() => undefined)
      .catch(() => {
        if (generation === this.generation) this.set({ ...this.current, connection: "offline" });
      });
    this.freshness = work;
    void work.finally(() => {
      if (this.freshness === work) this.freshness = null;
    });
    return work;
  }

  /**
   * Re-creates the spreadsheet, or refills an empty one, from this device's copy.
   * It only runs after the person confirms, and it never mixes two histories.
   */
  async restoreFromDevice(): Promise<RestoreOutcome> {
    const generation = this.generation;
    const { ledger, sheet, workbook } = this.current;
    const expenseBackup = this.expenses.exportBackup();
    const hasExpenses = this.expenses.state.commands.length > 0;
    if (this.expenses.state.pending)
      return {
        status: "failed",
        message: "Check the unresolved expense save or recovery before restoring the workbook.",
      };
    if (ledger.snapshots.length === 0 && !hasExpenses) return { status: "nothing-to-restore" };
    if (sheet !== "missing" && sheet !== "emptied") return { status: "not-needed" };
    const signed = await this.accessToken(WRITE_MINIMUM_MILLISECONDS);
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    if (ledger.snapshots.length === 0) {
      const ensured =
        sheet === "missing"
          ? await ensureWorkbook(this.deps.rest, signed.token, this.deps.workbookIdentity)
          : workbook === null
            ? null
            : { status: "ready" as const, workbook, created: false };
      if (generation !== this.generation)
        return {
          status: "failed",
          message: "The account changed during recovery. Check the original workbook before another attempt.",
        };
      if (ensured === null || ensured.status !== "ready")
        return {
          status: "failed",
          message:
            "A recovery workbook could not be confirmed. Preserve your expense backup and reconnect before retrying.",
        };
      if (!this.expenses.prepareWorkbookRecovery(ensured.workbook.id))
        return {
          status: "failed",
          message:
            "An expense operation is still running. Preserve your backup and check its outcome before continuing recovery.",
        };
      this.keep(ensured.workbook, ledger);
      this.set({
        ...this.current,
        mode: "online",
        workbook: ensured.workbook,
        sheet: "ok",
        syncedAt: this.deps.now(),
      });
      const restored = await this.expenses.restoreBackup(expenseBackup);
      if (generation === this.generation) this.refreshFeatures();
      return restored.status === "saved"
        ? { status: "restored", workbook: ensured.workbook }
        : {
            status: "failed",
            message: `The workbook connection is ready. ${restored.message} Expense recovery is not confirmed.`,
          };
    }
    const deps: DirectDeps = {
      rest: this.deps.rest,
      newRevision: this.deps.newId,
      ...(this.deps.workbookIdentity === undefined ? {} : { workbookIdentity: this.deps.workbookIdentity }),
    };
    const result = await restoreDirect(deps, signed.token, ledger, sheet === "emptied" ? workbook : null);
    if (generation !== this.generation)
      return {
        status: "failed",
        message: "The account changed during recovery. Its outcome must be checked in the original workbook.",
      };
    if (result.status !== "restored") {
      return {
        status: "failed",
        message:
          result.status === "not-empty"
            ? "The spreadsheet already holds statements, so nothing was written."
            : "The spreadsheet could not be restored. Nothing on this device was changed.",
      };
    }
    if (sheet === "missing" && hasExpenses && !this.expenses.prepareWorkbookRecovery(result.workbook.id))
      return {
        status: "failed",
        message:
          "Portfolio figures were restored, but an expense operation is still running. Preserve your backup and check its outcome before continuing expense recovery.",
      };
    this.keep(result.workbook, result.ledger);
    this.set({
      mode: "online",
      ledger: result.ledger,
      workbook: result.workbook,
      syncedAt: this.deps.now(),
      sheet: "ok",
      trailingRows: 0,
    });
    // The device copy holds figures only, so a restored sheet has no stored bank statements; the health check says so.
    await refreshView(this.deps.rest, signed.token, result.workbook.id, result.ledger);
    if (sheet === "missing" && hasExpenses) {
      const restored = await this.expenses.restoreBackup(expenseBackup);
      if (restored.status !== "saved")
        return {
          status: "failed",
          message: `Your portfolio figures were restored. Expense recovery is not confirmed: ${restored.message} Keep your expense backup.`,
        };
    }
    if (generation === this.generation) this.refreshFeatures();
    return { status: "restored", workbook: result.workbook };
  }

  /**
   * Proves the saved ledger can be rebuilt: every month that has a stored bank
   * statement is replayed with today's rules and compared with the saved figures.
   * It reads only; it never changes the sheet or the saved copy.
   */
  verifyHistory(): Promise<VerifyOutcome> {
    if (this.verifying !== null) return this.verifying;
    const work = this.verifyHistoryOnce();
    this.verifying = work;
    const clear = (): void => {
      if (this.verifying === work) this.verifying = null;
    };
    void work.then(clear, clear);
    return work;
  }

  protected async verifyHistoryOnce(): Promise<VerifyOutcome> {
    const generation = this.generation;
    const { workbook } = this.current;
    if (workbook === null) return { status: "failed", message: "There is no Google Sheet to check yet." };
    const currentContext = (): boolean => generation === this.generation && this.current.workbook?.id === workbook.id;
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    if (!currentContext())
      return {
        status: "failed",
        message:
          "The account changed before this check. Check the current account's history instead. Nothing was changed.",
      };
    const all = await readAllDirect(this.deps.rest, signed.token, workbook.id);
    if (!currentContext())
      return {
        status: "failed",
        message:
          "The account changed during this check. Its result was discarded. Check the current account's history instead. Nothing was changed.",
      };
    switch (all.status) {
      case "damaged":
        return { status: "needs-attention", message: `${all.message} Nothing was changed.` };
      case "unavailable":
        return all.failure === "missing" || all.failure === "not-a-ledger"
          ? { status: "needs-attention", message: NEEDS[all.failure === "missing" ? "missing" : "not-a-ledger"] }
          : { status: "failed", message: "Google could not be reached, so nothing was checked." };
      case "ok":
        return { status: "checked", report: verifyRebuild(all.state, all.sources, this.deps.interpret) };
    }
  }

  protected async readBack(
    workbook: Workbook,
    accessToken: string,
    mirror: readonly { readonly date: IsoDate; readonly sheet: RawSheet }[] = [],
  ): Promise<RecordResult> {
    const generation = this.generation;
    const sequence = ++this.syncSequence;
    if (this.current.workbook?.id !== workbook.id) return { status: "saved-not-reloaded" };
    const read = await readDirect(this.deps.rest, accessToken, workbook.id);
    if (generation !== this.generation || sequence !== this.syncSequence) return { status: "saved-not-reloaded" };
    if (read.status !== "ok") return { status: "saved-not-reloaded" };
    this.keep(workbook, read.state);
    this.set({
      mode: "online",
      connection: "connected",
      ledger: read.state,
      workbook,
      syncedAt: this.deps.now(),
      sheet: "ok",
      trailingRows: read.ignoredTrailingRows,
      recoveryTarget: read.recoveryTarget ?? null,
    });
    this.refreshFeatures();
    // The readable tab is a convenience; its failure never affects the saved records.
    this.queueViews(workbook, read.state, mirror);
    return { status: "recorded", ledger: read.state };
  }
}
