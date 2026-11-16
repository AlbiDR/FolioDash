import { describe, expect, it } from "vitest";
import { type FundCommand, type StatementInput, applyImport } from "../../../../core/ImportPlan";
import { type IsoDate, parseIsoDate } from "../../../../core/IsoDate";
import { parseIsin } from "../../../../core/Isin";
import { EMPTY_LEDGER, type LedgerState } from "../../../../core/Ledger";
import { ZERO_CENTS, toEuroCents, type EuroCents } from "../../../../core/Money";
import { overviewFromLedger } from "../../app/overviewFromLedger";
import { monthLabel, observationLabel, utcTime } from "./chartData";
import { computeDashboard } from "./dashboardData";

// Synthetic figures only. Every expected name below follows from the stated dates.

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

function statement(value: number): StatementInput {
  const marketValue = euros(value);
  return { funds: [{ isin: A, name: "Fund A", marketValue }], fundsSubtotal: marketValue };
}

function command(action: FundCommand["action"], extra: Partial<FundCommand> = {}): FundCommand {
  return { isin: A, action, moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "", ...extra };
}

/** Records fund A at each date with a rising value; the first statement opens it. */
function ledgerOn(...dates: string[]): LedgerState {
  let state = EMPTY_LEDGER;
  dates.forEach((on, index) => {
    const result = applyImport(state, statement(1000 + index * 50), date(on), [index === 0 ? command("Start", { openingNetInvested: euros(900) }) : command("Keep")], on);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    state = result.state;
  });
  return state;
}

describe("statement names in the overview model", () => {
  it("L4: names 15 Sep and 1 Nov as September and the October close, but month on month stays unavailable", () => {
    const model = overviewFromLedger(ledgerOn("2026-09-15", "2026-11-01"), "recorded");
    expect(model.labels.map((label) => label.short)).toEqual(["Sep 26", "Oct 26"]);
    const [, last] = model.months;
    // The months are not adjacent, so nothing claims "October's gain".
    expect(last?.monthlyGain).toBeNull();
    expect(last?.previousDate).toBe(date("2026-09-15"));
    expect(model.kpis.find((kpi) => kpi.label === "Month on month")?.comparedWith).toBeNull();
  });

  it("L5: a 1 January statement is the December close, yet year to date follows its actual date", () => {
    const model = overviewFromLedger(ledgerOn("2026-11-01", "2027-01-01"), "recorded");
    expect(model.labels.map((label) => label.short)).toEqual(["Oct 26", "Dec 26"]);
    const last = model.months[1];
    // As before: the first statement of its calendar year has no January baseline.
    expect(last?.yearToDateGain).toBeNull();
    expect(last?.yearToDateFrom).toBeNull();
    expect(model.kpis.find((kpi) => kpi.label === "Year to date")?.comparedWith).toBeNull();
  });

  it("L6: year on year names the statement actually used when export days differ across years", () => {
    const model = overviewFromLedger(ledgerOn("2025-11-01", "2026-11-14"), "recorded");
    expect(model.labels.map((label) => label.short)).toEqual(["Oct 25", "Nov 26"]);
    const last = model.months[1];
    expect(last?.yearOverYearFrom).toBe(date("2025-11-01"));
    expect(model.kpis.find((kpi) => kpi.label === "Year on year")?.comparedWith).toBe(date("2025-11-01"));
  });

  it("changes no figure: the same values on the 1st or the 15th give identical amounts", () => {
    const first = overviewFromLedger(ledgerOn("2026-09-01", "2026-10-01", "2026-11-01"), "recorded");
    const middle = overviewFromLedger(ledgerOn("2026-09-15", "2026-10-15", "2026-11-15"), "recorded");
    const amounts = (model: typeof first): unknown => model.months.map(({ value, gain, monthlyGain, yearToDateGain, yearOverYearGain }) => ({ value, gain, monthlyGain, yearToDateGain, yearOverYearGain }));
    expect(amounts(first)).toEqual(amounts(middle));
    expect(first.labels.map((label) => label.short)).toEqual(["Aug 26", "Sep 26", "Oct 26"]);
    expect(middle.labels.map((label) => label.short)).toEqual(["Sep 26", "Oct 26", "Nov 26"]);
  });
});

describe("chart naming", () => {
  const dates = [date("2026-09-15"), date("2026-11-01")];
  const model = overviewFromLedger(ledgerOn(...dates), "recorded");
  const name = observationLabel(model.dates, model.labels);

  it("X2: names a statement by its label and exact export date", () => {
    expect(name(utcTime(date("2026-09-15")))).toBe("Sep 26");
    expect(name(utcTime(date("2026-11-01")))).toBe("Oct 26, exported 1 November 2026");
  });

  it("X1: a calendar position that is not a statement keeps its calendar label", () => {
    // A generated axis tick on 1 October is not a statement, so it is never renamed.
    expect(name(utcTime(date("2026-10-01")))).toBe(monthLabel(utcTime(date("2026-10-01"))));
    expect(name(utcTime(date("2026-10-01")))).toBe("Oct 26");
  });

  it("B1: the monthly bars carry the short label and the exact date as detail", () => {
    const bars = computeDashboard(model, "All").bars;
    expect(bars.map((bar) => bar.label)).toEqual(["Sep 26", "Oct 26"]);
    expect(bars.map((bar) => bar.detail)).toEqual([null, "exported 1 November 2026"]);
  });
});
