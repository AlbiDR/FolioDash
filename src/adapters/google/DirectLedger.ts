import { commitStatement, type CommitRequest, type ServiceEnvironment } from "../../applications/LedgerService";
import { readableView } from "../../applications/ReadableView";
import { canonicalJson } from "../../core/CanonicalJson";
import { type LedgerState, parseLedgerState } from "../../core/Ledger";
import { sha256Hex } from "../../core/Sha256";
import { type LedgerRow, type RowSheet, RowLedgerStore } from "../ledger/RowLedgerStore";
import { type Workbook, appendLedgerRows, createWorkbook, findWorkbook, readLedgerRows, writeReadableView } from "./GoogleWorkbook";
import type { CallFailure, RemoteCommit, RemoteOutcome, RemoteRead } from "./LedgerResults";
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
 * Saves one reviewed statement. It reads the ledger, applies the same rules as
 * always in memory, checks once more that nobody else wrote in the meantime, and
 * sends the result in a single request. Only a refusal Google made before doing
 * anything counts as "not written"; a lost answer is unknown and is resolved by
 * reading the sheet, never by saving again.
 */
export async function commitDirect(deps: DirectDeps, accessToken: string, workbookId: string, request: CommitRequest): Promise<RemoteCommit> {
  const before = await readLedgerRows(deps.rest, accessToken, workbookId);
  if (!before.ok) return notWritten(before.failure);
  if ("notALedger" in before.value) return { status: "refused", message: "This spreadsheet is not a FolioDash ledger, so nothing was saved." };

  const { sheet, store } = storeOf(before.value.rows);
  const environment: ServiceEnvironment = { store, withLock: (action) => action(), newRevision: deps.newRevision };
  const outcome = commitStatement(environment, request);
  switch (outcome.status) {
    case "already-committed":
      return { status: "already-committed", revision: outcome.revision };
    case "stale":
      return { status: "stale" };
    case "rejected":
      return { status: "rejected", messages: outcome.issues.map((issue) => issue.message).slice(0, 10) };
    case "damaged":
      return { status: "damaged", message: outcome.message };
    case "not-committed":
      return { status: "not-committed", message: outcome.message };
    case "unknown":
      return { status: "unknown", message: outcome.message };
    case "committed":
      break;
  }

  // Nothing has been written yet. Make sure the sheet has not changed since it was read.
  const again = await readLedgerRows(deps.rest, accessToken, workbookId);
  if (!again.ok) return notWritten(again.failure);
  if ("notALedger" in again.value || again.value.rows.length !== before.value.rows.length) return { status: "stale" };

  const sent = await appendLedgerRows(deps.rest, accessToken, workbookId, sheet.pending);
  if (sent.ok) return { status: "committed", revision: outcome.revision };
  return sent.failure === "unavailable" || sent.failure === "network" ? { status: "unknown", message: LOST } : notWritten(sent.failure);
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
  if (back.status !== "ok" || back.state.snapshots.length !== valid.snapshots.length) {
    return { status: "failed", failure: "unexpected", workbook };
  }
  return { status: "restored", workbook, ledger: back.state };
}

/** Refreshes the readable tab. Best effort: a failure here never affects the saved records. */
export async function refreshView(rest: RestClient, accessToken: string, workbookId: string, state: LedgerState): Promise<boolean> {
  const written = await writeReadableView(rest, accessToken, workbookId, readableView(state));
  return written.ok;
}
