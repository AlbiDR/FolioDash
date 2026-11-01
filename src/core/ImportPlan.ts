import { type IsoDate, monthSerial } from "./IsoDate";
import {
  type Fund,
  type Holding,
  type HoldingAction,
  type LedgerIssue,
  type LedgerState,
  MAX_COMMENT_LENGTH,
  type Snapshot,
  isSafeFundName,
  validateLedger,
} from "./Ledger";
import { type EuroCents, ZERO_CENTS, addCents, subtractCents } from "./Money";

/** What the bank statement says, reduced to what the ledger needs. */
export interface StatementInput {
  readonly funds: readonly { readonly isin: string; readonly name: string; readonly marketValue: EuroCents }[];
  /** The bank's funds-only subtotal. */
  readonly fundsSubtotal: EuroCents;
}

/** How a fund in this statement relates to the ledger. */
export type Detection = "Opening" | "New" | "Held" | "Missing" | "Reappeared" | "Closed";

export interface PlanRow {
  readonly isin: string;
  readonly name: string;
  readonly detected: Detection;
  /** Market value on this statement. Zero for a fund the statement does not list. */
  readonly value: EuroCents;
  readonly priorNetInvested: EuroCents;
}

/** The decision the user records for one fund. Nothing is assumed: cash is always stated, even when zero. */
export interface FundCommand {
  readonly isin: string;
  readonly action: HoldingAction;
  readonly moneyIn: EuroCents;
  /** Full proceeds received, not the gain. */
  readonly moneyOut: EuroCents;
  /** Required on the first statement: cash paid in minus full proceeds already received, as of that date. */
  readonly openingNetInvested?: EuroCents;
  /** A preferred display name for a fund seen for the first time. */
  readonly name?: string;
  readonly comment: string;
}

export type ApplyResult =
  | { readonly ok: true; readonly state: LedgerState }
  | { readonly ok: false; readonly issues: readonly LedgerIssue[] };

const ALLOWED_ACTIONS: Readonly<Record<Detection, readonly HoldingAction[]>> = {
  Opening: ["Start"],
  New: ["Add"],
  Held: ["Keep", "Close"],
  Missing: ["Close"],
  Reappeared: ["Reopen"],
  Closed: ["Closed"],
};

/**
 * Compares a statement with the ledger. A fund missing from a statement is never
 * assumed sold, and a zero position the bank keeps listing after a sale stays closed.
 */
export function planImport(state: LedgerState, statement: StatementInput): PlanRow[] {
  const latest = state.snapshots[state.snapshots.length - 1];
  const preferredName = (isin: string, fallback: string): string =>
    state.funds.find((fund) => fund.isin === isin)?.name ?? fallback;

  if (latest === undefined) {
    return statement.funds.map((fund) => ({
      isin: fund.isin,
      name: fund.name,
      detected: "Opening",
      value: fund.marketValue,
      priorNetInvested: ZERO_CENTS,
    }));
  }

  const rows: PlanRow[] = [];
  const listed = new Set<string>();
  for (const fund of statement.funds) {
    listed.add(fund.isin);
    const prior = latest.holdings[fund.isin];
    let detected: Detection;
    if (prior === undefined) detected = "New";
    else if (prior.status === "active") detected = "Held";
    else detected = fund.marketValue === 0 ? "Closed" : "Reappeared";
    rows.push({
      isin: fund.isin,
      name: preferredName(fund.isin, fund.name),
      detected,
      value: detected === "Closed" ? ZERO_CENTS : fund.marketValue,
      priorNetInvested: prior?.netInvested ?? ZERO_CENTS,
    });
  }
  for (const fund of state.funds) {
    const prior = latest.holdings[fund.isin];
    if (listed.has(fund.isin) || prior === undefined) continue;
    rows.push({
      isin: fund.isin,
      name: fund.name,
      detected: prior.status === "active" ? "Missing" : "Closed",
      value: ZERO_CENTS,
      priorNetInvested: prior.netInvested,
    });
  }
  return rows;
}

/**
 * Records one statement. Commands are matched by ISIN, never by row order or
 * name. Nothing is changed unless every rule holds; the returned ledger is new
 * and the input is not modified.
 */
export function applyImport(
  state: LedgerState,
  statement: StatementInput,
  date: IsoDate,
  commands: readonly FundCommand[],
  revision: string,
): ApplyResult {
  const issues: LedgerIssue[] = [];
  const add = (code: LedgerIssue["code"], isin: string | null, message: string): void => {
    issues.push({ code, isin, message });
  };

  const latest = state.snapshots[state.snapshots.length - 1];
  if (latest !== undefined && monthSerial(date) <= monthSerial(latest.date)) {
    add("date-not-later", null, "That month is already recorded. A statement must fall in a later calendar month.");
  }

  const plan = planImport(state, statement);
  const byIsin = new Map(commands.map((command) => [command.isin, command]));
  if (byIsin.size !== commands.length || commands.length !== plan.length || !plan.every((row) => byIsin.has(row.isin))) {
    add("invalid-command", null, "The decisions do not match the funds in this statement. Prepare the import again.");
    return { ok: false, issues };
  }

  const holdings: Record<string, Holding> = {};
  const newFunds: Fund[] = [];
  for (const row of plan) {
    const command = byIsin.get(row.isin);
    if (command === undefined) continue;
    const holding = decide(row, command, add);
    if (holding === null) continue;
    holdings[row.isin] = holding;
    if (row.detected === "Opening" || row.detected === "New") {
      const fullName = statement.funds.find((fund) => fund.isin === row.isin)?.name ?? row.name;
      const name = command.name ?? row.name;
      if (!isSafeFundName(name)) add("invalid-command", row.isin, "The fund name must be plain text, up to 160 characters.");
      newFunds.push({ isin: row.isin, name, fullName, firstDate: date });
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const snapshot: Snapshot = { date, fundsSubtotal: statement.fundsSubtotal, holdings };
  const next: LedgerState = {
    revision,
    funds: [...state.funds, ...newFunds],
    snapshots: [...state.snapshots, snapshot],
  };
  const invalid = validateLedger(next);
  return invalid.length > 0 ? { ok: false, issues: invalid } : { ok: true, state: next };
}

function decide(
  row: PlanRow,
  command: FundCommand,
  add: (code: LedgerIssue["code"], isin: string | null, message: string) => void,
): Holding | null {
  const fail = (message: string): null => {
    add("invalid-command", row.isin, `${row.name}: ${message}`);
    return null;
  };
  if (!ALLOWED_ACTIONS[row.detected].includes(command.action)) {
    const allowed = ALLOWED_ACTIONS[row.detected].join(" or ");
    return fail(
      row.detected === "Missing"
        ? "this fund is missing from the statement. Confirm Close only if it was fully sold; otherwise obtain a complete extract."
        : `choose ${allowed}.`,
    );
  }
  if (!Number.isSafeInteger(command.moneyIn) || !Number.isSafeInteger(command.moneyOut) || command.moneyIn < 0 || command.moneyOut < 0) {
    return fail("money in and out must be non-negative amounts, including an explicit zero.");
  }
  if (command.comment.length > MAX_COMMENT_LENGTH) return fail("the comment is too long.");
  const closing = command.action === "Close" || command.action === "Closed";
  if (command.action === "Close" && row.value !== 0) return fail("a fund that still has value cannot be closed.");
  if (command.action === "Closed") {
    if (command.moneyIn !== 0) return fail("a closed fund cannot take new money without being reopened.");
    if (command.moneyOut !== 0 && command.comment.trim() === "") {
      return fail("describe any late proceeds or distributions in the comment.");
    }
  }

  let netInvested: EuroCents | null;
  if (row.detected === "Opening") {
    if (command.openingNetInvested === undefined || !Number.isSafeInteger(command.openingNetInvested)) {
      return fail("enter the opening net invested for the statement date.");
    }
    if (command.moneyIn !== 0 || command.moneyOut !== 0) return fail("the first statement uses opening balances, not cash movements.");
    netInvested = command.openingNetInvested;
  } else {
    const carried = addCents(row.priorNetInvested, command.moneyIn);
    netInvested = carried === null ? null : subtractCents(carried, command.moneyOut);
    if (netInvested === null) return fail("the invested amount is too large.");
  }
  return {
    value: row.value,
    netInvested,
    moneyIn: command.moneyIn,
    moneyOut: command.moneyOut,
    status: closing ? "closed" : "active",
    action: command.action,
    cashVerified: true,
    comment: command.comment.trim(),
  };
}
