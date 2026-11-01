import { canonicalJson } from "../core/CanonicalJson";
import { type StatementInput, applyImport } from "../core/ImportPlan";
import type { IsoDate } from "../core/IsoDate";
import { EMPTY_LEDGER, type LedgerState } from "../core/Ledger";
import { type RawSheet, parseStoredSheet } from "../core/RawSheet";
import type { SourceRecord } from "./LedgerService";

/** Reads a bank statement sheet into what the ledger needs. The bank adapter provides it; this layer does not know the bank. */
export type InterpretStatement = (sheet: RawSheet) => { readonly ok: true; readonly statement: StatementInput } | { readonly ok: false; readonly message: string };

export interface RebuildReport {
  /** Months in the saved ledger. */
  readonly months: number;
  /** Months whose stored bank statement replayed to exactly the saved figures. */
  readonly matching: number;
  /** Months saved before statements were kept, so they cannot be re-derived. */
  readonly withoutStatement: number;
  /** Months whose stored statement replays to different figures than the ledger holds. */
  readonly differing: readonly IsoDate[];
  /** Months whose stored statement could not be read or replayed at all. */
  readonly unreadable: readonly IsoDate[];
}

/** What the ledger looked like just before a given month, taken from the saved ledger itself. */
function before(ledger: LedgerState, index: number): LedgerState {
  if (index === 0) return EMPTY_LEDGER;
  const previous = ledger.snapshots[index - 1];
  return {
    revision: "",
    funds: ledger.funds.filter((fund) => previous !== undefined && fund.firstDate <= previous.date),
    snapshots: ledger.snapshots.slice(0, index),
  };
}

/**
 * Checks, month by month, that the saved ledger is exactly what its stored bank
 * statements and decisions produce under today's rules. Each month is replayed
 * from the saved month before it, so one missing statement does not hide the rest.
 */
export function verifyRebuild(ledger: LedgerState, sources: readonly SourceRecord[], interpret: InterpretStatement): RebuildReport {
  const byDate = new Map(sources.map((source) => [source.date, source]));
  let matching = 0;
  let withoutStatement = 0;
  const differing: IsoDate[] = [];
  const unreadable: IsoDate[] = [];
  ledger.snapshots.forEach((saved, index) => {
    const source = byDate.get(saved.date);
    if (source === undefined) {
      withoutStatement++;
      return;
    }
    const sheet = parseStoredSheet(source.sheet);
    const read = sheet === null ? null : interpret(sheet);
    if (read === null || !read.ok) {
      unreadable.push(saved.date);
      return;
    }
    const replayed = applyImport(before(ledger, index), read.statement, saved.date, source.commands, "verify");
    const rebuilt = replayed.ok ? replayed.state.snapshots[index] : undefined;
    if (rebuilt === undefined) {
      unreadable.push(saved.date);
      return;
    }
    if (canonicalJson(rebuilt) === canonicalJson(saved)) matching++;
    else differing.push(saved.date);
  });
  return { months: ledger.snapshots.length, matching, withoutStatement, differing, unreadable };
}

export type RebuildResult =
  | { readonly status: "rebuilt"; readonly ledger: LedgerState }
  | { readonly status: "failed"; readonly date: IsoDate; readonly message: string };

/**
 * Re-creates the whole ledger from nothing but the stored bank statements and
 * decisions, in order. This is the proof that the sheet is complete.
 */
export function rebuildLedger(sources: readonly SourceRecord[], interpret: InterpretStatement, newRevision: () => string): RebuildResult {
  let state = EMPTY_LEDGER;
  for (const source of [...sources].sort((left, right) => left.date.localeCompare(right.date))) {
    const sheet = parseStoredSheet(source.sheet);
    if (sheet === null) return { status: "failed", date: source.date, message: "The stored statement could not be read." };
    const read = interpret(sheet);
    if (!read.ok) return { status: "failed", date: source.date, message: read.message };
    const applied = applyImport(state, read.statement, source.date, source.commands, newRevision());
    if (!applied.ok) return { status: "failed", date: source.date, message: applied.issues[0]?.message ?? "A rule was not met." };
    state = applied.state;
  }
  return { status: "rebuilt", ledger: state };
}
