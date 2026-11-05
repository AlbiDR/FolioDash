import type { ConnectOutcome, RestoreOutcome, SessionState, SheetStatus, SignInResult, TidyOutcome, VerifyOutcome, Workbook } from "../../../applications/SessionModel";
import {
  type DirectDeps,
  attachDirect,
  commitDirect,
  ensureWorkbook,
  mirrorStatements,
  type PresentStatement,
  outcomeDirect,
  readAllDirect,
  readDirect,
  refreshView,
  restoreDirect,
  tidyLedgerTab,
} from "../../../adapters/google/DirectLedger";
import type { RestClient } from "../../../adapters/google/Rest";
import type { WorkbookIdentity } from "../../../adapters/google/GoogleWorkbook";
import type { AttachItem } from "../../../applications/LedgerService";
import { type InterpretStatement, verifyRebuild } from "../../../applications/Rebuild";
import { type IsoDate, toIsoDate } from "../../../core/IsoDate";
import { type RawSheet, parseStoredSheet } from "../../../core/RawSheet";
import { EMPTY_LEDGER, type LedgerState } from "../../../core/Ledger";
import type { CheckResult, RecordRequest, RecordResult, RemoteSave } from "../../../applications/ImportModel";
import type { LedgerCache } from "../../../adapters/browser/LedgerCache";
import type { ExpenseCache } from "../../../adapters/browser/ExpenseCache";
import { ExpenseSession } from "./expenseSession";

/** The narrow permission: only files this app creates or the person opens with it. */
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export interface SessionDeps {
  readonly clientId: string;
  readonly workbookIdentity?: WorkbookIdentity;
  /** Re-reads a stored bank statement with today's reader, to prove the ledger can be rebuilt from them. */
  readonly interpret: InterpretStatement;
  /** How a statement is shown in its tab of the person's spreadsheet. */
  readonly present: PresentStatement;
  readonly signIn: (clientId: string, scope: string) => Promise<SignInResult>;
  readonly revoke?: (accessToken: string) => void;
  readonly rest: RestClient;
  readonly cache: LedgerCache;
  readonly expenseCache?: ExpenseCache;
  readonly now: () => number;
  readonly newId: () => string;
  /** How long to wait for quiet before writing the readable tabs, so a run of saves writes them once. */
  readonly quietMilliseconds?: number;
}

const NEEDS: Readonly<Record<Exclude<SheetStatus, "unchecked" | "ok">, string>> = {
  missing: "Your Google Sheet can no longer be opened. It may have been deleted or moved to the bin. This device still has your saved copy.",
  emptied: "Your Google Sheet holds no statements, but this device still has your saved copy.",
  damaged: "Your Google Sheet's records failed their checks, so they were not used. This device still has your saved copy. Nothing was changed.",
  "not-a-ledger": "The spreadsheet found is not a FolioDash ledger, so it was not changed.",
};

/**
 * One person's data on one device: the Google spreadsheet (the record), the saved
 * copy (an accelerator), and the sign-in that connects them. It holds no figure
 * of its own. The sign-in token lives only in this object's memory.
 */
export class Session {
  readonly expenses: ExpenseSession;
  private readonly deps: SessionDeps;
  private current: SessionState;
  private token: { readonly accessToken: string; readonly validUntil: number } | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly background = new Set<Promise<unknown>>();
  // Readable tabs and the summary are written once after a quiet moment, not after every save of a run.
  private pendingTabs = new Map<IsoDate, RawSheet>();
  private pendingView: { readonly workbook: Workbook; readonly state: LedgerState } | null = null;
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  private tidied: string | null = null;
  private generation = 0;
  private signingIn: Promise<Awaited<ReturnType<Session["accessToken"]>>> | null = null;
  private connecting: Promise<ConnectOutcome> | null = null;

  constructor(deps: SessionDeps) {
    this.deps = { ...deps, rest: async (request) => {
      const response = await deps.rest(request);
      if (response.status === 401 && request.headers["Authorization"] === `Bearer ${this.token?.accessToken ?? ""}`) this.token = null;
      return response;
    } };
    const copy = deps.cache.load();
    this.current =
      copy === null
        ? { mode: "signed-out", ledger: EMPTY_LEDGER, workbook: null, syncedAt: null, sheet: "unchecked", trailingRows: 0 }
        : { mode: "device-copy", ledger: copy.ledger, workbook: copy.workbook, syncedAt: copy.syncedAt, sheet: "unchecked", trailingRows: 0 };
    this.expenses = new ExpenseSession({ rest: this.deps.rest, newId: deps.newId, workbookId: this.current.workbook?.id ?? null, today: () => {
      const now = new Date(deps.now());
      const today = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
      if (today === null) throw new Error("The device date is outside the supported range.");
      return today;
    }, ...(deps.expenseCache === undefined ? {} : { cache: deps.expenseCache }), access: async () => {
      if (this.current.workbook === null) return { ok: false, message: "Continue with Google first to create or find your private FolioDash workbook." };
      if (this.current.sheet !== "ok") return { ok: false, message: "Sync and check your Google workbook in Your data before changing expenses." };
      const signed = await this.accessToken();
      return signed.ok ? { ok: true, token: signed.token, workbook: this.current.workbook } : { ok: false, message: SIGN_IN_TEXT[signed.reason] };
    } });
  }

  /** Resolves when the readable tabs written after a save have finished. They never delay a save and never affect it. */
  async idle(): Promise<void> {
    if (this.quietTimer !== null) {
      clearTimeout(this.quietTimer);
      this.quietTimer = null;
    }
    await this.flushViews();
    while (this.background.size > 0) await Promise.allSettled([...this.background]);
  }

  private hasPendingView(): boolean {
    return this.pendingView !== null;
  }

  /** The token, only if it is still valid. Used for background work, which never asks the person to sign in. */
  private validToken(): string | null {
    return this.token !== null && this.deps.now() < this.token.validUntil ? this.token.accessToken : null;
  }

  private queueViews(workbook: Workbook, state: LedgerState, months: readonly { readonly date: IsoDate; readonly sheet: RawSheet }[]): void {
    this.pendingView = { workbook, state };
    for (const month of months) this.pendingTabs.set(month.date, month.sheet);
    if (this.quietTimer !== null) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      this.quietTimer = null;
      this.later(this.flushViews());
    }, this.deps.quietMilliseconds ?? 1500);
  }

  /** Writes the summary and the monthly tabs that are waiting. If Google refuses, they wait for the next chance. */
  private async flushViews(): Promise<void> {
    const view = this.pendingView;
    const token = this.validToken();
    if (view === null || token === null) return;
    const tabs = [...this.pendingTabs.entries()].map(([date, sheet]) => ({ date, sheet }));
    this.pendingView = null;
    this.pendingTabs = new Map();
    // One after the other, so two batches never race to add the same tab.
    const summary = await refreshView(this.deps.rest, token, view.workbook.id, view.state);
    const monthly = await mirrorStatements(this.deps.rest, token, view.workbook.id, tabs, this.deps.present);
    // Whatever Google refused waits for the next chance, together with the summary, which is rewritten with it.
    if ((!summary || !monthly) && !this.hasPendingView()) this.pendingView = view;
    if (!monthly) for (const tab of tabs) if (!this.pendingTabs.has(tab.date)) this.pendingTabs.set(tab.date, tab.sheet);
  }

  private later(work: Promise<unknown>): void {
    this.background.add(work);
    void work.finally(() => {
      this.background.delete(work);
    });
  }

  get state(): SessionState {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(next: SessionState): void {
    this.current = next;
    for (const listener of this.listeners) listener();
  }

  private async accessToken(): Promise<{ readonly ok: true; readonly token: string } | { readonly ok: false; readonly reason: Extract<SignInResult, { ok: false }>["reason"] }> {
    if (this.token !== null && this.deps.now() < this.token.validUntil) return { ok: true, token: this.token.accessToken };
    if (this.signingIn !== null) return this.signingIn;
    const work = this.requestToken();
    this.signingIn = work;
    try {
      return await work;
    } finally {
      if (this.signingIn === work) this.signingIn = null;
    }
  }

  private async requestToken(): ReturnType<Session["accessToken"]> {
    const generation = this.generation;
    let result: SignInResult;
    try {
      result = await this.deps.signIn(this.deps.clientId, DRIVE_FILE_SCOPE);
    } catch {
      result = { ok: false, reason: "unavailable" };
    }
    if (generation !== this.generation) return { ok: false, reason: "closed" };
    if (!result.ok) {
      this.token = null;
      return result;
    }
    // Reused only while Google says it is valid (with a margin), so a run of actions asks once.
    this.token = result.expiresInSeconds === undefined ? null : { accessToken: result.accessToken, validUntil: this.deps.now() + (result.expiresInSeconds - 120) * 1000 };
    return { ok: true, token: result.accessToken };
  }

  private keep(workbook: Workbook, ledger: LedgerState): void {
    this.deps.cache.save({ workbook, ledger, syncedAt: this.deps.now() });
  }

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

  private async connectOnce(): Promise<ConnectOutcome> {
    const generation = this.generation;
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    const ensured = await ensureWorkbook(this.deps.rest, signed.token, this.deps.workbookIdentity);
    if (generation !== this.generation) return { status: "call-failed", failure: "unauthorised" };
    if (ensured.status !== "ready") return { status: "call-failed", failure: ensured.failure };
    return this.load(ensured.workbook, signed.token, ensured.created, generation);
  }

  /** Confirms the saved copy against the spreadsheet. A failed or odd answer never replaces the copy. */
  async refresh(): Promise<ConnectOutcome> {
    if (this.current.workbook === null) return this.connect();
    const generation = this.generation;
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    if (generation !== this.generation) return { status: "call-failed", failure: "unauthorised" };
    return this.load(this.current.workbook, signed.token, false, generation);
  }

  private async load(workbook: Workbook, accessToken: string, created: boolean, generation: number): Promise<ConnectOutcome> {
    const read = await readDirect(this.deps.rest, accessToken, workbook.id);
    if (generation !== this.generation) return { status: "call-failed", failure: "unauthorised" };
    if (this.current.workbook !== null && this.current.workbook.id !== workbook.id) {
      // A newly selected account/workbook cannot inherit the previous feature's private cache.
      this.deps.cache.clear();
      this.expenses.forget();
      this.set({ mode: "online", ledger: EMPTY_LEDGER, workbook, syncedAt: null, sheet: "unchecked", trailingRows: 0 });
    }
    const copy = this.current.ledger;
    const attention = (sheet: Exclude<SheetStatus, "unchecked" | "ok">): ConnectOutcome => {
      // The device copy is left exactly as it was, so it can still be shown and, with consent, restored.
      this.set({ ...this.current, mode: this.current.mode === "signed-out" ? "signed-out" : "online", workbook, sheet });
      return { status: "needs-attention", sheet, message: NEEDS[sheet] };
    };
    switch (read.status) {
      case "call-failed":
        return { status: "call-failed", failure: read.failure };
      case "unrecognised":
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
    this.keep(workbook, read.state);
    this.set({ mode: "online", ledger: read.state, workbook, syncedAt: this.deps.now(), sheet: "ok", trailingRows: read.ignoredTrailingRows });
    if (this.tidied !== workbook.id) {
      this.tidied = workbook.id;
      this.later(tidyLedgerTab(this.deps.rest, accessToken, workbook.id));
    }
    return { status: "connected", created, statements: read.state.snapshots.length, changed };
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
    if (this.expenses.state.pending) return { status: "failed", message: "Check the unresolved expense save or recovery before restoring the workbook." };
    if (ledger.snapshots.length === 0 && !hasExpenses) return { status: "nothing-to-restore" };
    if (sheet !== "missing" && sheet !== "emptied") return { status: "not-needed" };
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    if (ledger.snapshots.length === 0) {
      const ensured = sheet === "missing" ? await ensureWorkbook(this.deps.rest, signed.token, this.deps.workbookIdentity) : workbook === null ? null : { status: "ready" as const, workbook, created: false };
      if (generation !== this.generation) return { status: "failed", message: "The account changed during recovery. Check the original workbook before another attempt." };
      if (ensured === null || ensured.status !== "ready") return { status: "failed", message: "A recovery workbook could not be confirmed. Preserve your expense backup and reconnect before retrying." };
      this.keep(ensured.workbook, ledger);
      this.set({ ...this.current, mode: "online", workbook: ensured.workbook, sheet: "ok", syncedAt: this.deps.now() });
      const restored = await this.expenses.restoreBackup(expenseBackup);
      return restored.status === "saved" ? { status: "restored", workbook: ensured.workbook } : { status: "failed", message: `The workbook connection is ready. ${restored.message} Expense recovery is not confirmed.` };
    }
    const deps: DirectDeps = { rest: this.deps.rest, newRevision: this.deps.newId, ...(this.deps.workbookIdentity === undefined ? {} : { workbookIdentity: this.deps.workbookIdentity }) };
    const result = await restoreDirect(deps, signed.token, ledger, sheet === "emptied" ? workbook : null);
    if (generation !== this.generation) return { status: "failed", message: "The account changed during recovery. Its outcome must be checked in the original workbook." };
    if (result.status !== "restored") {
      return { status: "failed", message: result.status === "not-empty" ? "The spreadsheet already holds statements, so nothing was written." : "The spreadsheet could not be restored. Nothing on this device was changed." };
    }
    this.keep(result.workbook, result.ledger);
    this.set({ mode: "online", ledger: result.ledger, workbook: result.workbook, syncedAt: this.deps.now(), sheet: "ok", trailingRows: 0 });
    // The device copy holds figures only, so a restored sheet has no stored bank statements; the health check says so.
    await refreshView(this.deps.rest, signed.token, result.workbook.id, result.ledger);
    if (sheet === "missing" && hasExpenses) {
      const restored = await this.expenses.restoreBackup(expenseBackup);
      if (restored.status !== "saved") return { status: "failed", message: `Your portfolio figures were restored. Expense recovery is not confirmed: ${restored.message} Keep your expense backup.` };
    }
    return { status: "restored", workbook: result.workbook };
  }

  /**
   * Proves the saved ledger can be rebuilt: every month that has a stored bank
   * statement is replayed with today's rules and compared with the saved figures.
   * It reads only; it never changes the sheet or the saved copy.
   */
  async verifyHistory(): Promise<VerifyOutcome> {
    const { workbook } = this.current;
    if (workbook === null) return { status: "failed", message: "There is no Google Sheet to check yet." };
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    const all = await readAllDirect(this.deps.rest, signed.token, workbook.id);
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

  /**
   * Rewrites the summary and every month's tab from the saved records, in the current
   * layout: typed alike, formatted, and cut to the data plus one empty row and column.
   * Only the views are rewritten; the records are read, never changed.
   */
  async tidySheet(): Promise<TidyOutcome> {
    const { workbook } = this.current;
    if (workbook === null) return { status: "failed", message: "There is no Google Sheet to tidy yet." };
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    const all = await readAllDirect(this.deps.rest, signed.token, workbook.id);
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
    const summary = await refreshView(this.deps.rest, signed.token, workbook.id, all.state);
    const monthly = await mirrorStatements(this.deps.rest, signed.token, workbook.id, months, this.deps.present);
    await tidyLedgerTab(this.deps.rest, signed.token, workbook.id);
    if (!summary || !monthly) return { status: "failed", message: "Google did not accept the change, so your sheet was left as it was. Try again shortly." };
    return { status: "tidied", months: months.length, withoutStatement: all.state.snapshots.length - months.length };
  }

  /** Wipes everything this device holds and signs out. The spreadsheet in Google is not touched. */
  forget(): void {
    this.generation++;
    this.signingIn = null;
    this.connecting = null;
    this.expenses.forget();
    this.deps.cache.clear();
    if (this.token !== null) this.deps.revoke?.(this.token.accessToken);
    this.token = null;
    if (this.quietTimer !== null) clearTimeout(this.quietTimer);
    this.quietTimer = null;
    this.pendingView = null;
    this.pendingTabs = new Map();
    this.tidied = null;
    this.set({ mode: "signed-out", ledger: EMPTY_LEDGER, workbook: null, syncedAt: null, sheet: "unchecked", trailingRows: 0 });
  }

  /** The save port the import screens use. It saves to the spreadsheet and reads the result back. */
  readonly save: RemoteSave = {
    newCommandId: () => this.deps.newId(),

    record: async (request: RecordRequest, commandId: string, expectedRevision: string): Promise<RecordResult> => {
      const { workbook } = this.current;
      if (workbook === null) return { status: "not-saved", message: "Continue with Google first, so there is somewhere to save to." };
      const signed = await this.accessToken();
      if (!signed.ok) return { status: "not-saved", message: SIGN_IN_TEXT[signed.reason] };
      const deps: DirectDeps = { rest: this.deps.rest, newRevision: this.deps.newId };
      const commit = await commitDirect(deps, signed.token, workbook.id, {
        commandId,
        expectedRevision,
        statement: request.statement,
        date: request.date,
        commands: request.commands,
        ...(request.source === undefined ? {} : { source: request.source }),
      });
      switch (commit.status) {
        case "committed":
        case "already-committed":
          return this.readBack(workbook, signed.token, request.source === undefined ? [] : [{ date: request.date, sheet: request.source.sheet }]);
        case "stale":
          return { status: "stale" };
        case "rejected":
          return { status: "rejected", messages: commit.messages };
        case "damaged":
          return { status: "damaged", message: commit.message };
        case "not-committed":
          return { status: "not-saved", message: commit.message };
        case "not-sent":
          return { status: "not-saved", message: NOT_SENT_TEXT[commit.failure] };
        case "refused":
          return { status: "not-saved", message: commit.message };
        case "unknown":
          return { status: "unknown", message: commit.message };
      }
    },

    attach: async (items: readonly AttachItem[], commandId: string, expectedRevision: string): Promise<RecordResult> => {
      const { workbook } = this.current;
      if (workbook === null) return { status: "not-saved", message: "Continue with Google first, so there is somewhere to save to." };
      const signed = await this.accessToken();
      if (!signed.ok) return { status: "not-saved", message: SIGN_IN_TEXT[signed.reason] };
      const deps: DirectDeps = { rest: this.deps.rest, newRevision: this.deps.newId };
      const commit = await attachDirect(deps, signed.token, workbook.id, { commandId, expectedRevision, items });
      switch (commit.status) {
        case "committed":
        case "already-committed":
          return this.readBack(workbook, signed.token, items.map((item) => ({ date: item.date, sheet: item.source.sheet })));
        case "stale":
          return { status: "stale" };
        case "rejected":
          return { status: "rejected", messages: commit.messages };
        case "damaged":
          return { status: "damaged", message: commit.message };
        case "not-committed":
          return { status: "not-saved", message: commit.message };
        case "not-sent":
          return { status: "not-saved", message: NOT_SENT_TEXT[commit.failure] };
        case "refused":
          return { status: "not-saved", message: commit.message };
        case "unknown":
          return { status: "unknown", message: commit.message };
      }
    },

    statementDates: async (): Promise<ReadonlySet<IsoDate> | null> => {
      const { workbook } = this.current;
      if (workbook === null) return null;
      const signed = await this.accessToken();
      if (!signed.ok) return null;
      const all = await readAllDirect(this.deps.rest, signed.token, workbook.id);
      return all.status === "ok" ? new Set(all.sources.map((source) => source.date)) : null;
    },

    check: async (commandId: string): Promise<CheckResult> => {
      const { workbook } = this.current;
      if (workbook === null) return { status: "cannot-tell", message: "There is no spreadsheet to check." };
      const signed = await this.accessToken();
      if (!signed.ok) return { status: "cannot-tell", message: SIGN_IN_TEXT[signed.reason].replace(", so nothing was saved", "") };
      const outcome = await outcomeDirect(this.deps.rest, signed.token, workbook.id, commandId);
      switch (outcome.status) {
        case "not-found":
          return { status: "not-recorded" };
        case "damaged":
          return { status: "cannot-tell", message: `${outcome.message} Do not record anything until it is restored.` };
        case "unreachable":
          return { status: "cannot-tell", message: "The spreadsheet could not be checked. Try again shortly." };
        case "committed": {
          const back = await this.readBack(workbook, signed.token);
          return back.status === "recorded" ? back : { status: "saved-not-reloaded" };
        }
      }
    },
  };

  private async readBack(workbook: Workbook, accessToken: string, mirror: readonly { readonly date: IsoDate; readonly sheet: RawSheet }[] = []): Promise<RecordResult> {
    const generation = this.generation;
    if (this.current.workbook?.id !== workbook.id) return { status: "saved-not-reloaded" };
    const read = await readDirect(this.deps.rest, accessToken, workbook.id);
    if (generation !== this.generation) return { status: "saved-not-reloaded" };
    if (read.status !== "ok") return { status: "saved-not-reloaded" };
    this.keep(workbook, read.state);
    this.set({ mode: "online", ledger: read.state, workbook, syncedAt: this.deps.now(), sheet: "ok", trailingRows: read.ignoredTrailingRows });
    // The readable tab is a convenience; its failure never affects the saved records.
    this.queueViews(workbook, read.state, mirror);
    return { status: "recorded", ledger: read.state };
  }
}

const SIGN_IN_TEXT: Readonly<Record<Extract<SignInResult, { ok: false }>["reason"], string>> = {
  blocked: "The Google window was blocked. Allow pop-ups for this site and try again; nothing was saved.",
  timeout: "Google sign-in took too long. Close the old Google window and try again; nothing was saved.",
  denied: "Permission was declined, so nothing was saved.",
  closed: "The sign-in window was closed, so nothing was saved.",
  unavailable: "Google sign-in could not start, so nothing was saved.",
};

const NOT_SENT_TEXT = {
  unauthorised: "Google rejected the sign-in, so nothing was saved. Try again.",
  forbidden: "Google refused the request, so nothing was saved. Check that you allowed FolioDash to create and manage its own spreadsheet.",
  "not-found": "The spreadsheet could not be opened, so nothing was saved. Open Your data to check it.",
} as const;
