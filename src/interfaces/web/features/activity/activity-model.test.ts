import { describe, expect, it } from "vitest";
import {
  EMPTY_EXPENSE_AMOUNTS,
  parseExpenseAmounts,
  sumExpenseDays,
  type ExpenseAmounts,
  type ExpenseDay,
} from "../../../../core/expenses/work-expenses";
import { parseIsoDate, type IsoDate } from "../../../../core/values/iso-date";
import {
  activityDaysFor,
  activityMonths,
  activityRows,
  activityTotals,
  activityWeeks,
  parseActivitySort,
  parseActivityStatus,
  type ActivityOptions,
} from "./activity-model";

// Synthetic days in cents. 2026-11-09 is a Monday.
function isoDate(text: string): IsoDate {
  const date = parseIsoDate(text);
  if (date === null) throw new Error(`Invalid fixture date: ${text}`);
  return date;
}

function amountsOf(values: readonly (number | null)[]): ExpenseAmounts {
  const parsed = parseExpenseAmounts(values);
  if (parsed === null) throw new Error(`Invalid fixture amounts: ${JSON.stringify(values)}`);
  return parsed;
}

function day(date: string, values: readonly (number | null)[]): ExpenseDay {
  return { date: isoDate(date), amounts: amountsOf(values), revision: `synthetic:${date}` };
}

const DAYS: readonly ExpenseDay[] = [
  day("2026-11-09", [24000, 70000, 24000, null, null]),
  day("2026-11-10", [24000, null, 24000, null, null]),
  day("2026-11-11", [0, 0, 0, null, null]),
  day("2026-11-12", EMPTY_EXPENSE_AMOUNTS),
  day("2026-11-13", [24000, 85000, null, 120000, null]),
  day("2026-10-30", [24000, null, null, null, null]),
];

const ALL: ActivityOptions = { status: "all", month: "", query: "", sort: "newest" };

function datesOf(options: Partial<ActivityOptions>): string[] {
  return activityRows(DAYS, { ...ALL, ...options }).map((row) => row.day.date);
}

describe("activityRows", () => {
  it("keeps only days with at least one recorded amount, newest first by default", () => {
    expect(datesOf({})).toEqual(["2026-11-13", "2026-11-11", "2026-11-10", "2026-11-09", "2026-10-30"]);
  });

  it("filters to complete or partial days without filling any gap", () => {
    expect(datesOf({ status: "complete" })).toEqual(["2026-11-13", "2026-11-11", "2026-11-09"]);
    expect(datesOf({ status: "partial" })).toEqual(["2026-11-10", "2026-10-30"]);
  });

  it("reports the missing required categories of a partial day", () => {
    const rows = activityRows(DAYS, { ...ALL, status: "partial" });
    expect(rows.find((row) => row.day.date === "2026-11-10")?.missingLabels).toEqual(["Lunch"]);
    expect(rows.find((row) => row.day.date === "2026-10-30")?.missingLabels).toEqual(["Lunch", "Inbound Commute"]);
    expect(rows.every((row) => !row.complete)).toBe(true);
  });

  it("filters by calendar month", () => {
    expect(datesOf({ month: "2026-10" })).toEqual(["2026-10-30"]);
    expect(datesOf({ month: "2026-11" })).toHaveLength(4);
  });

  it("searches dates, category names and amounts, case-insensitively", () => {
    // 2026-11-11 records a zero Lunch, so the category is present on that day even though its amount is nil.
    expect(datesOf({ query: "  LUNCH " })).toEqual(["2026-11-13", "2026-11-11", "2026-11-09"]);
    expect(datesOf({ query: "nov 10" })).toEqual(["2026-11-10"]);
    expect(datesOf({ query: "2026-10" })).toEqual(["2026-10-30"]);
    expect(datesOf({ query: "1.180,00" })).toEqual(["2026-11-09"]);
    expect(datesOf({ query: "no such shop" })).toEqual([]);
  });

  it("sorts oldest first and largest first", () => {
    expect(datesOf({ sort: "oldest" })).toEqual(["2026-10-30", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-13"]);
    expect(datesOf({ sort: "largest" })).toEqual([
      "2026-11-13",
      "2026-11-09",
      "2026-11-10",
      "2026-10-30",
      "2026-11-11",
    ]);
  });
});

describe("activityWeeks", () => {
  it("groups rows under their Monday, in the order of the sorted rows", () => {
    const weeks = activityWeeks(activityRows(DAYS, ALL));
    expect(weeks.map((week) => week.start)).toEqual(["2026-11-09", "2026-10-26"]);
    expect(weeks[0]?.rows.map((row) => row.day.date)).toEqual(["2026-11-13", "2026-11-11", "2026-11-10", "2026-11-09"]);
    expect(weeks[1]?.rows).toHaveLength(1);
  });
});

describe("activityMonths", () => {
  it("lists only months with recorded activity, newest first", () => {
    expect(activityMonths(DAYS).map((month) => month.key)).toEqual(["2026-11", "2026-10"]);
  });
});

describe("activityTotals", () => {
  it("uses the canonical expense totals of the rows shown, with partial days counted apart", () => {
    const rows = activityRows(DAYS, ALL);
    const totals = activityTotals(rows);
    expect(totals.total).toBe(419000);
    expect(totals.completeDays).toBe(3);
    expect(totals.partialDays).toBe(2);
    expect(totals.total).toBe(sumExpenseDays(rows.map((row) => row.day)));
  });

  it("totals nothing for an empty view", () => {
    const totals = activityTotals(activityRows(DAYS, { ...ALL, query: "no such shop" }));
    expect(totals.total).toBe(0);
    expect(totals.completeDays).toBe(0);
  });
});

describe("activityDaysFor", () => {
  it("shows the synthetic sample only while signed out", () => {
    expect(activityDaysFor(true, DAYS, [])).toBe(DAYS);
    expect(activityDaysFor(false, [], DAYS)).toBe(DAYS);
  });
});

describe("option parsing", () => {
  it("falls back to the default for unknown values", () => {
    expect(parseActivityStatus("complete")).toBe("complete");
    expect(parseActivityStatus("refunds")).toBe("all");
    expect(parseActivitySort("largest")).toBe("largest");
    expect(parseActivitySort("random")).toBe("newest");
  });
});
