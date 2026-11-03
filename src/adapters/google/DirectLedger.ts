import { type AttachRequest, type CommitRequest, type ServiceEnvironment, type SourceRecord, attachStatements, commitStatement } from "../../applications/LedgerService";
import { readableView } from "../../applications/ReadableView";
import type { Grid } from "../../applications/SheetGrid";
import { canonicalJson } from "../../core/CanonicalJson";
import { type LedgerState, parseLedgerState } from "../../core/Ledger";
import type { IsoDate } from "../../core/IsoDate";
import type { RawSheet } from "../../core/RawSheet";
import { sha256Hex } from "../../core/Sha256";
import { type LedgerRow, type RowSheet, RowLedgerStore } from "../ledger/RowLedgerStore";
import { type Workbook, appendLedgerRows, createWorkbook, findWorkbook, readLedgerRows, tidyLedgerTab as tidyTab, writeGridTabs } from "./GoogleWorkbook";
import type { CallFailure, RemoteCommit, RemoteOutcome, RemoteRead } from "./LedgerResults";
import { VIEW_TAB } from "./SheetsLayout";
import { type RestClient, type RestFailure, wroteNothing } from "./Rest";

/**
 * A sheet held in memory: the rows already stored, plus whatever the ledger rules
 * add during one save. Nothing leaves memory until the save is complete, and then
 * it goes out as one request, so a save is recorded whole or not at all.
 */
export class BufferedRowSheet implements RowSheet {
  private readonly stored: readonly LedgerRow[];
  private readonly added: LedgerRow[] = [];

  constructor(stored: readonly LedgerRow[]) {
    this.stored = stored;
  }

  readRows(): readonly LedgerRow[] {
    return [...this.stored, ...this.added];
  }

  appendRows(rows: readonly LedgerRow[]): void {
    this.added.push(...rows);
  }

  flush(): void {
    // Nothing is durable until the whole save is sent; see commitDirect.
  }

  get pending(): readonly LedgerRow[] {
    return this.added;
  }
}

export interface DirectDeps {
  readonly rest: RestClient;
  readonly newRevision: () => string;
}

export type EnsureResult =
  | { readonly status: "ready"; readonly workbook: Workbook; readonly created: boolean; readonly tagged: boolean }
  | { readonly status: "call-failed"; readonly failure: CallFailure };

/** Finds the person's spreadsheet, or creates it. This is the whole of "starting a portfolio from scratch". */
export async function ensureWorkbook(rest: RestClient, accessToken: string): Promise<EnsureResult> {
  const found = await findWorkbook(rest, accessToken);
  if (!found.ok) return { status: "call-failed", failure: found.failure };
  if (found.value !== null) return { status: "ready", workbook: found.value, created: false, tagged: true };
  const created = await createWorkbook(rest, accessToken);
  if (!created.ok) return { status: "call-failed", failure: created.failure };
  return { status: "ready", workbook: { id: created.value.id, url: created.value.url }, created: true, tagged: created.value.tagged };
}

function storeOf(rows: readonly LedgerRow[]): { readonly sheet: BufferedRowSheet; readonly store: RowLedgerStore } {
  const sheet = new BufferedRowSheet(rows);
  return { sheet, store: new RowLedgerStore(sheet) };
}

/** Reads and checks the ledger. A damaged ledger is reported as damaged and never shown. */
export async function readDirect(rest: RestClient, accessToken: string, workbookId: string): Promise<RemoteRead> {
  const tab = await readLedgerRows(rest, accessToken, workbookId);
  if (!tab.ok) {
    return tab.failure === "not-found" ? { status: "workbook-unavailable" } : { status: "call-failed", failure: tab.failure, message: null };
  }
  if ("notALedger" in tab.value) return { status: "refused", message: "This spreadsheet is not a FolioDash ledger, so it was not changed." };
  const loaded = storeOf(tab.value.rows).store.load();
  return loaded.status === "ok"
    ? { status: "ok", state: loaded.state, ignoredTrailingRows: loaded.ignoredTrailingRows }
    : { status: "damaged", message: loaded.message };
}

const LOST = "The save may or may not have been recorded. Check what happened before trying again.";

/**
 * Runs one ledger operation in memory against the rows already stored, checks once
 * more that nobody else wrote in the meantime, and sends what the operation added
 * in a single request. Only a refusal Google made before doing anything counts as
 * "not written"; a lost answer is unknown and is resolved by reading the sheet,
 * never by trying again.
 */
async function writeOnce(
  deps: DirectDeps,
  accessToken: string,
  workbookId: string,
  operate: (environment: ServiceEnvironment) => { readonly result: RemoteCommit; readonly wrote: boolean },
): Promise<RemoteCommit> {
  const before = await readLedgerRows(deps.rest, accessToken, workbookId);
  if (!before.ok) return notWritten(before.failure);
  if ("notALedger" in before.value) return { status: "refused", message: "This spreadsheet is not a FolioDash ledger, so nothing was saved." };

  const { sheet, store } = storeOf(before.value.rows);
  const environment: ServiceEnvironment = { store, withLock: (action) => action(), newRevision: deps.newRevision };
  const { result, wrote } = operate(environment);
  if (!wrote) return result;

  // Nothing has been written yet. Make sure the sheet has not changed since it was read.
  const again = await readLedgerRows(deps.rest, accessToken, workbookId);
  if (!again.ok) return notWritten(again.failure);
  if ("notALedger" in again.value || canonicalJson(again.value.rows) !== canonicalJson(before.value.rows)) return { status: "stale" };

  const sent = await appendLedgerRows(deps.rest, accessToken, workbookId, sheet.pending);
  if (sent.ok) {
    const verified = await readLedgerRows(deps.rest, accessToken, workbookId);
    if (!verified.ok || "notALedger" in verified.value) return { status: "unknown", message: LOST };
    const loaded = storeOf(verified.value.rows).store.load();
    const expected = store.load();
    if (loaded.status !== "ok" || expected.status !== "ok" || canonicalJson(loaded.state) !== canonicalJson(expected.state)) return { status: "unknown", message: LOST };
    return result;
  }
  return sent.failure === "unavailable" || sent.failure === "network" || sent.failure === "unexpected" ? { status: "unknown", message: LOST } : notWritten(sent.failure);
}

/** Saves one reviewed statement. */
export function commitDirect(deps: DirectDeps, accessToken: string, workbookId: string, request: CommitRequest): Promise<RemoteCommit> {
  return writeOnce(deps, accessToken, workbookId, (environment) => {
    const outcome = commitStatement(environment, request);
    switch (outcome.status) {
      case "committed":
        return { result: { status: "committed", revision: outcome.revision }, wrote: true };
      case "already-committed":
        return { result: { status: "already-committed", revision: outcome.revision }, wrote: false };
      case "stale":
        return { result: { status: "stale" }, wrote: false };
      case "rejected":
        return { result: { status: "rejected", messages: outcome.issues.map((issue) => issue.message).slice(0, 10) }, wrote: false };
      case "damaged":
        return { result: { status: "damaged", message: outcome.message }, wrote: false };
      case "not-committed":
        return { result: { status: "not-committed", message: outcome.message }, wrote: false };
      case "unknown":
        return { result: { status: "unknown", message: outcome.message }, wrote: false };
    }
  });
}

/**
 * Attaches bank statements to months that are already saved, in one request. The
 * saved figures do not change, and a statement that does not reproduce them is refused.
 */
export function attachDirect(deps: DirectDeps, accessToken: string, workbookId: string, request: AttachRequest): Promise<RemoteCommit> {
  return writeOnce(deps, accessToken, workbookId, (environment) => {
    const outcome = attachStatements(environment, request);
    switch (outcome.status) {
      case "attached":
        return { result: { status: "committed", revision: outcome.revision }, wrote: true };
      case "already-attached":
        return { result: { status: "already-committed", revision: outcome.revision }, wrote: false };
      case "stale":
        return { result: { status: "stale" }, wrote: false };
      case "rejected":
        return { result: { status: "rejected", messages: outcome.messages }, wrote: false };
      case "damaged":
        return { result: { status: "damaged", message: outcome.message }, wrote: false };
      case "not-committed":
        return { result: { status: "not-committed", message: outcome.message }, wrote: false };
      case "unknown":
        return { result: { status: "unknown", message: outcome.message }, wrote: false };
    }
  });
}

function notWritten(failure: RestFailure): RemoteCommit {
  if (failure === "unauthorised" || failure === "forbidden" || failure === "not-found") return { status: "not-sent", failure };
  return { status: "not-committed", message: wroteNothing(failure) ? "Google could not be reached, so nothing was saved. It is safe to try again." : "Nothing was saved. It is safe to try again." };
}

/** Resolves a lost answer by reading the sheet. It writes nothing. */
export async function outcomeDirect(rest: RestClient, accessToken: string, workbookId: string, commandId: string): Promise<RemoteOutcome> {
  const tab = await readLedgerRows(rest, accessToken, workbookId);
  if (!tab.ok || "notALedger" in tab.value) return { status: "unreachable" };
  const { store } = storeOf(tab.value.rows);
  const loaded = store.load();
  if (loaded.status === "damaged") return { status: "damaged", message: loaded.message };
  return store.findCommand(commandId) === null ? { status: "not-found" } : { status: "committed" };
}

export type RestoreResult =
  | { readonly status: "restored"; readonly workbook: Workbook; readonly ledger: LedgerState }
  | { readonly status: "invalid" }
  /** The spreadsheet already holds saved statements; restoring would mix two histories, so it was refused. */
  | { readonly status: "not-empty" }
  | { readonly status: "failed"; readonly failure: CallFailure; readonly workbook: Workbook | null };

/**
 * Writes a whole ledger, taken from this device's copy, into a spreadsheet: a new
 * one, or an existing one that holds no statements. The copy is validated first
 * and read back afterwards. It is only ever called after the person confirms.
 */
export async function restoreDirect(deps: DirectDeps, accessToken: string, copy: LedgerState, into: Workbook | null): Promise<RestoreResult> {
  const valid = parseLedgerState(copy);
  if (valid === null || valid.snapshots.length === 0) return { status: "invalid" };

  let workbook = into;
  if (workbook === null) {
    const created = await createWorkbook(deps.rest, accessToken);
    if (!created.ok) return { status: "failed", failure: created.failure, workbook: null };
    workbook = { id: created.value.id, url: created.value.url };
  } else {
    const existing = await readDirect(deps.rest, accessToken, workbook.id);
    if (existing.status === "ok" && existing.state.snapshots.length > 0) return { status: "not-empty" };
    if (existing.status !== "ok" && existing.status !== "damaged") {
      return { status: "failed", failure: existing.status === "call-failed" ? existing.failure : "unexpected", workbook };
    }
    if (existing.status === "damaged") return { status: "failed", failure: "unexpected", workbook };
  }

  const revision = deps.newRevision();
  const { sheet, store } = storeOf([]);
  store.publish({ ...valid, revision }, { commandId: `restore-${revision}`, revision, requestHash: sha256Hex(canonicalJson(valid)) });
  const sent = await appendLedgerRows(deps.rest, accessToken, workbook.id, sheet.pending);
  if (!sent.ok) return { status: "failed", failure: sent.failure, workbook };

  const back = await readDirect(deps.rest, accessToken, workbook.id);
  if (back.status !== "ok" || canonicalJson({ ...back.state, revision: "" }) !== canonicalJson({ ...valid, revision: "" })) {
    return { status: "failed", failure: "unexpected", workbook };
  }
  return { status: "restored", workbook, ledger: back.state };
}

/** Refreshes the readable tab. Best effort: a failure here never affects the saved records. */
export async function refreshView(rest: RestClient, accessToken: string, workbookId: string, state: LedgerState): Promise<boolean> {
  const written = await writeGridTabs(rest, accessToken, workbookId, [{ title: VIEW_TAB, grid: readableView(state) }]);
  return written.ok;
}

/** The tab that mirrors one month's bank statement, named like the earlier workbook's Bank tabs. */
export function statementTabTitle(date: IsoDate): string {
  return `Bank ${date}`;
}

/** Turns a bank statement into the tab shown for it; the bank-specific reading is supplied by the caller. */
export type PresentStatement = (sheet: RawSheet) => Grid;

/** Writes the readable tabs for any number of months in two requests. Best effort: the exact statements are already in the ledger. */
export async function mirrorStatements(
  rest: RestClient,
  accessToken: string,
  workbookId: string,
  months: readonly { readonly date: IsoDate; readonly sheet: RawSheet }[],
  present: PresentStatement,
): Promise<boolean> {
  const written = await writeGridTabs(rest, accessToken, workbookId, months.map((month) => ({ title: statementTabTitle(month.date), grid: present(month.sheet) })));
  return written.ok;
}

/** Hides the ledger tab if it is showing and trims its unused columns. Best effort. */
export function tidyLedgerTab(rest: RestClient, accessToken: string, workbookId: string): Promise<boolean> {
  return tidyTab(rest, accessToken, workbookId);
}

export type ReadAll =
  | { readonly status: "ok"; readonly state: LedgerState; readonly sources: readonly SourceRecord[]; readonly ignoredTrailingRows: number }
  | { readonly status: "damaged"; readonly message: string }
  | { readonly status: "unavailable"; readonly failure: CallFailure | "missing" | "not-a-ledger" };

/** Reads the ledger and every stored statement, each checked, in one pass over the rows. */
export async function readAllDirect(rest: RestClient, accessToken: string, workbookId: string): Promise<ReadAll> {
  const tab = await readLedgerRows(rest, accessToken, workbookId);
  if (!tab.ok) return { status: "unavailable", failure: tab.failure === "not-found" ? "missing" : tab.failure };
  if ("notALedger" in tab.value) return { status: "unavailable", failure: "not-a-ledger" };
  const { store } = storeOf(tab.value.rows);
  const loaded = store.load();
  if (loaded.status === "damaged") return { status: "damaged", message: loaded.message };
  const sources = store.loadSources();
  if (sources.status === "damaged") return { status: "damaged", message: sources.message };
  return { status: "ok", state: loaded.state, sources: sources.sources, ignoredTrailingRows: loaded.ignoredTrailingRows };
}
