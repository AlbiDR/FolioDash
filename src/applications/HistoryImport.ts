import { parseCommitRequest } from "./CommitRequestParser";
import type { CommitRequest } from "./LedgerService";
import { applyImport } from "../core/ImportPlan";
import type { LedgerState } from "../core/Ledger";

/** One statement of a history file: what the review screen would have produced, with a fixed command id. */
export type HistoryStatement = Omit<CommitRequest, "expectedRevision">;

export const HISTORY_FILE_KIND = "foliodash-history";
export const MAX_HISTORY_STATEMENTS = 240;

export type ParsedHistory =
  | { readonly ok: true; readonly statements: readonly HistoryStatement[] }
  | { readonly ok: false; readonly message: string };

/**
 * Reads a history file. Each statement goes through the same validation the
 * service applies to a single save, so a malformed file is refused as a whole
 * before anything is sent.
 */
export function parseHistory(text: string): ParsedHistory {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, message: "This file is not a FolioDash history file." };
  }
  const file = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (file === null || file["kind"] !== HISTORY_FILE_KIND || file["version"] !== 1 || !Array.isArray(file["statements"])) {
    return { ok: false, message: "This file is not a FolioDash history file." };
  }
  const entries = file["statements"] as unknown[];
  if (entries.length === 0 || entries.length > MAX_HISTORY_STATEMENTS) {
    return { ok: false, message: "The history file holds no statements, or too many." };
  }
  const statements: HistoryStatement[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const parsed = parseCommitRequest(typeof entry === "object" && entry !== null ? { ...entry, expectedRevision: "" } : entry);
    if (!parsed.ok) return { ok: false, message: `Statement ${String(index + 1)}: ${parsed.message}` };
    const { commandId, date, statement: input, commands, source } = parsed.request;
    // The bank statement travels with its month, so the import keeps it and the ledger stays rebuildable.
    const statement: HistoryStatement = { commandId, date, statement: input, commands, ...(source === undefined ? {} : { source }) };
    if (ids.has(statement.commandId)) return { ok: false, message: `Statement ${String(index + 1)} repeats a command id.` };
    ids.add(statement.commandId);
    statements.push(statement);
  }
  return { ok: true, statements };
}

export type HistoryPlan =
  | {
      readonly ok: true;
      /** Leading statements the ledger already holds, so a repeated or interrupted import resumes. */
      readonly alreadyRecorded: number;
      readonly toSave: readonly HistoryStatement[];
    }
  | { readonly ok: false; readonly message: string };

/**
 * Works out what is left to save. The ledger's statements must be exactly the
 * start of the file's (same dates, same bank subtotals); anything else is a
 * different history and is refused rather than merged. The rest is tried against
 * the ledger with the real rules, so a problem is found before the first save.
 */
export function planHistory(ledger: LedgerState, statements: readonly HistoryStatement[]): HistoryPlan {
  if (ledger.snapshots.length > statements.length) {
    return { ok: false, message: "The spreadsheet already holds more statements than this file." };
  }
  for (const [index, snapshot] of ledger.snapshots.entries()) {
    const fromFile = statements[index];
    if (fromFile === undefined || fromFile.date !== snapshot.date || fromFile.statement.fundsSubtotal !== snapshot.fundsSubtotal) {
      return { ok: false, message: "The spreadsheet already holds different statements from this file, so nothing was changed." };
    }
  }
  let state = ledger;
  const toSave = statements.slice(ledger.snapshots.length);
  for (const [index, statement] of toSave.entries()) {
    const applied = applyImport(state, statement.statement, statement.date, statement.commands, `plan-${String(index)}`);
    if (!applied.ok) {
      return { ok: false, message: `Statement dated ${statement.date} would not be accepted: ${applied.issues[0]?.message ?? "a rule was not met."}` };
    }
    state = applied.state;
  }
  return { ok: true, alreadyRecorded: ledger.snapshots.length, toSave };
}

export type StepResult<Failure> =
  | { readonly ok: true; readonly ledger: LedgerState }
  | { readonly ok: false; readonly failure: Failure };

export interface HistoryRun<Failure> {
  /** The ledger as last read back from the spreadsheet. */
  readonly ledger: LedgerState;
  readonly saved: number;
  /** Set when the run stopped early: which statement, and why. Nothing after it was attempted. */
  readonly stopped: { readonly statement: HistoryStatement; readonly failure: Failure } | null;
}

/**
 * Saves the statements one at a time, in order, each against the revision the
 * previous save produced. It stops at the first statement that is not
 * confirmed saved, and never retries by itself: an interrupted run is resumed
 * by planning again against what the spreadsheet then holds.
 */
export async function runHistory<Failure>(
  save: (statement: HistoryStatement, expectedRevision: string) => Promise<StepResult<Failure>>,
  start: LedgerState,
  toSave: readonly HistoryStatement[],
  onProgress: (saved: number, total: number) => void,
): Promise<HistoryRun<Failure>> {
  let ledger = start;
  let saved = 0;
  onProgress(0, toSave.length);
  for (const statement of toSave) {
    const step = await save(statement, ledger.revision);
    if (!step.ok) return { ledger, saved, stopped: { statement, failure: step.failure } };
    ledger = step.ledger;
    saved += 1;
    onProgress(saved, toSave.length);
  }
  return { ledger, saved, stopped: null };
}
