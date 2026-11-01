import { describe, expect, it } from "vitest";
import { type FundCommand, type StatementInput, applyImport } from "./ImportPlan";
import { type IsoDate, parseIsoDate } from "./IsoDate";
import { parseIsin } from "./Isin";
import { EMPTY_LEDGER, type LedgerState } from "./Ledger";
import { computeMetrics } from "./Metrics";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "./Money";

// Every expected figure below was worked out by hand from the stated inputs,
// independently of any spreadsheet output.

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

function isin(code: string): string {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XS${code.padEnd(9, "0")}${String(digit)}`);
    if (candidate !== null) return candidate;
  }
  throw new Error("no check digit");
}

const A = isin("FUNDA");
const B = isin("FUNDB");

function statement(funds: readonly [string, number][]): StatementInput {
  const listed = funds.map(([code, value]) => ({ isin: code, name: `Fund ${code.slice(2, 7)}`, marketValue: euros(value) }));
  const subtotal = toEuroCents(listed.reduce((sum, fund) => sum + fund.marketValue, 0));
  if (subtotal === null) throw new Error("bad subtotal");
  return { funds: listed, fundsSubtotal: subtotal };
}

function command(code: string, action: FundCommand["action"], extra: Partial<FundCommand> = {}): FundCommand {
  return { isin: code, action, moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "", ...extra };
}

function record(state: LedgerState, on: string, funds: readonly [string, number][], commands: FundCommand[]): LedgerState {
  const result = applyImport(state, statement(funds), date(on), commands, on);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.state;
}

/** January: A 1,000 (net 900) and B 500 (net 450). February: A 1,100 (+100 cash), B 520 (-50 cash). */
function twoMonths(): LedgerState {
  const january = record(EMPTY_LEDGER, "2026-01-15", [[A, 1000], [B, 500]], [
    command(A, "Start", { openingNetInvested: euros(900) }),
    command(B, "Start", { openingNetInvested: euros(450) }),
  ]);
  return record(january, "2026-02-14", [[A, 1100], [B, 520]], [
    command(A, "Keep", { moneyIn: euros(100) }),
    command(B, "Keep", { moneyOut: euros(50) }),
  ]);
}

describe("computeMetrics", () => {
  it("returns nothing for an empty ledger", () => {
    expect(computeMetrics(EMPTY_LEDGER)).toEqual([]);
  });

  it("opening statement: gain is value minus net invested and nothing is compared yet", () => {
    const [january] = computeMetrics(twoMonths());
    expect(january).toMatchObject({
      total: euros(1500), invested: euros(1350), gain: euros(150), consecutive: false,
      periodGain: null, monthlyGain: null, monthlyGainPercent: null,
      yearToDateGain: null, yearOverYearGain: null, estimated: false,
    });
    expect(january?.gainPercent).toBeCloseTo(150 / 1350, 12);
  });

  it("second month: gain 1,620 - 1,400 = 220, month on month 220 - 150 = 70", () => {
    const february = computeMetrics(twoMonths())[1];
    expect(february).toMatchObject({
      total: euros(1620), invested: euros(1400), gain: euros(220),
      consecutive: true, periodGain: euros(70), monthlyGain: euros(70), estimated: true,
    });
    // Denominator: previous total 1,500 + net cash this period (1,400 - 1,350 = 50) = 1,550.
    expect(february?.monthlyGainPercent).toBeCloseTo(70 / 1550, 12);
    expect(february?.gainPercent).toBeCloseTo(220 / 1400, 12);
  });

  it("year to date uses the January statement of the same year; year on year needs the same month last year", () => {
    const february = computeMetrics(twoMonths())[1];
    expect(february?.yearToDateGain).toBe(euros(70));
    expect(february?.yearToDatePercent).toBeCloseTo(70 / 1500, 12);
    expect(february?.yearOverYearGain).toBeNull();
    expect(computeMetrics(twoMonths())[0]?.yearToDateGain).toBeNull();
  });

  it("per fund: gain, share and month on month with the cash-adjusted denominator", () => {
    const funds = computeMetrics(twoMonths())[1]?.funds;
    // A: gain 1,100 - 1,000 = 100; was 100; no change. Denominator 1,000 + 100 - 0.
    expect(funds?.[A]).toMatchObject({ gain: euros(100), monthlyGain: ZERO_CENTS });
    expect(funds?.[A]?.gainPercent).toBeCloseTo(0.1, 12);
    expect(funds?.[A]?.monthlyGainPercent).toBeCloseTo(0, 12);
    expect(funds?.[A]?.share).toBeCloseTo(1100 / 1620, 12);
    // B: gain 520 - 400 = 120; was 50; change 70. Denominator 500 + 0 - 50 = 450.
    expect(funds?.[B]).toMatchObject({ gain: euros(120), monthlyGain: euros(70) });
    expect(funds?.[B]?.gainPercent).toBeCloseTo(0.3, 12);
    expect(funds?.[B]?.monthlyGainPercent).toBeCloseTo(70 / 450, 12);
  });

  it("a gap in months keeps the change since last statement but not month on month", () => {
    const state = record(twoMonths(), "2026-05-10", [[A, 1200], [B, 540]], [command(A, "Keep"), command(B, "Keep")]);
    const may = computeMetrics(state)[2];
    // Gain 1,740 - 1,400 = 340; was 220; change 120.
    expect(may).toMatchObject({ gain: euros(340), consecutive: false, periodGain: euros(120), monthlyGain: null, monthlyGainPercent: null });
    expect(may?.funds[A]?.monthlyGain).toBeNull();
    expect(may?.yearToDateGain).toBe(euros(190));
  });

  it("year on year compares the same calendar month; year to date restarts each year", () => {
    let state = twoMonths();
    state = record(state, "2027-01-20", [[A, 1300], [B, 600]], [command(A, "Keep"), command(B, "Keep")]);
    state = record(state, "2027-02-18", [[A, 1350], [B, 610]], [command(A, "Keep"), command(B, "Keep")]);
    const [, february2026, january2027, february2027] = computeMetrics(state);
    // January 2027: gain 1,900 - 1,400 = 500 against January 2026 gain 150: change 350 on a base of 1,500.
    expect(january2027?.yearOverYearGain).toBe(euros(350));
    expect(january2027?.yearOverYearPercent).toBeCloseTo(350 / 1500, 12);
    expect(january2027?.yearToDateGain).toBeNull();
    // February 2027: gain 1,960 - 1,400 = 560 against February 2026 gain 220: change 340 on a base of 1,620.
    expect(february2027?.yearOverYearGain).toBe(euros(340));
    expect(february2027?.yearOverYearPercent).toBeCloseTo(340 / 1620, 12);
    // Year to date since the January 2027 statement: 560 - 500 = 60 on a base of 1,900.
    expect(february2027?.yearToDateGain).toBe(euros(60));
    expect(february2027?.yearToDatePercent).toBeCloseTo(60 / 1900, 12);
    expect(february2026?.yearOverYearGain).toBeNull();
  });

  it("a sold fund keeps its realised result in the totals, and its percentage is unavailable", () => {
    // B is sold in March for 530 (net invested 400 - 530 = -130).
    const state = record(twoMonths(), "2026-03-12", [[A, 1200]], [command(A, "Keep"), command(B, "Close", { moneyOut: euros(530) })]);
    const march = computeMetrics(state)[2];
    // Invested 1,000 + (-130) = 870; gain 1,200 - 870 = 330 = A's 200 + B's realised 130.
    expect(march).toMatchObject({ total: euros(1200), invested: euros(870), gain: euros(330) });
    expect(march?.funds[B]).toMatchObject({ value: ZERO_CENTS, netInvested: euros(-130), gain: euros(130), status: "closed" });
    expect(march?.funds[B]?.gainPercent).toBeNull();
    expect(march?.funds[B]?.share).toBeCloseTo(0, 12);
    // Not comparable as a return: the fund is closed in March, so its month-on-month rate is unavailable.
    expect(march?.funds[B]?.monthlyGainPercent).toBeNull();
  });

  it("is deterministic and does not modify the ledger", () => {
    const state = twoMonths();
    const before = JSON.stringify(state);
    expect(computeMetrics(state)).toEqual(computeMetrics(state));
    expect(JSON.stringify(state)).toBe(before);
  });
});
