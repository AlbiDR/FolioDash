import { describe, expect, it } from "vitest";
import { type IsoDate, parseIsoDate } from "./IsoDate";
import { type EuroCents, toEuroCents } from "./Money";
import {
  type ExpenseAmounts, type ExpenseDay, adjacentWorkday, expenseDayKind, expenseReport,
  expenseTotals, expenseWeek, expenseWeekday, filledExpenseFields, isWorkday,
  parseExpenseAmounts, parseExpenseCommand, parseExpenseDay, shiftDate, sumExpenseAmounts,
  sumExpenseDays, weekDates,
} from "./WorkExpenses";

function date(value: string): IsoDate {
  const parsed = parseIsoDate(value);
  if (parsed === null) throw new Error("Invalid synthetic date");
  return parsed;
}

function cents(value: number): EuroCents {
  const parsed = toEuroCents(value);
  if (parsed === null) throw new Error("Invalid synthetic cents");
  return parsed;
}

function day(on: string, total: number | null, extra: Partial<ExpenseDay> = {}): ExpenseDay {
  return { date: date(on), revision: on, amounts: [total === null ? null : cents(total), total === null ? null : cents(0), total === null ? null : cents(0), total === null ? null : cents(0), total === null ? null : cents(0)], ...extra };
}

describe("work-expense date arithmetic", () => {
  it("uses a Monday-based workweek without locale, clock or time-zone state", () => {
    expect(expenseWeekday(date("1900-01-01"))).toBe(0);
    expect(expenseWeekday(date("1970-01-01"))).toBe(3);
    expect(expenseWeekday(date("2026-11-05"))).toBe(3);
    expect(isWorkday(date("2026-11-07"))).toBe(false);
    expect(isWorkday(date("2026-11-08"))).toBe(false);
    expect(weekDates(date("2026-11-08"))).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  });

  it("navigates across weekends, leap days and year boundaries", () => {
    expect(adjacentWorkday(date("2026-11-06"), 1)).toBe("2026-11-09");
    expect(adjacentWorkday(date("2026-11-09"), -1)).toBe("2026-11-06");
    expect(shiftDate(date("2024-02-28"), 1)).toBe("2024-02-29");
    expect(shiftDate(date("2024-02-29"), 1)).toBe("2024-03-01");
    expect(shiftDate(date("2026-12-31"), 1)).toBe("2027-01-01");
    expect(shiftDate(date("1900-01-01"), -1)).toBeNull();
    expect(shiftDate(date("2999-12-31"), 1)).toBeNull();
    expect(shiftDate(date("2026-11-05"), 0.5)).toBeNull();
  });

  it("round trips every day of leap and non-leap years", () => {
    for (const year of [1900, 2000, 2024, 2026]) {
      let current = date(`${String(year)}-01-01`);
      for (let index = 0; index < 364; index++) {
        const next = shiftDate(current, 1);
        if (next === null) throw new Error("Unexpected date bound");
        expect(shiftDate(next, -1)).toBe(current);
        expect(expenseWeekday(next)).toBe((expenseWeekday(current) + 1) % 7);
        current = next;
      }
    }
  });
});

describe("expense boundaries and classification", () => {
  it("preserves blank and zero and includes the fifth category", () => {
    const amounts = parseExpenseAmounts([100, null, 0, 200, 350]);
    expect(amounts).toEqual([100, null, 0, 200, 350]);
    if (amounts === null) throw new Error("Invalid fixture");
    expect(filledExpenseFields(amounts)).toBe(4);
    expect(sumExpenseAmounts(amounts)).toBe(650);
  });

  it("rejects malformed, fractional, negative and overflowing amounts", () => {
    for (const value of [[], [0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [1.5, 0, 0, 0, 0], [-1, 0, 0, 0, 0], ["0", 0, 0, 0, 0], [NaN, 0, 0, 0, 0], [Infinity, 0, 0, 0, 0], [Number.MAX_SAFE_INTEGER, 1, 0, 0, 0]]) expect(parseExpenseAmounts(value)).toBeNull();
  });

  it("validates canonical weekday dates, revision and command ancestry", () => {
    expect(parseExpenseDay(day("2026-11-05", 0))).toEqual(day("2026-11-05", 0));
    expect(parseExpenseDay(day("2026-11-07", 0))).toBeNull();
    expect(parseExpenseDay({ ...day("2026-11-05", 0), date: " 2026-11-05" })).toBeNull();
    expect(parseExpenseDay({ ...day("2026-11-05", 0), revision: "" })).toBeNull();
    const command = { id: "synthetic-1", date: "2026-11-05", amounts: [0, null, 0, 0, 0], expectedRevision: null };
    expect(parseExpenseCommand(command)).toEqual(command);
    expect(parseExpenseCommand({ ...command, expectedRevision: "previous" })).toEqual({ ...command, expectedRevision: "previous" });
    expect(parseExpenseCommand({ ...command, expectedRevision: "" })).toBeNull();
    expect(parseExpenseCommand({ ...command, expectedRevision: undefined })).toBeNull();
    expect(parseExpenseCommand({ ...command, id: "conflict:reserved-revision-namespace" })).toBeNull();
  });

  it("keeps no work, real zero, incomplete data and untracked history distinct", () => {
    const today = date("2026-11-05");
    const start = date("2026-11-02");
    expect(expenseDayKind(undefined, date("2026-11-03"), today, start)).toBe("no-work");
    expect(expenseDayKind(day("2026-11-03", 0), date("2026-11-03"), today, start)).toBe("complete");
    expect(expenseDayKind(day("2026-11-03", null, { amounts: [null, cents(700), null, null, null] }), date("2026-11-03"), today, start)).toBe("partial");
    expect(expenseDayKind(undefined, date("2026-10-30"), today, start)).toBe("outside-history");
    expect(expenseDayKind(undefined, today, today, start)).toBe("not-entered");
    expect(expenseDayKind(undefined, date("2026-11-06"), today, start)).toBe("future");
    expect(expenseDayKind(undefined, date("2026-11-07"), today, start)).toBe("weekend");
  });
});

describe("canonical expense reporting", () => {
  it("does not fabricate metrics from an empty record", () => {
    const report = expenseReport([], 2026, date("2026-11-05"));
    expect(report.averageDaily).toBeNull();
    expect(report.averageWeekly).toBeNull();
    expect(report.averageMonthly).toBeNull();
    expect(report.totalYearly).toBeNull();
    expect(report.yearlyProjection).toBeNull();
    expect(report.startDate).toBeNull();
    expect(report.weekdaysInYear).toBe(261);
  });

  it("includes zero-cost days in the daily denominator and known partial amounts in annual totals only", () => {
    const days = [day("2026-11-02", 1000), day("2026-11-03", 0), day("2026-11-04", null, { amounts: [null, cents(400), null, null, null] }), day("2026-11-06", 8000)];
    const report = expenseReport(days, 2026, date("2026-11-05"));
    expect(report.completeDays).toBe(2);
    expect(report.partialDays).toBe(1);
    expect(report.averageDaily).toBe(500);
    expect(report.totalYearly).toBe(1400);
    expect(report.categoryTotals).toEqual([1000, 400, 0, 0, 0]);
    expect(report.yearlyProjection).toBe(130500);
    expect(report.excludedFutureDays).toBe(1);
    expect(report.averageWeekly).toBeNull();
  });

  it("treats all-zero complete history as real zero metrics", () => {
    const report = expenseReport([day("2026-11-02", 0)], 2026, date("2026-11-10"));
    expect(report.averageDaily).toBe(0);
    expect(report.averageWeekly).toBe(0);
    expect(report.totalYearly).toBe(0);
    expect(report.yearlyProjection).toBe(0);
    expect(report.eligibleWeeks).toBe(1);
  });

  it("reports partial-only evidence without inventing complete-day averages or projections", () => {
    const report = expenseReport([day("2026-11-02", null, { amounts: [null, cents(700), null, null, cents(200)] })], 2026, date("2026-12-01"));
    expect(report.partialDays).toBe(1);
    expect(report.completeDays).toBe(0);
    expect(report.totalYearly).toBe(900);
    expect(report.averageDaily).toBeNull();
    expect(report.averageWeekly).toBeNull();
    expect(report.averageMonthly).toBeNull();
    expect(report.yearlyProjection).toBeNull();
  });

  it("uses complete, finished weeks within coverage and drops a week with a partial day", () => {
    const days = [day("2026-01-05", 1000), day("2026-01-09", 0), day("2026-01-12", 3000), day("2026-01-13", null, { amounts: [cents(10), null, null, null, null] }), day("2026-01-19", 3000)];
    const report = expenseReport(days, 2026, date("2026-01-20"));
    expect(report.eligibleWeeks).toBe(1);
    expect(report.averageWeekly).toBe(1000);
    expect(report.averageMonthly).toBeNull();
    expect(expenseReport(days, 2026, date("2026-01-09")).averageWeekly).toBeNull();
  });

  it("does not claim a partially tracked first week/month or an all-no-work week is an average observation", () => {
    const report = expenseReport([day("2026-01-06", 1000), day("2026-01-12", null)], 2026, date("2026-02-01"));
    expect(report.eligibleWeeks).toBe(0);
    expect(report.eligibleMonths).toBe(0);
  });

  it("averages monthly period totals and excludes a month containing partial entries", () => {
    const coverage = day("2025-12-01", 100);
    const january = [day("2026-01-06", 1000), day("2026-01-20", 0)];
    const february = [day("2026-02-02", 3000), day("2026-02-03", null, { amounts: [null, cents(500), null, null, null] })];
    const report = expenseReport([coverage, ...january, ...february], 2026, date("2026-03-02"));
    expect(report.eligibleMonths).toBe(1);
    expect(report.averageMonthly).toBe(1000);
    expect(report.totalYearly).toBe(4500);
    expect(report.completeDays).toBe(3);
  });

  it("never crosses selected-year boundaries to form a completed week", () => {
    const report = expenseReport([day("2025-12-29", 500), day("2026-01-01", 2000), day("2026-12-31", 4000)], 2026, date("2027-01-04"));
    expect(report.averageDaily).toBe(3000);
    expect(report.totalYearly).toBe(6000);
    expect(report.eligibleWeeks).toBe(0);
  });

  it("calculates typical periods and yearly projection from unrounded daily cents and rounds half up once", () => {
    const report = expenseReport([day("2026-01-05", 1), day("2026-01-06", 0)], 2026, date("2026-01-07"), "typical-periods");
    expect(report.averageDaily).toBe(1);
    expect(report.averageWeekly).toBe(3);
    expect(report.averageMonthly).toBe(11);
    expect(report.yearlyProjection).toBe(131);
    expect(report.weekdaysInYear).toBe(261);
    expect(expenseReport([], 2024, date("2026-01-01")).weekdaysInYear).toBe(262);
  });

  it("separates selected-year totals from unrelated history and ignores future observations", () => {
    const report = expenseReport([day("2025-12-31", 500), day("2026-01-01", 2000), day("2026-11-06", 9000)], 2026, date("2026-01-01"));
    expect(report.completeDays).toBe(1);
    expect(report.totalYearly).toBe(2000);
    expect(report.excludedFutureDays).toBe(1);
    expect(report.startDate).toBe("2025-12-31");
  });

  it("retains the fifth category and partial-day evidence in a weekly readout", () => {
    const days = [day("2026-11-02", 100), day("2026-11-03", null, { amounts: [null, null, null, null, cents(500)] }), day("2026-11-06", 900)];
    const week = expenseWeek(days, date("2026-11-05"), date("2026-11-05"));
    expect(week.total).toBe(600);
    expect(week.partialDays).toBe(1);
    expect(week.categoryTotals).toEqual([100, 0, 0, 0, 500]);
    expect(sumExpenseDays(days.slice(0, 2))).toBe(600);
  });

  it("surfaces overflow instead of returning a plausible imprecise amount", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const days = [day("2026-01-05", max), day("2026-01-06", max)];
    const report = expenseReport(days, 2026, date("2026-01-07"));
    expect(report.totalYearly).toBeNull();
    expect(report.yearlyProjection).toBeNull();
    expect(report.averageDaily).toBe(max);
    expect(report.overflow).toBe(true);
    expect(expenseTotals(days).categoryTotals[0]).toBeNull();
    expect(sumExpenseAmounts([cents(max), cents(1), null, null, null] as ExpenseAmounts)).toBeNull();
  });
});
