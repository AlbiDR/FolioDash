import { describe, expect, it } from "vitest";
import { type IsoDate, parseIsoDate } from "./IsoDate";
import { parseIsin } from "./Isin";
import { type FundCommand, type StatementInput, applyImport, planImport } from "./ImportPlan";
import { EMPTY_LEDGER, type LedgerState, validateLedger } from "./Ledger";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "./Money";

function euros(value: number): EuroCents {
  const result = toEuroCents(Math.round(value * 100));
  if (result === null) throw new Error("bad amount");
  return result;
}

function date(text: string): IsoDate {
  const result = parseIsoDate(text);
  if (result === null) throw new Error("bad date");
  return result;
}

/** A valid invented ISIN built from a short code. */
function isin(code: string): string {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XS${code.padEnd(9, "0")}${String(digit)}`);
    if (candidate !== null) return candidate;
  }
  throw new Error("no check digit");
}

const A = isin("FUNDA");
const B = isin("FUNDB");
const C = isin("FUNDC");

function statement(funds: readonly [string, string, number][]): StatementInput {
  const listed = funds.map(([code, name, value]) => ({ isin: code, name, marketValue: euros(value) }));
  const subtotal = toEuroCents(listed.reduce((sum, fund) => sum + fund.marketValue, 0));
  if (subtotal === null) throw new Error("bad subtotal");
  return { funds: listed, fundsSubtotal: subtotal };
}

function command(code: string, action: FundCommand["action"], extra: Partial<FundCommand> = {}): FundCommand {
  return { isin: code, action, moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "", ...extra };
}

function applied(state: LedgerState, input: StatementInput, on: string, commands: FundCommand[], revision = "r") {
  const result = applyImport(state, input, date(on), commands, revision);
  if (!result.ok) throw new Error(`expected success: ${JSON.stringify(result.issues)}`);
  return result.state;
}

function rejected(state: LedgerState, input: StatementInput, on: string, commands: FundCommand[]) {
  const result = applyImport(state, input, date(on), commands, "r");
  if (result.ok) throw new Error("expected failure");
  return result.issues;
}

/** January: A (1,000.00) and B (500.00), opening net invested 900.00 and 450.00. */
function january(): LedgerState {
  return applied(
    EMPTY_LEDGER,
    statement([[A, "Fund A", 1000], [B, "Fund B", 500]]),
    "2026-01-15",
    [
      command(A, "Start", { openingNetInvested: euros(900) }),
      command(B, "Start", { openingNetInvested: euros(450) }),
    ],
    "r1",
  );
}

describe("the first statement", () => {
  it("plans every fund as an opening and records opening net invested", () => {
    const input = statement([[A, "Fund A", 1000], [B, "Fund B", 500]]);
    expect(planImport(EMPTY_LEDGER, input).map((row) => row.detected)).toEqual(["Opening", "Opening"]);
    const state = january();
    expect(state.revision).toBe("r1");
    expect(state.funds.map((fund) => [fund.isin, fund.name, fund.firstDate])).toEqual([
      [A, "Fund A", "2026-01-15"],
      [B, "Fund B", "2026-01-15"],
    ]);
    expect(state.snapshots[0]?.holdings[A]).toMatchObject({ value: euros(1000), netInvested: euros(900), action: "Start", status: "active" });
    expect(validateLedger(state)).toEqual([]);
  });

  it("requires the opening amount and no cash movements", () => {
    const input = statement([[A, "Fund A", 1000]]);
    expect(rejected(EMPTY_LEDGER, input, "2026-01-15", [command(A, "Start")]).map((issue) => issue.code)).toEqual(["invalid-command"]);
    expect(
      rejected(EMPTY_LEDGER, input, "2026-01-15", [command(A, "Start", { openingNetInvested: euros(900), moneyIn: euros(5) })]),
    ).toHaveLength(1);
  });
});

describe("a later statement", () => {
  it("explains net invested through cash in and out", () => {
    const next = applied(
      january(),
      statement([[A, "Fund A", 1100], [B, "Fund B", 520]]),
      "2026-02-10",
      [
        command(A, "Keep", { moneyIn: euros(100) }),
        command(B, "Keep", { moneyOut: euros(50), comment: "partial withdrawal" }),
      ],
    );
    expect(next.snapshots[1]?.holdings[A]).toMatchObject({ netInvested: euros(1000), moneyIn: euros(100) });
    expect(next.snapshots[1]?.holdings[B]).toMatchObject({ netInvested: euros(400), moneyOut: euros(50) });
    expect(validateLedger(next)).toEqual([]);
  });

  it("allows a gap of months and rejects the same or an earlier month", () => {
    const input = statement([[A, "Fund A", 1000], [B, "Fund B", 500]]);
    const keeps = [command(A, "Keep"), command(B, "Keep")];
    expect(applied(january(), input, "2026-06-01", keeps).snapshots).toHaveLength(2);
    expect(rejected(january(), input, "2026-01-31", keeps).map((issue) => issue.code)).toContain("date-not-later");
    expect(rejected(january(), input, "2025-12-31", keeps).map((issue) => issue.code)).toContain("date-not-later");
  });

  it("detects a new fund and requires it to be added", () => {
    const input = statement([[A, "Fund A", 1000], [B, "Fund B", 500], [C, "Fund C", 300]]);
    expect(planImport(january(), input).map((row) => row.detected)).toEqual(["Held", "Held", "New"]);
    const next = applied(january(), input, "2026-02-10", [
      command(A, "Keep"),
      command(B, "Keep"),
      command(C, "Add", { moneyIn: euros(290), name: "My climate fund" }),
    ]);
    expect(next.funds.find((fund) => fund.isin === C)).toMatchObject({ name: "My climate fund", fullName: "Fund C", firstDate: "2026-02-10" });
    expect(next.snapshots[1]?.holdings[C]).toMatchObject({ netInvested: euros(290), action: "Add" });
    expect(rejected(january(), input, "2026-02-10", [command(A, "Keep"), command(B, "Keep"), command(C, "Keep")])).toHaveLength(1);
  });

  it("never treats a missing fund as sold: it needs an explicit Close with the proceeds", () => {
    const input = statement([[A, "Fund A", 1000]]);
    expect(planImport(january(), input).map((row) => [row.isin, row.detected])).toEqual([[A, "Held"], [B, "Missing"]]);
    expect(rejected(january(), input, "2026-02-10", [command(A, "Keep"), command(B, "Keep")])).toHaveLength(1);
    const next = applied(january(), input, "2026-02-10", [command(A, "Keep"), command(B, "Close", { moneyOut: euros(510) })]);
    expect(next.snapshots[1]?.holdings[B]).toMatchObject({ status: "closed", value: ZERO_CENTS, netInvested: euros(-60), action: "Close" });
    expect(validateLedger(next)).toEqual([]);
  });

  it("refuses to close a fund that still has value, but lets a zero position stay or close", () => {
    const withValue = statement([[A, "Fund A", 1000], [B, "Fund B", 500]]);
    expect(rejected(january(), withValue, "2026-02-10", [command(A, "Keep"), command(B, "Close")])).toHaveLength(1);
    const zero = statement([[A, "Fund A", 1000], [B, "Fund B", 0]]);
    expect(applied(january(), zero, "2026-02-10", [command(A, "Keep"), command(B, "Keep")]).snapshots[1]?.holdings[B]?.status).toBe("active");
    expect(applied(january(), zero, "2026-02-10", [command(A, "Keep"), command(B, "Close", { moneyOut: euros(450) })]).snapshots[1]?.holdings[B]?.status).toBe("closed");
  });
});

describe("a closed fund", () => {
  function closedB(): LedgerState {
    return applied(january(), statement([[A, "Fund A", 1000]]), "2026-02-10", [command(A, "Keep"), command(B, "Close", { moneyOut: euros(510) })]);
  }

  it("stays closed when absent or listed at zero, and keeps its history", () => {
    const absent = statement([[A, "Fund A", 1000]]);
    expect(planImport(closedB(), absent).map((row) => [row.isin, row.detected])).toEqual([[A, "Held"], [B, "Closed"]]);
    const zeroListed = statement([[A, "Fund A", 1000], [B, "Fund B", 0]]);
    expect(planImport(closedB(), zeroListed).map((row) => row.detected)).toEqual(["Held", "Closed"]);
    const next = applied(closedB(), absent, "2026-03-10", [command(A, "Keep"), command(B, "Closed")]);
    expect(next.funds.map((fund) => fund.isin)).toEqual([A, B]);
    expect(next.snapshots[2]?.holdings[B]).toMatchObject({ status: "closed", netInvested: euros(-60) });
  });

  it("needs an explicit Reopen when value returns", () => {
    const back = statement([[A, "Fund A", 1000], [B, "Fund B", 200]]);
    expect(planImport(closedB(), back).map((row) => row.detected)).toEqual(["Held", "Reappeared"]);
    expect(rejected(closedB(), back, "2026-03-10", [command(A, "Keep"), command(B, "Keep")])).toHaveLength(1);
    const next = applied(closedB(), back, "2026-03-10", [command(A, "Keep"), command(B, "Reopen", { moneyIn: euros(190) })]);
    expect(next.snapshots[2]?.holdings[B]).toMatchObject({ status: "active", action: "Reopen", netInvested: euros(130) });
  });

  it("takes no new money, and explains late proceeds", () => {
    const absent = statement([[A, "Fund A", 1000]]);
    expect(rejected(closedB(), absent, "2026-03-10", [command(A, "Keep"), command(B, "Closed", { moneyIn: euros(1) })])).toHaveLength(1);
    expect(rejected(closedB(), absent, "2026-03-10", [command(A, "Keep"), command(B, "Closed", { moneyOut: euros(5) })])).toHaveLength(1);
    const next = applied(closedB(), absent, "2026-03-10", [
      command(A, "Keep"),
      command(B, "Closed", { moneyOut: euros(5), comment: "final settlement" }),
    ]);
    expect(next.snapshots[2]?.holdings[B]?.netInvested).toBe(euros(-65));
  });
});

describe("rejecting bad input", () => {
  const input = statement([[A, "Fund A", 1000], [B, "Fund B", 500]]);

  it("rejects decisions that do not match the funds, by ISIN", () => {
    expect(rejected(january(), input, "2026-02-10", [command(A, "Keep")])).toHaveLength(1);
    expect(rejected(january(), input, "2026-02-10", [command(A, "Keep"), command(A, "Keep")])).toHaveLength(1);
    expect(rejected(january(), input, "2026-02-10", [command(A, "Keep"), command(B, "Keep"), command(C, "Add")])).toHaveLength(1);
  });

  it("rejects negative or fractional money", () => {
    const negative = { ...command(A, "Keep"), moneyIn: -1 as EuroCents };
    expect(rejected(january(), input, "2026-02-10", [negative, command(B, "Keep")])).toHaveLength(1);
    const fractional = { ...command(A, "Keep"), moneyOut: 1.5 as EuroCents };
    expect(rejected(january(), input, "2026-02-10", [fractional, command(B, "Keep")])).toHaveLength(1);
  });

  it("rejects a subtotal that the holdings do not add up to", () => {
    const wrong: StatementInput = { ...input, fundsSubtotal: euros(1501) };
    const issues = rejected(january(), wrong, "2026-02-10", [command(A, "Keep"), command(B, "Keep")]);
    expect(issues.map((issue) => issue.code)).toContain("does-not-reconcile");
  });

  it("rejects an unsafe name for a new fund", () => {
    const withNew = statement([[A, "Fund A", 1000], [B, "Fund B", 500], [C, "Fund C", 300]]);
    const issues = rejected(january(), withNew, "2026-02-10", [
      command(A, "Keep"),
      command(B, "Keep"),
      command(C, "Add", { name: "=SUM(A1)" }),
    ]);
    expect(issues).toHaveLength(1);
  });

  it("does not change the ledger it was given", () => {
    const before = january();
    const snapshot = JSON.stringify(before);
    applied(before, input, "2026-02-10", [command(A, "Keep", { moneyIn: euros(10) }), command(B, "Keep")]);
    rejected(before, input, "2026-02-10", [command(A, "Keep")]);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("validateLedger", () => {
  it("catches a tampered net invested figure", () => {
    const state = january();
    const first = state.snapshots[0];
    if (first === undefined) throw new Error("no snapshot");
    const holding = first.holdings[A];
    if (holding === undefined) throw new Error("no holding");
    const tampered: LedgerState = {
      ...state,
      snapshots: [{ ...first, holdings: { ...first.holdings, [A]: { ...holding, value: euros(999) } } }],
    };
    expect(validateLedger(tampered).map((issue) => issue.code)).toContain("does-not-reconcile");
  });

  it("catches a broken cash chain between statements", () => {
    const next = applied(january(), statement([[A, "Fund A", 1000], [B, "Fund B", 500]]), "2026-02-10", [
      command(A, "Keep", { moneyIn: euros(10) }),
      command(B, "Keep"),
    ]);
    const second = next.snapshots[1];
    const holding = second?.holdings[A];
    if (second === undefined || holding === undefined) throw new Error("missing");
    const tampered: LedgerState = {
      ...next,
      snapshots: [next.snapshots[0] ?? second, { ...second, holdings: { ...second.holdings, [A]: { ...holding, netInvested: euros(5) } } }],
    };
    expect(validateLedger(tampered).map((issue) => issue.code)).toContain("invalid-cash");
  });

  it("accepts the empty ledger", () => {
    expect(validateLedger(EMPTY_LEDGER)).toEqual([]);
  });
});
