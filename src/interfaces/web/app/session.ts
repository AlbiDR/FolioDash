import type { AccountHintStore, ConnectOutcome, GoogleSessionStore, RenewalCoordination, RestoreOutcome, SessionState, SheetStatus, SignInOptions, SignInResult, TidyOutcome, VerifyOutcome, Workbook } from "../../../applications/SessionModel";
import { FRESH_RENEWAL, type RenewalHistory, type RenewalTrigger, afterAttempt, afterReconnectingToNetwork, mayRenewAutomatically, renewalNeedsThePerson, signInOptionsFor } from "../../../applications/RenewalPolicy";
import { fetchAccountHint } from "../../../adapters/google/AccountHint";
import {
  type DirectDeps,
  attachDirect,
  commitDirect,
  ensureWorkbook,
  type PresentStatement,
  outcomeDirect,
  readAllDirect,
  readDirect,
  refreshView,
  restoreDirect,
  tidyLedgerTab,
  statementTabTitle,
} from "../../../adapters/google/DirectLedger";
import type { RestClient } from "../../../adapters/google/Rest";
import { type WorkbookIdentity, needsOrganization, writeGridTabs } from "../../../adapters/google/GoogleWorkbook";
import { containsExpenseCommands, expenseView, EXPENSE_VIEW_TITLE, readExpenses } from "../../../adapters/google/DirectExpenses";
import { rawGrid } from "../../../applications/SheetGrid";
import { readableView, previousReadableViews } from "../../../applications/ReadableView";
import { VIEW_TAB } from "../../../adapters/google/SheetsLayout";
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
  readonly googleSession?: GoogleSessionStore;
  /** Which Google account owns the workbook, so quiet renewal can name it. */
  readonly accountHint?: AccountHintStore;
  /** Keeps several windows of one browser from opening competing Google windows. */
  readonly coordination?: RenewalCoordination;
  readonly workbookIdentity?: WorkbookIdentity;
  /** Re-reads a stored bank statement with today's reader, to prove the ledger can be rebuilt from them. */
  readonly interpret: InterpretStatement;
  /** How a statement is shown in its tab of the person's spreadsheet. */
  readonly present: PresentStatement;
  readonly signIn: (clientId: string, scope: string, options?: SignInOptions) => Promise<SignInResult>;
  readonly revoke?: (accessToken: string) => void;
  readonly rest: RestClient;
  readonly cache: LedgerCache;
  readonly expenseCache?: ExpenseCache;
  readonly now: () => number;
  readonly newId: () => string;
  /** How long to wait for quiet before writing the readable tabs, so a run of saves writes them once. */
  readonly quietMilliseconds?: number;
}

const AUTO_CHECK_MINIMUM_MILLISECONDS = 30_000;
const TOKEN_MAXIMUM_SECONDS = 3600;
const TOKEN_MARGIN_SECONDS = 120;
/** With less than this left, the next click renews access quietly, before it can fail. */
const RENEW_AHEAD_MILLISECONDS = 10 * 60_000;
/**
 * A save reads, appends and reads back. It needs this much left so Google's expiry cannot fall
 * between those requests and leave an outcome unknown. Reads need no more than a valid token.
 */
const WRITE_MINIMUM_MILLISECONDS = 8 * 60_000;

const NEEDS: Readonly<Record<Exclude<SheetStatus, "unchecked" | "ok">, string>> = {
  missing: "Your Google Sheet can no longer be opened. It may have been deleted or moved to the bin. This device still has your saved copy.",
  emptied: "Your Google Sheet holds no statements, but this device still has your saved copy.",
  damaged: "Your Google Sheet's records failed their checks, so they were not used. This device still has your saved copy. Nothing was changed.",
  "not-a-ledger": "The spreadsheet found is not a FolioDash ledger, so it was not changed.",
};

/**
 * One person's data on one device: the Google spreadsheet (the record), the saved
 * copy (an accelerator), and the sign-in that connects them. It holds no figure
 * of its own. Short-lived access is kept on the device and renewed quietly on the
 * person's next click, naming the remembered account, so the connection outlasts
 * Google's one-hour token without asking them to sign in again.
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
  private organizationChecked: string | null = null;
  private organizationCheck: Promise<void> | null = null;
  private organizationPending = false;
  private flushing: Promise<void> | null = null;
  private organizing: Promise<TidyOutcome> | null = null;
  private generation = 0;
  private syncSequence = 0;
  private freshness: Promise<void> | null = null;
  private lastAutoCheck = -Infinity;
  private signingIn: Promise<Awaited<ReturnType<Session["accessToken"]>>> | null = null;
  private connecting: Promise<ConnectOutcome> | null = null;
  private chooserOnNextSignIn = false;
  private renewal: RenewalHistory = FRESH_RENEWAL;
  private hint: string | null;

  constructor(deps: SessionDeps) {
    this.hint = deps.accountHint?.load(deps.clientId) ?? null;
    this.deps = { ...deps, rest: async (request) => {
      const response = await deps.rest(request);
      if (response.status === 401 && request.headers["Authorization"] === `Bearer ${this.token?.accessToken ?? ""}`) {
        this.dropToken();
        this.set({ ...this.current, connection: this.unrenewedConnection() });
      }
      return response;
    } };
    const copy = deps.cache.load();
    this.current =
      copy === null
        ? { mode: "signed-out", ledger: EMPTY_LEDGER, workbook: null, syncedAt: null, sheet: "unchecked", trailingRows: 0 }
        : { mode: "device-copy", ledger: copy.ledger, workbook: copy.workbook, syncedAt: copy.syncedAt, sheet: "unchecked", trailingRows: 0 };
    if (copy !== null) {
      this.token = deps.googleSession?.load(deps.clientId, copy.workbook.id, deps.now()) ?? null;
      // Remembered, but not yet confirmed this visit: the next click renews access if it is missing.
      if (this.token === null) this.current = { ...this.current, connection: "waiting" };
    }
    this.expenses = new ExpenseSession({ rest: this.deps.rest, newId: deps.newId, workbookId: this.current.workbook?.id ?? null, onViewResult: (updated) => {
      if (!updated) {
        this.organizationPending = true;
        this.set({ ...this.current, organization: { status: "pending", message: "Your expense entry is saved. Its readable spreadsheet view will be refreshed on the next connection or save." } });
      } else if (this.organizationPending && this.current.workbook !== null) this.queueViews(this.current.workbook, this.current.ledger, [], true);
    }, today: () => {
      const now = new Date(deps.now());
      const today = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
      if (today === null) throw new Error("The device date is outside the supported range.");
      return today;
    }, ...(deps.expenseCache === undefined ? {} : { cache: deps.expenseCache }), access: async (purpose) => {
      if (this.current.workbook === null) return { ok: false, message: "Continue with Google first to create or find your private FolioDash workbook." };
      // The expenses tab can be opened before the portfolio was checked on this visit. A read checks the workbook
      // itself, as the portfolio does, so Check records works without sending the person to another tab. A write
      // still needs a check that has succeeded.
      if (this.current.sheet !== "ok" && purpose === "read") {
        const outcome = await this.refresh();
        if (outcome.status === "sign-in-failed") return { ok: false, message: SIGN_IN_TEXT[outcome.reason] };
      }
      if (this.current.sheet !== "ok") return { ok: false, message: this.expenseBlockedMessage(purpose) };
      const signed = await this.accessToken(purpose === "write" ? WRITE_MINIMUM_MILLISECONDS : 0);
      return signed.ok ? { ok: true, token: signed.token, workbook: this.current.workbook } : { ok: false, message: SIGN_IN_TEXT[signed.reason] };
    } });
  }

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

  private hasPendingView(): boolean { return this.pendingView !== null; }

  /** The token, only if it is still valid. Used for background work, which never asks the person to sign in. */
  private validToken(): string | null {
    return this.token !== null && this.deps.now() < this.token.validUntil ? this.token.accessToken : null;
  }

  private queueViews(workbook: Workbook, state: LedgerState, months: readonly { readonly date: IsoDate; readonly sheet: RawSheet }[], organize = false): void {
    this.organizationPending ||= organize;
    this.pendingView = { workbook, state };
    for (const month of months) this.pendingTabs.set(month.date, month.sheet);
    if (this.quietTimer !== null) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      this.quietTimer = null;
      this.later(this.flushViews());
    }, this.deps.quietMilliseconds ?? 1500);
  }

  private async scheduleOrganization(workbook: Workbook, token: string, state: LedgerState, generation: number): Promise<void> {
    if (this.organizationPending) { this.queueViews(workbook, state, [], true); return; }
    if (this.organizationChecked === workbook.id || this.organizationCheck !== null) return;
    const work = (async () => {
      const needed = await needsOrganization(this.deps.rest, token, workbook.id);
      if (generation !== this.generation || this.current.workbook?.id !== workbook.id) return;
      if (!needed.ok) {
        this.set({ ...this.current, organization: { status: "pending", message: "Spreadsheet organization could not be checked. It will be checked again when Google is available." } });
        return;
      }
      this.organizationChecked = workbook.id;
      if (needed.value) {
        this.set({ ...this.current, organization: { status: "pending", message: "Your spreadsheet needs the current layout. Organization will run after activity settles." } });
        this.queueViews(workbook, state, [], true);
      } else this.set({ ...this.current, organization: { status: "current", message: "The spreadsheet uses the current layout. Saved views are maintained automatically." } });
    })();
    this.organizationCheck = work;
    try { await work; } finally { if (this.organizationCheck === work) this.organizationCheck = null; }
  }

  /** Serialize maintenance and view writes; refused derived views wait for a later connection/save. */
  private flushViews(): Promise<void> {
    if (this.flushing !== null) return this.flushing;
    const work = this.writePendingViews();
    this.flushing = work;
    void work.finally(() => { if (this.flushing === work) this.flushing = null; });
    return work;
  }

  private async writePendingViews(): Promise<void> {
    const view = this.pendingView;
    const token = this.validToken();
    if (view === null || token === null || this.current.sheet !== "ok") return;
    const generation = this.generation;
    const tabs = [...this.pendingTabs.entries()].map(([date, sheet]) => ({ date, sheet }));
    const full = this.organizationPending;
    this.pendingView = null;
    this.pendingTabs = new Map();
    const result = full ? await this.organizeWorkbook(view.workbook, token) : await writeGridTabs(this.deps.rest, token, view.workbook.id, [
      { title: VIEW_TAB, grid: readableView(view.state), legacyGrids: () => previousReadableViews(view.state) },
      ...tabs.map((tab) => ({ title: statementTabTitle(tab.date), grid: this.deps.present(tab.sheet), legacyGrids: [rawGrid(tab.sheet)] })),
    ]);
    if (generation !== this.generation || this.current.workbook?.id !== view.workbook.id) return;
    const success = "status" in result ? result.status === "tidied" : result.ok;
    if (success) {
      if (!full) this.set({ ...this.current, organization: { status: "preservedTabs" in result && result.preservedTabs ? "needs-attention" : "current", message: "preservedTabs" in result && result.preservedTabs ? "Saved views were refreshed. Unrecognised duplicate candidates were preserved for review." : "Saved spreadsheet views were refreshed and organized." } });
    } else {
      if (!this.hasPendingView()) this.pendingView = view;
      for (const tab of tabs) if (!this.pendingTabs.has(tab.date)) this.pendingTabs.set(tab.date, tab.sheet);
      const message = "message" in result && typeof result.message === "string" ? result.message : "The readable spreadsheet views could not be refreshed. Saved records are preserved; maintenance will retry on a later connection or save.";
      this.set({ ...this.current, organization: { status: "needs-attention", message } });
    }
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
    this.current = next.organization === undefined && next.workbook?.id === this.current.workbook?.id && this.current.organization !== undefined
      ? { ...next, organization: this.current.organization } : next;
    for (const listener of this.listeners) listener();
  }

  /**
   * Access with at least `minimumMilliseconds` left. A token that is valid but too short for
   * the action is kept for reads and replaced first for a save, so Google's expiry cannot fall
   * in the middle of one. If that replacement fails the save is refused, never started.
   */
  private async accessToken(minimumMilliseconds = 0): Promise<{ readonly ok: true; readonly token: string } | { readonly ok: false; readonly reason: Extract<SignInResult, { ok: false }>["reason"] }> {
    const now = this.deps.now();
    if (this.token !== null && now + minimumMilliseconds < this.token.validUntil) return { ok: true, token: this.token.accessToken };
    if (this.token !== null && now >= this.token.validUntil) this.dropToken();
    if (this.signingIn !== null) return this.signingIn;
    const work = this.requestToken("requested");
    this.signingIn = work;
    try {
      return await work;
    } finally {
      if (this.signingIn === work) this.signingIn = null;
    }
  }

  /** Forgets the access this window holds and the stored copy of it, unless another window has stored a newer one. */
  private dropToken(): void {
    if (this.token !== null) this.deps.googleSession?.discard(this.token.accessToken);
    this.token = null;
  }

  /**
   * Starts a Google request in the current call stack, so a person's click still counts as the
   * gesture Google's window requires. Quiet attempts name the remembered account; once one has
   * failed, a requested one lets the person choose.
   */
  private async requestToken(trigger: RenewalTrigger): ReturnType<Session["accessToken"]> {
    const generation = this.generation;
    const chooser = this.chooserOnNextSignIn;
    this.chooserOnNextSignIn = false;
    const options: SignInOptions = signInOptionsFor(trigger, this.renewal, this.hint, chooser);
    this.deps.coordination?.claim();
    let result: SignInResult;
    try {
      result = await this.deps.signIn(this.deps.clientId, DRIVE_FILE_SCOPE, options);
    } catch {
      result = { ok: false, reason: "unavailable" };
    } finally {
      this.deps.coordination?.release();
    }
    if (generation !== this.generation) return { ok: false, reason: "closed" };
    this.renewal = afterAttempt(this.renewal, result, this.deps.now());
    if (!result.ok) {
      // A token that is still valid stays usable for reads even when its replacement did not arrive.
      if (this.validToken() === null) {
        this.dropToken();
        if (this.current.workbook !== null && this.current.mode !== "signed-out") this.set({ ...this.current, connection: this.unrenewedConnection() });
      }
      return result;
    }
    // Reused only while Google says it is valid (with a margin), so a run of actions asks once.
    this.token = result.expiresInSeconds === undefined ? null : { accessToken: result.accessToken, validUntil: this.deps.now() + (Math.min(result.expiresInSeconds, TOKEN_MAXIMUM_SECONDS) - TOKEN_MARGIN_SECONDS) * 1000 };
    this.persistToken();
    if (this.hint === null || options.prompt === "select_account") this.later(this.learnHint(result.accessToken, generation));
    return { ok: true, token: result.accessToken };
  }

  private persistToken(): void {
    const { workbook } = this.current;
    if (this.token !== null && workbook !== null && this.validToken() !== null) this.deps.googleSession?.save({ ...this.token, clientId: this.deps.clientId, workbookId: workbook.id, scope: DRIVE_FILE_SCOPE });
  }

  /** Remembers which account the access belongs to, so the next quiet renewal can name it. Best effort. */
  private async learnHint(accessToken: string, generation: number): Promise<void> {
    if (this.deps.accountHint === undefined) return;
    const address = await fetchAccountHint(this.deps.rest, accessToken);
    if (address === null || generation !== this.generation) return;
    this.hint = address;
    this.deps.accountHint.save(this.deps.clientId, address);
  }

  /** What the connection looks like with no usable access: renewed on the next click, or waiting for the person. */
  private unrenewedConnection(): "waiting" | "reconnect" {
    return renewalNeedsThePerson(this.renewal) ? "reconnect" : "waiting";
  }

  private keep(workbook: Workbook, ledger: LedgerState): void {
    this.deps.cache.save({ workbook, ledger, syncedAt: this.deps.now() });
    if (this.token !== null && this.validToken() !== null) this.deps.googleSession?.save({ ...this.token, clientId: this.deps.clientId, workbookId: workbook.id, scope: DRIVE_FILE_SCOPE });
  }

  /** Why expenses cannot be read or changed now, in the same words the portfolio uses for its sheet. */
  private expenseBlockedMessage(purpose: "read" | "write"): string {
    const { sheet } = this.current;
    if (sheet !== "ok" && sheet !== "unchecked") return NEEDS[sheet];
    if (purpose === "read") return "Google could not check your workbook, so your saved expense copy was kept. Check again shortly.";
    return "Sync and check your Google workbook in Your data before changing expenses.";
  }

  /** Whether the next click should renew Google access quietly: a remembered connection with little or no access left. */
  needsRenewal(): boolean {
    const { workbook, mode } = this.current;
    if (workbook === null || mode === "signed-out" || this.signingIn !== null || this.connecting !== null) return false;
    if (this.deps.coordination?.heldElsewhere() === true) return false;
    const remaining = this.token === null ? 0 : this.token.validUntil - this.deps.now();
    return remaining <= RENEW_AHEAD_MILLISECONDS && mayRenewAutomatically(this.renewal, this.deps.now());
  }

  /**
   * Renews Google access on a click the person made for another reason. Call it synchronously
   * from inside the click: Google's window opens only from a user gesture. It names the
   * remembered account, so when Google still has the person's session and grant, nothing needs
   * choosing. It never creates a workbook and never writes. Resolves to whether access was renewed.
   */
  async renewFromGesture(options: { readonly sync: boolean }): Promise<boolean> {
    if (!this.needsRenewal()) return false;
    const usable = this.validToken() !== null;
    // Access that is still valid keeps working while its replacement is on the way.
    if (!usable) this.set({ ...this.current, connection: "renewing" });
    const work = this.requestToken("automatic");
    this.signingIn = work;
    let result: Awaited<typeof work>;
    try {
      result = await work;
    } finally {
      if (this.signingIn === work) this.signingIn = null;
    }
    if (!result.ok) return false;
    this.lastAutoCheck = -Infinity;
    this.set(this.afterRenewal());
    if (options.sync) await this.refreshIfNeeded();
    return true;
  }

  private afterRenewal(): SessionState {
    const { mode, ledger, workbook, syncedAt, sheet, trailingRows } = this.current;
    return { mode, ledger, workbook, syncedAt, sheet, trailingRows, ...(mode === "online" ? { connection: "connected" as const } : {}) };
  }

  /** The network is back: a failure that was only the network is forgiven. */
  resumeRenewal(): void {
    this.renewal = afterReconnectingToNetwork(this.renewal);
  }

  /** Takes up Google access another window of this browser stored, if it is newer than this window's. */
  adoptStoredAccess(): boolean {
    const { workbook } = this.current;
    if (workbook === null || this.deps.googleSession === undefined) return false;
    const stored = this.deps.googleSession.load(this.deps.clientId, workbook.id, this.deps.now());
    if (stored === null || (this.token !== null && this.token.validUntil >= stored.validUntil)) return false;
    this.token = { accessToken: stored.accessToken, validUntil: stored.validUntil };
    this.renewal = FRESH_RENEWAL;
    this.lastAutoCheck = -Infinity;
    if (this.current.connection === "waiting" || this.current.connection === "reconnect" || this.current.connection === "renewing") this.set(this.afterRenewal());
    return true;
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
    if (generation !== this.generation) return { status: "superseded" };
    if (ensured.status !== "ready") return { status: "call-failed", failure: ensured.failure };
    return this.load(ensured.workbook, signed.token, ensured.created, generation);
  }

  /**
   * Explicit recovery: replace access only, retaining the workbook, history and unresolved writes.
   * It asks for the remembered account first, so it rarely shows a chooser. After a failed attempt,
   * or when the person wants another account, it lets them choose.
   */
  reconnect(options?: { readonly differentAccount?: boolean }): Promise<ConnectOutcome> {
    this.organizationChecked = null;
    this.token = null;
    this.deps.googleSession?.clear();
    this.chooserOnNextSignIn = options?.differentAccount === true && this.signingIn === null;
    this.syncSequence++;
    this.set({ ...this.current, connection: "renewing" });
    return this.refresh();
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

  private async load(workbook: Workbook, accessToken: string, created: boolean, generation: number): Promise<ConnectOutcome> {
    const sequence = ++this.syncSequence;
    const read = await readDirect(this.deps.rest, accessToken, workbook.id);
    if (generation !== this.generation || sequence !== this.syncSequence) return { status: "superseded" };
    if (this.current.workbook !== null && this.current.workbook.id !== workbook.id) {
      // A newly selected account/workbook cannot inherit the previous feature's private cache.
      this.deps.cache.clear();
      this.expenses.forget();
      this.set({ mode: "online", ledger: EMPTY_LEDGER, workbook, syncedAt: null, sheet: "unchecked", trailingRows: 0 });
    }
    const copy = this.current.ledger;
    const attention = (sheet: Exclude<SheetStatus, "unchecked" | "ok">): ConnectOutcome => {
      // The device copy is left exactly as it was, so it can still be shown and, with consent, restored.
      this.set({ ...this.current, mode: this.current.mode === "signed-out" ? "signed-out" : "online", connection: "connected", workbook, sheet });
      return { status: "needs-attention", sheet, message: NEEDS[sheet] };
    };
    switch (read.status) {
      case "call-failed":
        this.set({ ...this.current, connection: read.failure === "unauthorised" ? this.unrenewedConnection() : "offline" });
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
    this.set({ mode: "online", connection: "connected", ledger: read.state, workbook, syncedAt: this.deps.now(), sheet: "ok", trailingRows: read.ignoredTrailingRows });
    if (this.tidied !== workbook.id) {
      this.tidied = workbook.id;
      this.later(tidyLedgerTab(this.deps.rest, accessToken, workbook.id));
    }
    this.later(this.scheduleOrganization(workbook, accessToken, read.state, generation));
    if (this.pendingView !== null && !this.organizationPending) this.queueViews(workbook, read.state, []);
    return { status: "connected", created, statements: read.state.snapshots.length, changed };
  }

  /** A bounded read using existing access. Background work never opens OAuth or creates a workbook. */
  refreshIfNeeded(): Promise<void> {
    if (this.freshness !== null) return this.freshness;
    if (this.current.workbook === null || this.deps.now() - this.lastAutoCheck < AUTO_CHECK_MINIMUM_MILLISECONDS) return Promise.resolve();
    // Google's window is open: the renewal in progress will bring its own check.
    if (this.signingIn !== null) return Promise.resolve();
    if (this.validToken() === null) {
      this.dropToken();
      this.set({ ...this.current, connection: this.unrenewedConnection() });
      return Promise.resolve();
    }
    this.lastAutoCheck = this.deps.now();
    const generation = this.generation;
    const workbook = this.current.workbook;
    const token = this.validToken();
    if (token === null) return Promise.resolve();
    this.set({ ...this.current, connection: "checking" });
    const work = this.load(workbook, token, false, generation).then(async (outcome) => {
      if (generation === this.generation && outcome.status === "connected") await this.expenses.refresh();
    }).catch(() => {
      if (generation === this.generation) this.set({ ...this.current, connection: "offline" });
    });
    this.freshness = work;
    void work.finally(() => { if (this.freshness === work) this.freshness = null; });
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
    if (this.expenses.state.pending) return { status: "failed", message: "Check the unresolved expense save or recovery before restoring the workbook." };
    if (ledger.snapshots.length === 0 && !hasExpenses) return { status: "nothing-to-restore" };
    if (sheet !== "missing" && sheet !== "emptied") return { status: "not-needed" };
    const signed = await this.accessToken(WRITE_MINIMUM_MILLISECONDS);
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

  private organizeWorkbook(workbook: Workbook, token: string): Promise<TidyOutcome> {
    if (this.organizing !== null) return this.organizing;
    const generation = this.generation;
    const work = this.performOrganization(workbook, token).then((outcome) => {
      if (generation === this.generation && outcome.status !== "tidied") {
        this.organizationPending = true;
        this.set({ ...this.current, organization: { status: "needs-attention", message: "message" in outcome ? outcome.message : "Spreadsheet organization needs a Google connection." } });
      }
      return outcome;
    });
    this.organizing = work;
    void work.finally(() => { if (this.organizing === work) this.organizing = null; });
    return work;
  }

  private async performOrganization(workbook: Workbook, token: string): Promise<TidyOutcome> {
    const generation = this.generation;
    const localRevision = this.current.ledger.revision;
    this.set({ ...this.current, organization: { status: "organizing", message: "Organizing your spreadsheet from checked records…" } });
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
    if (expenses.status === "damaged" || expenses.status === "unavailable") return { status: "needs-attention", message: `${expenses.message} Organization was not started.` };
    if (expenses.status === "ok" && !containsExpenseCommands(expenses.commands, this.expenses.state.commands)) return { status: "needs-attention", message: "Google is missing expense corrections known on this device. Organization was not started; preserve the device copy and review the workbook." };
    const now = new Date(this.deps.now());
    const today = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    if (today === null) return { status: "failed", message: "The device date is outside the supported range. Organization was not started." };
    if (generation !== this.generation || this.current.workbook?.id !== workbook.id) return { status: "failed", message: "The connected account changed before organization. No layout batch was submitted." };
    const written = await writeGridTabs(this.deps.rest, token, workbook.id, [
      { title: VIEW_TAB, grid: readableView(all.state), legacyGrids: () => previousReadableViews(all.state) },
      ...(expenses.status === "ok" ? [{ title: EXPENSE_VIEW_TITLE, grid: expenseView(expenses.days, expenses.conflicts, today) }] : []),
      ...months.map((month) => ({ title: statementTabTitle(month.date), grid: this.deps.present(month.sheet), legacyGrids: [rawGrid(month.sheet)] })),
    ], { completeOrganization: true });
    if (!written.ok) return { status: "failed", message: written.message ?? "Organization could not be confirmed. Google may have applied the layout if its response was lost. If a tab has an unrecognised or duplicate ownership marker, or an unmarked tab differs from the saved view, it is preserved and organization stops. Check your connection and workbook before trying again. Saved financial records are never rewritten by this action." };
    if (generation === this.generation) {
      this.organizationPending = false;
      this.organizationChecked = workbook.id;
      this.set({ ...this.current, organization: { status: written.preservedTabs ? "needs-attention" : "current", message: written.preservedTabs ? `${String(written.preservedTabs)} unrecognised duplicate candidate(s) were preserved for review. Verified generated views were organized.` : `Spreadsheet organized. ${String(written.consolidatedTabs ?? 0)} verified duplicate tab(s) consolidated.` } });
    }
    if (generation === this.generation && (this.current.ledger.revision !== localRevision || !containsExpenseCommands(expenses.status === "ok" ? expenses.commands : [], this.expenses.state.commands))) {
      this.set({ ...this.current, organization: { status: "pending", message: "A save completed during organization. The newest readable views will be refreshed after activity settles." } });
      this.queueViews(workbook, this.current.ledger, [], true);
    }
    return { status: "tidied", months: months.length, withoutStatement: all.state.snapshots.length - months.length, ...(written.consolidatedTabs ? { consolidatedTabs: written.consolidatedTabs } : {}), ...(written.preservedTabs ? { preservedTabs: written.preservedTabs } : {}) };
  }

  /** Wipes everything this device holds and signs out. The spreadsheet in Google is not touched. */
  forget(): void {
    this.forgetDevice(true);
  }

  /** Another window of this browser forgot the device: this one drops its copy too, and must not write anything back. */
  forgetFromElsewhere(): void {
    this.forgetDevice(false);
  }

  private forgetDevice(announce: boolean): void {
    this.generation++;
    this.syncSequence++;
    this.lastAutoCheck = -Infinity;
    this.freshness = null;
    this.deps.googleSession?.clear();
    this.deps.accountHint?.clear();
    this.hint = null;
    this.renewal = FRESH_RENEWAL;
    this.chooserOnNextSignIn = false;
    if (announce) this.deps.coordination?.announceForgotten();
    this.signingIn = null;
    this.connecting = null;
    this.expenses.forget();
    this.deps.cache.clear();
    if (this.token !== null && announce) this.deps.revoke?.(this.token.accessToken);
    this.token = null;
    if (this.quietTimer !== null) clearTimeout(this.quietTimer);
    this.quietTimer = null;
    this.pendingView = null;
    this.pendingTabs = new Map();
    this.tidied = null;
    this.organizationPending = false;
    this.organizationChecked = null;
    this.organizationCheck = null;
    this.organizing = null;
    this.set({ mode: "signed-out", ledger: EMPTY_LEDGER, workbook: null, syncedAt: null, sheet: "unchecked", trailingRows: 0 });
  }

  /** The save port the import screens use. It saves to the spreadsheet and reads the result back. */
  readonly save: RemoteSave = {
    newCommandId: () => this.deps.newId(),

    record: async (request: RecordRequest, commandId: string, expectedRevision: string): Promise<RecordResult> => {
      const generation = this.generation;
      const { workbook } = this.current;
      if (workbook === null) return { status: "not-saved", message: "Continue with Google first, so there is somewhere to save to." };
      const signed = await this.accessToken(WRITE_MINIMUM_MILLISECONDS);
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
      if (generation !== this.generation) return { status: "unknown", message: "The account changed during this save. Check its outcome in the original workbook before another attempt." };
      switch (commit.status) {
        case "committed":
        case "already-committed":
          return this.readBack(workbook, signed.token, request.source === undefined ? [] : [{ date: request.date, sheet: request.source.sheet }]);
        case "stale":
          await this.load(workbook, signed.token, false, generation);
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
      const generation = this.generation;
      const { workbook } = this.current;
      if (workbook === null) return { status: "not-saved", message: "Continue with Google first, so there is somewhere to save to." };
      const signed = await this.accessToken(WRITE_MINIMUM_MILLISECONDS);
      if (!signed.ok) return { status: "not-saved", message: SIGN_IN_TEXT[signed.reason] };
      const deps: DirectDeps = { rest: this.deps.rest, newRevision: this.deps.newId };
      const commit = await attachDirect(deps, signed.token, workbook.id, { commandId, expectedRevision, items });
      if (generation !== this.generation) return { status: "unknown", message: "The account changed during this save. Check its outcome in the original workbook before another attempt." };
      switch (commit.status) {
        case "committed":
        case "already-committed":
          return this.readBack(workbook, signed.token, items.map((item) => ({ date: item.date, sheet: item.source.sheet })));
        case "stale":
          await this.load(workbook, signed.token, false, generation);
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
    const sequence = ++this.syncSequence;
    if (this.current.workbook?.id !== workbook.id) return { status: "saved-not-reloaded" };
    const read = await readDirect(this.deps.rest, accessToken, workbook.id);
    if (generation !== this.generation || sequence !== this.syncSequence) return { status: "saved-not-reloaded" };
    if (read.status !== "ok") return { status: "saved-not-reloaded" };
    this.keep(workbook, read.state);
    this.set({ mode: "online", connection: "connected", ledger: read.state, workbook, syncedAt: this.deps.now(), sheet: "ok", trailingRows: read.ignoredTrailingRows });
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
