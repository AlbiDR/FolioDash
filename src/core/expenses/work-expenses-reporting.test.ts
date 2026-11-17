import { describe, expect, it } from "vitest";
import {
  type ExpenseAmounts,
  expenseDayKind,
  expenseReport,
  expenseEntryStatus,
  expenseTotals,
  expenseWeek,
  sumExpenseAmounts,
  sumExpenseDays,
} from "./work-expenses";
import { cents, date, day } from "./work-expenses-builders";

describe("canonical expense reporting", () => {
  it("includes otherwise complete days with blank extras in daily, weekly and monthly averages", () => {
    const first: ExpenseAmounts = Object.freeze([cents(200), cents(800), cents(200), null, null]);
    const days = Object.freeze([
      Object.freeze(day("2026-01-01", null)),
      Object.freeze(day("2026-01-05", null, { amounts: first })),
      Object.freeze(day("2026-01-06", null, { amounts: [cents(200), cents(0), cents(200), null, null] })),
      Object.freeze(day("2026-01-07", null, { amounts: [cents(0), cents(0), cents(0), null, null] })),
    ]);
    const before = JSON.stringify(days);
    const report = expenseReport(days, 2026, date("2026-02-02"));
    expect(report.completeDays).toBe(3);
    expect(report.partialDays).toBe(0);
    expect(report.averageDaily).toBe(533);
    expect(report.averageWeekly).toBe(1600);
    expect(report.averageMonthly).toBe(1600);
    expect(report.totalYearly).toBe(1600);
    expect(report.yearlyProjection).toBe(139200);
    expect(report.eligibleWeeks).toBe(1);
    expect(report.eligibleMonths).toBe(1);
    expect(JSON.stringify(days)).toBe(before);
    expect(first[3]).toBeNull();
    expect(first[4]).toBeNull();
  });

  it("adds entered dinner and other costs to the same averages and totals without requiring either field", () => {
    const days = [
      day("2026-01-05", null, { amounts: [cents(200), cents(800), cents(200), null, null] }),
      day("2026-01-06", null, { amounts: [cents(200), cents(800), cents(200), cents(1500), cents(350)] }),
      day("2026-01-07", null, { amounts: [cents(0), cents(0), cents(0), null, null] }),
    ];
    const report = expenseReport(days, 2026, date("2026-01-08"));
    expect(report.completeDays).toBe(3);
    expect(report.averageDaily).toBe(1417);
    expect(report.totalYearly).toBe(4250);
    expect(report.categoryTotals).toEqual([400, 1600, 400, 1500, 350]);
    expect(report.yearlyProjection).toBe(369750);
  });

  it("still excludes a period with incomplete routine costs and no optional entry", () => {
    const days = [
      day("2026-01-01", null),
      day("2026-01-05", null, { amounts: [cents(200), cents(800), cents(200), null, null] }),
      day("2026-01-06", null, { amounts: [cents(200), null, cents(200), null, null] }),
    ];
    const report = expenseReport(days, 2026, date("2026-02-02"));
    expect(report.completeDays).toBe(1);
    expect(report.partialDays).toBe(1);
    expect(report.averageDaily).toBe(1200);
    expect(report.averageWeekly).toBeNull();
    expect(report.averageMonthly).toBeNull();
    expect(report.totalYearly).toBe(1600);
  });

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
    const days = [
      day("2026-11-02", 1000),
      day("2026-11-03", 0),
      day("2026-11-04", null, { amounts: [null, cents(400), null, null, null] }),
      day("2026-11-06", 8000),
    ];
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
    const report = expenseReport(
      [day("2026-11-02", null, { amounts: [null, cents(900), null, null, null] })],
      2026,
      date("2026-12-01"),
    );
    expect(report.partialDays).toBe(1);
    expect(report.completeDays).toBe(0);
    expect(report.totalYearly).toBe(900);
    expect(report.averageDaily).toBeNull();
    expect(report.averageWeekly).toBeNull();
    expect(report.averageMonthly).toBeNull();
    expect(report.yearlyProjection).toBeNull();
  });

  it("uses complete, finished weeks within coverage and drops a week with a partial day", () => {
    const days = [
      day("2026-01-05", 1000),
      day("2026-01-09", 0),
      day("2026-01-12", 3000),
      day("2026-01-13", null, { amounts: [cents(10), null, null, null, null] }),
      day("2026-01-19", 3000),
    ];
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
    const february = [
      day("2026-02-02", 3000),
      day("2026-02-03", null, { amounts: [null, cents(500), null, null, null] }),
    ];
    const report = expenseReport([coverage, ...january, ...february], 2026, date("2026-03-02"));
    expect(report.eligibleMonths).toBe(1);
    expect(report.averageMonthly).toBe(1000);
    expect(report.totalYearly).toBe(4500);
    expect(report.completeDays).toBe(3);
  });

  it("never crosses selected-year boundaries to form a completed week", () => {
    const report = expenseReport(
      [day("2025-12-29", 500), day("2026-01-01", 2000), day("2026-12-31", 4000)],
      2026,
      date("2027-01-04"),
    );
    expect(report.averageDaily).toBe(3000);
    expect(report.totalYearly).toBe(6000);
    expect(report.eligibleWeeks).toBe(0);
  });

  it("calculates typical periods and yearly projection from unrounded daily cents and rounds half up once", () => {
    const report = expenseReport(
      [day("2026-01-05", 1), day("2026-01-06", 0)],
      2026,
      date("2026-01-07"),
      "typical-periods",
    );
    expect(report.averageDaily).toBe(1);
    expect(report.averageWeekly).toBe(3);
    expect(report.averageMonthly).toBe(11);
    expect(report.yearlyProjection).toBe(131);
    expect(report.weekdaysInYear).toBe(261);
    expect(expenseReport([], 2024, date("2026-01-01")).weekdaysInYear).toBe(262);
  });

  it("separates selected-year totals from unrelated history and ignores future observations", () => {
    const report = expenseReport(
      [day("2025-12-31", 500), day("2026-01-01", 2000), day("2026-11-06", 9000)],
      2026,
      date("2026-01-01"),
    );
    expect(report.completeDays).toBe(1);
    expect(report.totalYearly).toBe(2000);
    expect(report.excludedFutureDays).toBe(1);
    expect(report.startDate).toBe("2025-12-31");
  });

  it("retains fifth-category spending as a complete day in a weekly readout", () => {
    const days = [
      day("2026-11-02", 100),
      day("2026-11-03", null, { amounts: [null, null, null, null, cents(500)] }),
      day("2026-11-06", 900),
    ];
    const week = expenseWeek(days, date("2026-11-05"), date("2026-11-05"));
    expect(week.total).toBe(600);
    expect(week.partialDays).toBe(0);
    expect(week.completeDays).toBe(2);
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

describe("optional work costs can close a day", () => {
  it.each([3, 4])("accepts category %i alone, including zero, and preserves every blank", (index) => {
    for (const amount of [cents(0), cents(500)]) {
      const amounts = [null, null, null, null, null].map((_, field) =>
        field === index ? amount : null,
      ) as unknown as ExpenseAmounts;
      const before = JSON.stringify(amounts);
      expect(expenseEntryStatus(amounts)).toEqual({ filled: 1, missingRequired: [], complete: true, partial: false });
      expect(expenseDayKind(day("2026-01-05", null, { amounts }), date("2026-01-05"), date("2026-01-06"))).toBe(
        "complete",
      );
      expect(JSON.stringify(amounts)).toBe(before);
    }
  });

  it("includes optional-only and mixed days in averages without filling routine blanks", () => {
    const days = [
      day("2026-01-01", null),
      day("2026-01-05", null, { amounts: [null, null, null, cents(1500), null] }),
      day("2026-01-06", null, { amounts: [null, null, null, null, cents(500)] }),
      day("2026-01-07", null, { amounts: [null, null, null, cents(0), null] }),
      day("2026-01-08", null, { amounts: [cents(200), null, null, null, cents(200)] }),
    ];
    const before = JSON.stringify(days);
    const report = expenseReport(days, 2026, date("2026-02-02"));
    expect(report.completeDays).toBe(4);
    expect(report.partialDays).toBe(0);
    expect(report.averageDaily).toBe(600);
    expect(report.averageWeekly).toBe(2400);
    expect(report.averageMonthly).toBe(2400);
    expect(report.totalYearly).toBe(2400);
    expect(report.yearlyProjection).toBe(156600);
    expect(JSON.stringify(days)).toBe(before);
  });
});
