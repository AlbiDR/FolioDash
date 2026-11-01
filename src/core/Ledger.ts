import { type IsoDate, monthSerial, parseIsoDate } from "./IsoDate";
import { parseIsin } from "./Isin";
import { type EuroCents, addCents, subtractCents } from "./Money";

export const MAX_NAME_LENGTH = 160;
export const MAX_COMMENT_LENGTH = 500;

/** A fund name is plain text: non-empty, bounded, and never starting with a formula character. */
export function isSafeFundName(name: string): boolean {
  return name.length > 0 && name.length <= MAX_NAME_LENGTH && !/^[=+@-]/u.test(name);
}

/** A fund the portfolio has ever held. Identity is the validated ISIN, never the row or the name. */
export interface Fund {
  readonly isin: string;
  /** The name shown to the user. The owner may rename it without changing identity. */
  readonly name: string;
  /** The bank's own product name at first sight. */
  readonly fullName: string;
  readonly firstDate: IsoDate;
}

export type HoldingStatus = "active" | "closed";
export type HoldingAction = "Start" | "Add" | "Keep" | "Close" | "Reopen" | "Closed";

/** One fund's state at one statement. */
export interface Holding {
  readonly value: EuroCents;
  /** Cumulative cash in minus cash out, as of this statement. Negative or zero can be valid after withdrawals. */
  readonly netInvested: EuroCents;
  readonly moneyIn: EuroCents;
  /** Full proceeds received, not the gain. */
  readonly moneyOut: EuroCents;
  readonly status: HoldingStatus;
  readonly action: HoldingAction;
  /** True when the cash figures were entered and confirmed, false when reconstructed from other data. */
  readonly cashVerified: boolean;
  readonly comment: string;
}

export interface Snapshot {
  readonly date: IsoDate;
  /** The bank's funds-only subtotal. The holdings' values must add up to it exactly. */
  readonly fundsSubtotal: EuroCents;
  /** Holdings by ISIN. */
  readonly holdings: Readonly<Record<string, Holding>>;
}

export interface LedgerState {
  /** Identifies this complete revision. Empty only for a ledger with no history. */
  readonly revision: string;
  readonly funds: readonly Fund[];
  readonly snapshots: readonly Snapshot[];
}

export const EMPTY_LEDGER: LedgerState = { revision: "", funds: [], snapshots: [] };

export type LedgerIssueCode =
  | "invalid-fund"
  | "invalid-history"
  | "invalid-holding"
  | "does-not-reconcile"
  | "invalid-lifecycle"
  | "invalid-cash"
  | "invalid-command"
  | "date-not-later";

export interface LedgerIssue {
  readonly code: LedgerIssueCode;
  readonly isin: string | null;
  readonly message: string;
}

function isMoney(value: number): boolean {
  return Number.isSafeInteger(value);
}

/**
 * Checks every invariant of a ledger and returns the problems found; an empty
 * list means the ledger is coherent. The same function guards every write and
 * every read, so a damaged or hand-edited ledger is never trusted silently.
 */
export function validateLedger(state: LedgerState): LedgerIssue[] {
  const issues: LedgerIssue[] = [];
  const add = (code: LedgerIssueCode, isin: string | null, message: string): void => {
    issues.push({ code, isin, message });
  };

  const known = new Set<string>();
  for (const fund of state.funds) {
    if (parseIsin(fund.isin) !== fund.isin || known.has(fund.isin)) {
      add("invalid-fund", fund.isin, "A fund has an invalid or repeated ISIN.");
    }
    known.add(fund.isin);
    if (parseIsoDate(fund.firstDate) === null) add("invalid-fund", fund.isin, "A fund has an invalid first date.");
    if (!isSafeFundName(fund.name) || !isSafeFundName(fund.fullName)) {
      add("invalid-fund", fund.isin, "A fund has an unsafe or empty name.");
    }
  }

  let previous: Snapshot | null = null;
  for (const snapshot of state.snapshots) {
    if (parseIsoDate(snapshot.date) === null || (previous !== null && monthSerial(snapshot.date) <= monthSerial(previous.date))) {
      add("invalid-history", null, `${snapshot.date}: statements must be in later calendar months, one per month.`);
    }
    const expected = state.funds.filter((fund) => fund.firstDate <= snapshot.date).map((fund) => fund.isin);
    const present = Object.keys(snapshot.holdings);
    if (present.length !== expected.length || !expected.every((isin) => isin in snapshot.holdings)) {
      add("invalid-history", null, `${snapshot.date}: the statement has missing or unknown funds.`);
    }

    let total: EuroCents | null = 0 as EuroCents;
    for (const isin of expected) {
      const holding = snapshot.holdings[isin];
      if (holding === undefined) continue;
      const before = previous?.holdings[isin];
      if (![holding.value, holding.netInvested, holding.moneyIn, holding.moneyOut].every(isMoney)) {
        add("invalid-holding", isin, `${snapshot.date}: money must be whole cents.`);
        continue;
      }
      if (holding.value < 0 || holding.moneyIn < 0 || holding.moneyOut < 0) {
        add("invalid-holding", isin, `${snapshot.date}: value and cash movements cannot be negative.`);
      }
      if (holding.comment.length > MAX_COMMENT_LENGTH) {
        add("invalid-holding", isin, `${snapshot.date}: the comment is too long.`);
      }
      if (holding.status === "closed" && holding.value !== 0) {
        add("invalid-holding", isin, `${snapshot.date}: a closed holding still has value.`);
      }
      checkLifecycle(holding, before, previous === null, snapshot.date, isin, add);
      if (previous === null) {
        if (holding.moneyIn !== 0 || holding.moneyOut !== 0) {
          add("invalid-cash", isin, `${snapshot.date}: the first statement uses opening balances, not cash movements.`);
        }
      } else {
        const carried: EuroCents | null = addCents(before?.netInvested ?? (0 as EuroCents), holding.moneyIn);
        const expectedNet: EuroCents | null = carried === null ? null : subtractCents(carried, holding.moneyOut);
        if (expectedNet === null || holding.netInvested !== expectedNet) {
          add("invalid-cash", isin, `${snapshot.date}: cash movements do not explain net invested.`);
        }
      }
      total = total === null ? null : addCents(total, holding.value);
    }
    if (total === null || total !== snapshot.fundsSubtotal) {
      add("does-not-reconcile", null, `${snapshot.date}: holdings do not add up to the bank's funds subtotal.`);
    }
    previous = snapshot;
  }

  for (const fund of state.funds) {
    const opening = state.snapshots.find((snapshot) => snapshot.date === fund.firstDate);
    if (opening === undefined || !(fund.isin in opening.holdings)) {
      add("invalid-history", fund.isin, "A fund has no statement at its first date.");
    }
  }
  return issues;
}

function checkLifecycle(
  holding: Holding,
  before: Holding | undefined,
  isFirstStatement: boolean,
  date: IsoDate,
  isin: string,
  add: (code: LedgerIssueCode, isin: string | null, message: string) => void,
): void {
  const fail = (message: string): void => {
    add("invalid-lifecycle", isin, `${date}: ${message}`);
  };
  if (isFirstStatement) {
    if (holding.action !== "Start" || holding.status !== "active") fail("the first statement must start each fund.");
  } else if (before === undefined) {
    if (holding.action !== "Add" || holding.status !== "active") fail("a new fund must be added.");
  } else if (before.status === "closed") {
    const reopened = holding.action === "Reopen" && holding.status === "active";
    const stayedClosed = holding.action === "Closed" && holding.status === "closed" && holding.moneyIn === 0;
    if (!reopened && !stayedClosed) fail("a closed fund needs an explicit reopening before it can take cash or hold value.");
  } else {
    const kept = holding.action === "Keep" && holding.status === "active";
    const closed = holding.action === "Close" && holding.status === "closed";
    if (!kept && !closed) fail("an active fund can only stay active or be explicitly closed.");
  }
}
