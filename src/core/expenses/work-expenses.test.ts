import { describe, expect, it } from "vitest";
import {
  type ExpenseAmounts,
  adjacentWorkday,
  expenseDayKind,
  EXPENSE_OPTIONAL_INDICES,
  EXPENSE_REPORTING_POLICY,
  EXPENSE_REQUIRED_INDICES,
  expenseEntryStatus,
  expenseWeekday,
  filledExpenseFields,
  isWorkday,
  parseExpenseAmounts,
  parseExpenseCommand,
  parseExpenseDay,
  shiftDate,
  sumExpenseAmounts,
  weekDates,
} from "./work-expenses";
import { cents, date, day } from "./work-expenses-builders";

describe("work-expense date arithmetic", () => {
  it("uses a Monday-based workweek without locale, clock or time-zone state", () => {
    expect(expenseWeekday(date("1900-01-01"))).toBe(0);
    expect(expenseWeekday(date("1970-01-01"))).toBe(3);
    expect(expenseWeekday(date("2026-11-05"))).toBe(3);
    expect(isWorkday(date("2026-11-07"))).toBe(false);
    expect(isWorkday(date("2026-11-08"))).toBe(false);
    expect(weekDates(date("2026-11-08"))).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
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
  it("requires commute and lunch while leaving occasional dinner and other costs optional", () => {
    const amounts: ExpenseAmounts = [cents(200), cents(800), cents(200), null, null];
    expect(EXPENSE_REQUIRED_INDICES).toEqual([0, 1, 2]);
    expect(EXPENSE_OPTIONAL_INDICES).toEqual([3, 4]);
    expect(EXPENSE_REPORTING_POLICY).toBe("work-expenses-v3");
    expect(expenseEntryStatus(amounts)).toEqual({ filled: 3, missingRequired: [], complete: true, partial: false });
    expect(expenseDayKind(day("2026-11-03", null, { amounts }), date("2026-11-03"), date("2026-11-05"))).toBe(
      "complete",
    );
    expect(expenseEntryStatus([cents(0), cents(0), cents(0), null, null]).complete).toBe(true);
  });

  it("counts missing routine fields for review only when no optional cost was recorded", () => {
    expect(expenseEntryStatus([cents(200), null, cents(200), null, null])).toEqual({
      filled: 2,
      missingRequired: [1],
      complete: false,
      partial: true,
    });
    expect(expenseEntryStatus([null, null, null, cents(1500), null])).toEqual({
      filled: 1,
      missingRequired: [],
      complete: true,
      partial: false,
    });
    expect(expenseEntryStatus([null, null, null, null, cents(500)]).partial).toBe(false);
    const blank = expenseEntryStatus([null, null, null, null, null]);
    expect(blank.complete).toBe(false);
    expect(blank.partial).toBe(false);
    expect(expenseDayKind(day("2026-11-03", null), date("2026-11-03"), date("2026-11-05"), date("2026-11-02"))).toBe(
      "no-work",
    );
  });

  it("preserves blank and zero and includes the fifth category", () => {
    const amounts = parseExpenseAmounts([100, null, 0, 200, 350]);
    expect(amounts).toEqual([100, null, 0, 200, 350]);
    if (amounts === null) throw new Error("Invalid fixture");
    expect(filledExpenseFields(amounts)).toBe(4);
    expect(sumExpenseAmounts(amounts)).toBe(650);
  });

  it("rejects malformed, fractional, negative and overflowing amounts", () => {
    for (const value of [
      [],
      [0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [1.5, 0, 0, 0, 0],
      [-1, 0, 0, 0, 0],
      ["0", 0, 0, 0, 0],
      [NaN, 0, 0, 0, 0],
      [Infinity, 0, 0, 0, 0],
      [Number.MAX_SAFE_INTEGER, 1, 0, 0, 0],
    ])
      expect(parseExpenseAmounts(value)).toBeNull();
  });

  it("validates canonical weekday dates, revision and command ancestry", () => {
    expect(parseExpenseDay(day("2026-11-05", 0))).toEqual(day("2026-11-05", 0));
    expect(parseExpenseDay(day("2026-11-07", 0))).toBeNull();
    expect(parseExpenseDay({ ...day("2026-11-05", 0), date: " 2026-11-05" })).toBeNull();
    expect(parseExpenseDay({ ...day("2026-11-05", 0), revision: "" })).toBeNull();
    const command = { id: "synthetic-1", date: "2026-11-05", amounts: [0, null, 0, 0, 0], expectedRevision: null };
    expect(parseExpenseCommand(command)).toEqual(command);
    expect(parseExpenseCommand({ ...command, expectedRevision: "previous" })).toEqual({
      ...command,
      expectedRevision: "previous",
    });
    expect(parseExpenseCommand({ ...command, expectedRevision: "" })).toBeNull();
    expect(parseExpenseCommand({ ...command, expectedRevision: undefined })).toBeNull();
    expect(parseExpenseCommand({ ...command, id: "conflict:reserved-revision-namespace" })).toBeNull();
  });

  it("keeps no work, real zero, incomplete data and untracked history distinct", () => {
    const today = date("2026-11-05");
    const start = date("2026-11-02");
    expect(expenseDayKind(undefined, date("2026-11-03"), today, start)).toBe("no-work");
    expect(expenseDayKind(day("2026-11-03", 0), date("2026-11-03"), today, start)).toBe("complete");
    expect(
      expenseDayKind(
        day("2026-11-03", null, { amounts: [null, cents(700), null, null, null] }),
        date("2026-11-03"),
        today,
        start,
      ),
    ).toBe("partial");
    expect(expenseDayKind(undefined, date("2026-10-30"), today, start)).toBe("outside-history");
    expect(expenseDayKind(undefined, today, today, start)).toBe("not-entered");
    expect(expenseDayKind(undefined, date("2026-11-06"), today, start)).toBe("future");
    expect(expenseDayKind(undefined, date("2026-11-07"), today, start)).toBe("weekend");
  });
});
