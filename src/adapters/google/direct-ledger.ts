import type { SourceRecord } from "../../applications/import/statement-source";
import type { BackfillStatement } from "../../applications/import/backfill-review";
import type { InterpretStatement } from "../../applications/import/rebuild";
import type { FundCommand } from "../../core/statements/import-plan";
import type { CallFailure, Workbook } from "../../applications/session/session-model";
import {
  type AttachRequest,
  type CommitRequest,
  attachStatements,
  commitStatement,
} from "../../applications/ledger/ledger-service";
import { rawGrid } from "../../applications/ledger/sheet-grid";
import { readableView, previousReadableViews } from "../../applications/ledger/readable-view";
import type { Grid } from "../../applications/ledger/sheet-grid";
import { canonicalJson } from "../../core/integrity/canonical-json";
import { type LedgerState, parseLedgerState } from "../../core/portfolio/ledger";
import type { IsoDate } from "../../core/values/iso-date";
import type { RawSheet } from "../../core/statements/raw-sheet";
import { sha256Hex } from "../../core/integrity/sha256";
import type { LedgerRow } from "../ledger/row-ledger-store";
import { createWorkbook, findWorkbook, writeGridTabs, type WorkbookIdentity } from "./google-workbook";
import { appendLedgerRows, fenceLedgerWrite, readLedgerRows, tidyLedgerTab as tidyTab } from "./workbook/ledger-rows";
import { storeOf } from "./ledger/buffered-row-sheet";
import { backfillOperation, recoverOperation } from "./ledger/revision-operations";
import { writeOnce } from "./ledger/write-once";
import type { RemoteCommit, RemoteOutcome, RemoteRead } from "./ledger-results";
import { VIEW_TAB } from "./sheets-layout";
import type { RestClient } from "./rest";

export interface DirectDeps {
  readonly rest: RestClient;
  readonly newRevision: () => string;
  readonly workbookIdentity?: WorkbookIdentity;
  /** Persist the predecessor fingerprint before a revision-changing write is sent. */
  readonly beforeRevisionWrite?: (fingerprint: string) => boolean;
}

export type EnsureResult =
  | { readonly status: "ready"; readonly workbook: Workbook; readonly created: boolean; readonly tagged: boolean }
  | { readonly status: "call-failed"; readonly failure: CallFailure };

/** Finds the person's spreadsheet, or creates it. This is the whole of "starting a portfolio from scratch". */
export async function ensureWorkbook(
  rest: RestClient,
  accessToken: string,
  identity?: WorkbookIdentity,
): Promise<EnsureResult> {
  const found = await findWorkbook(rest, accessToken, identity);
  if (!found.ok) return { status: "call-failed", failure: found.failure };
  if (found.value !== null) return { status: "ready", workbook: found.value, created: false, tagged: true };
  const created = await createWorkbook(rest, accessToken, identity);
  if (!created.ok) return { status: "call-failed", failure: created.failure };
  return {
    status: "ready",
    workbook: { id: created.value.id, url: created.value.url },
    created: true,
    tagged: created.value.tagged,
  };
}

/** Reads and checks the ledger. A damaged ledger is reported as damaged and never shown. */
export async function readDirect(rest: RestClient, accessToken: string, workbookId: string): Promise<RemoteRead> {
  const tab = await readLedgerRows(rest, accessToken, workbookId);
  if (!tab.ok) {
    return tab.failure === "not-found"
      ? { status: "workbook-unavailable" }
      : { status: "call-failed", failure: tab.failure, message: null };
  }
  if ("notALedger" in tab.value)
    return { status: "refused", message: "This spreadsheet is not a FolioDash ledger, so it was not changed." };
  const store = storeOf(tab.value.rows).store;
  const loaded = store.load();
  return loaded.status === "ok"
    ? {
        status: "ok",
        state: loaded.state,
        ignoredTrailingRows: loaded.ignoredTrailingRows,
        ...(store.recoveryTarget() === null ? {} : { recoveryTarget: store.recoveryTarget() }),
      }
    : { status: "damaged", message: loaded.message };
}

/** Resolve a missing uncertain command by atomically fencing its predecessor. */
export async function fenceRevisionDirect(
  deps: DirectDeps,
  accessToken: string,
  workbookId: string,
  commandId: string,
  predecessor: string,
): Promise<"fenced" | "committed" | "unknown"> {
  const before = await readLedgerRows(deps.rest, accessToken, workbookId);
  if (!before.ok || "notALedger" in before.value) return "unknown";
  const { sheet, store } = storeOf(before.value.rows);
  const current = store.load();
  if (current.status !== "ok") return "unknown";
  if (store.findCommand(commandId) !== null) return "committed";
  const fenceId = `fence-${commandId}`;
  const fenceHash = sha256Hex(canonicalJson({ commandId, predecessor }));
  const priorFence = store.findCommand(fenceId);
  if (priorFence !== null) return priorFence.requestHash === fenceHash ? "fenced" : "unknown";
  const revision = deps.newRevision();
  try {
    store.publish({ ...current.state, revision }, { commandId: fenceId, revision, requestHash: fenceHash });
  } catch {
    return "unknown";
  }
  const again = await readLedgerRows(deps.rest, accessToken, workbookId);
  if (!again.ok || "notALedger" in again.value || canonicalJson(again.value.rows) !== canonicalJson(before.value.rows))
    return "unknown";
  const sent = await fenceLedgerWrite(
    deps.rest,
    accessToken,
    workbookId,
    predecessor,
    before.value.rows,
    sheet.pending,
  );
  if (!sent.ok) return "unknown";
  const after = await readLedgerRows(deps.rest, accessToken, workbookId);
  if (!after.ok || "notALedger" in after.value) return "unknown";
  const checked = storeOf(after.value.rows).store;
  if (checked.load().status !== "ok") return "unknown";
  if (checked.findCommand(commandId) !== null) return "committed";
  return checked.findCommand(fenceId)?.requestHash === fenceHash ? "fenced" : "unknown";
}

/** Saves one reviewed statement. */
export function commitDirect(
  deps: DirectDeps,
  accessToken: string,
  workbookId: string,
  request: CommitRequest,
): Promise<RemoteCommit> {
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
        return {
          result: { status: "rejected", messages: outcome.issues.map((issue) => issue.message).slice(0, 10) },
          wrote: false,
        };
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
export function attachDirect(
  deps: DirectDeps,
  accessToken: string,
  workbookId: string,
  request: AttachRequest,
): Promise<RemoteCommit> {
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

/** Restore a reviewed historical revision as a new revision, including its bank sources. */
export function recoverRevisionDirect(
  deps: DirectDeps,
  accessToken: string,
  workbookId: string,
  request: { readonly commandId: string; readonly expectedRevision: string; readonly targetRevision: string },
): Promise<RemoteCommit> {
  return writeOnce(deps, accessToken, workbookId, recoverOperation(deps, request));
}

/** Save a reviewed prefix and its replacement source decisions as one guarded revision. */
export function backfillDirect(
  deps: DirectDeps,
  accessToken: string,
  workbookId: string,
  request: {
    readonly commandId: string;
    readonly expectedRevision: string;
    readonly earlier: readonly BackfillStatement[];
    readonly boundary: readonly FundCommand[];
  },
  interpret: InterpretStatement,
): Promise<RemoteCommit> {
  return writeOnce(deps, accessToken, workbookId, backfillOperation(deps, request, interpret));
}

/** Resolves a lost answer by reading the sheet. It writes nothing. */
export async function outcomeDirect(
  rest: RestClient,
  accessToken: string,
  workbookId: string,
  commandId: string,
): Promise<RemoteOutcome> {
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
export async function restoreDirect(
  deps: DirectDeps,
  accessToken: string,
  copy: LedgerState,
  into: Workbook | null,
): Promise<RestoreResult> {
  const valid = parseLedgerState(copy);
  if (valid === null || valid.snapshots.length === 0) return { status: "invalid" };

  let workbook = into;
  // Rows already in the tab stay in place (for example an interrupted write), so the new references must point past them.
  let stored: readonly LedgerRow[] = [];
  if (workbook === null) {
    const created = await createWorkbook(deps.rest, accessToken, deps.workbookIdentity);
    if (!created.ok) return { status: "failed", failure: created.failure, workbook: null };
    workbook = { id: created.value.id, url: created.value.url };
  } else {
    const tab = await readLedgerRows(deps.rest, accessToken, workbook.id);
    if (!tab.ok) return { status: "failed", failure: tab.failure, workbook };
    if ("notALedger" in tab.value) return { status: "failed", failure: "unexpected", workbook };
    stored = tab.value.rows;
    const existing = storeOf(stored).store.load();
    if (existing.status === "ok" && existing.state.snapshots.length > 0) return { status: "not-empty" };
    if (existing.status === "damaged") return { status: "failed", failure: "unexpected", workbook };
  }

  const revision = deps.newRevision();
  const { sheet, store } = storeOf(stored);
  store.publish(
    { ...valid, revision },
    { commandId: `restore-${revision}`, revision, requestHash: sha256Hex(canonicalJson(valid)) },
  );
  const sent = await appendLedgerRows(deps.rest, accessToken, workbook.id, sheet.pending);
  if (!sent.ok) return { status: "failed", failure: sent.failure, workbook };

  const back = await readDirect(deps.rest, accessToken, workbook.id);
  if (
    back.status !== "ok" ||
    canonicalJson({ ...back.state, revision: "" }) !== canonicalJson({ ...valid, revision: "" })
  ) {
    return { status: "failed", failure: "unexpected", workbook };
  }
  return { status: "restored", workbook, ledger: back.state };
}

/** Refreshes the readable tab. Best effort: a failure here never affects the saved records. */
export async function refreshView(
  rest: RestClient,
  accessToken: string,
  workbookId: string,
  state: LedgerState,
): Promise<boolean> {
  const written = await writeGridTabs(rest, accessToken, workbookId, [
    { title: VIEW_TAB, grid: readableView(state), legacyGrids: () => previousReadableViews(state) },
  ]);
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
  const written = await writeGridTabs(
    rest,
    accessToken,
    workbookId,
    months.map((month) => ({
      title: statementTabTitle(month.date),
      grid: present(month.sheet),
      legacyGrids: [rawGrid(month.sheet)],
    })),
  );
  return written.ok;
}

/** Hides the ledger tab if it is showing and trims its unused columns. Best effort. */
export function tidyLedgerTab(rest: RestClient, accessToken: string, workbookId: string): Promise<boolean> {
  return tidyTab(rest, accessToken, workbookId);
}

export type ReadAll =
  | {
      readonly status: "ok";
      readonly state: LedgerState;
      readonly sources: readonly SourceRecord[];
      readonly ignoredTrailingRows: number;
    }
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
  return {
    status: "ok",
    state: loaded.state,
    sources: sources.sources,
    ignoredTrailingRows: loaded.ignoredTrailingRows,
  };
}
