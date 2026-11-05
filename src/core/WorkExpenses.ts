import { type IsoDate, parseIsoDate, toIsoDate } from "./IsoDate";
import { type EuroCents, toEuroCents } from "./Money";

export const EXPENSE_LABELS = ["Outbound Commute", "Lunch", "Inbound Commute", "Dinner", "Other Expenses"] as const;
/** Routine fields require amounts or zeroes unless an optional work cost is entered. */
export const EXPENSE_REQUIRED_INDICES = [0, 1, 2] as const;
export const EXPENSE_OPTIONAL_INDICES = [3, 4] as const;
export type ExpenseAmounts = readonly [EuroCents | null, EuroCents | null, EuroCents | null, EuroCents | null, EuroCents | null];
export const EMPTY_EXPENSE_AMOUNTS: ExpenseAmounts = [null, null, null, null, null];

/** Expense revisions are independent of the portfolio ledger. Unentered values stay null; field policy determines review needs. */
export interface ExpenseDay {
  readonly date: IsoDate;
  readonly amounts: ExpenseAmounts;
  readonly revision: string;
}

export interface ExpenseCommand {
  readonly id: string;
  readonly date: IsoDate;
  readonly amounts: ExpenseAmounts;
  readonly expectedRevision: string | null;
}

export type ExpenseAveragingPolicy = "completed-periods" | "typical-periods";
export const EXPENSE_REPORTING_POLICY = "work-expenses-v3";

/** Proleptic Gregorian civil-day arithmetic. It has no runtime clock or time-zone dependency. */
function dayNumber(date: IsoDate): number {
  let year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  year -= month <= 2 ? 1 : 0;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const dayOfYear = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  return era * 146097 + yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear - 719468;
}

function fromDayNumber(number: number): IsoDate | null {
  const z = number + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPart = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1;
  const month = monthPart < 10 ? monthPart + 3 : monthPart - 9;
  return toIsoDate(year + (month <= 2 ? 1 : 0), month, day);
}

/** Monday is 0; Sunday is 6. */
export function expenseWeekday(date: IsoDate): number {
  return ((dayNumber(date) + 3) % 7 + 7) % 7;
}

export function isWorkday(date: IsoDate): boolean {
  return expenseWeekday(date) < 5;
}

export function shiftDate(date: IsoDate, days: number): IsoDate | null {
  return Number.isSafeInteger(days) ? fromDayNumber(dayNumber(date) + days) : null;
}

export function adjacentWorkday(date: IsoDate, direction: 1 | -1): IsoDate | null {
  let next = shiftDate(date, direction);
  while (next !== null && !isWorkday(next)) next = shiftDate(next, direction);
  return next;
}

/** The supported Monday-Friday dates of the date's calendar week, including at the supported year bounds. */
export function weekDates(date: IsoDate): readonly IsoDate[] {
  const monday = dayNumber(date) - expenseWeekday(date);
  return Array.from({ length: 5 }, (_, index) => fromDayNumber(monday + index)).filter((value): value is IsoDate => value !== null);
}

function exactCents(value: bigint): EuroCents | null {
  return value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(0) ? null : toEuroCents(Number(value));
}

export function filledExpenseFields(amounts: ExpenseAmounts): number {
  return amounts.filter((amount) => amount !== null).length;
}

/** Completeness is a reporting policy; it never fills blanks or changes recorded values. */
export function expenseEntryStatus(amounts: ExpenseAmounts): {
  readonly filled: number;
  readonly missingRequired: readonly number[];
  readonly complete: boolean;
  readonly partial: boolean;
} {
  const filled = filledExpenseFields(amounts);
  const hasOptionalCost = EXPENSE_OPTIONAL_INDICES.some((index) => amounts[index] !== null);
  const missingRequired = hasOptionalCost ? [] : EXPENSE_REQUIRED_INDICES.filter((index) => amounts[index] === null);
  const complete = filled > 0 && missingRequired.length === 0;
  return { filled, missingRequired, complete, partial: filled > 0 && !complete };
}

export function sumExpenseAmounts(amounts: ExpenseAmounts): EuroCents | null {
  return exactCents(amounts.reduce<bigint>((total, amount) => total + BigInt(amount ?? 0), BigInt(0)));
}

/** External stored/input values cross this boundary before entering the model. */
export function parseExpenseAmounts(value: unknown): ExpenseAmounts | null {
  if (!Array.isArray(value) || value.length !== 5) return null;
  const parsed: (EuroCents | null)[] = [];
  for (const amount of value as unknown[]) {
    if (amount === null) parsed.push(null);
    else if (typeof amount === "number" && amount >= 0) {
      const cents = toEuroCents(amount);
      if (cents === null) return null;
      parsed.push(cents);
    } else return null;
  }
  const amounts = parsed as unknown as ExpenseAmounts;
  return sumExpenseAmounts(amounts) === null ? null : amounts;
}

export function parseExpenseDay(value: unknown): ExpenseDay | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const date = typeof record["date"] === "string" ? parseIsoDate(record["date"]) : null;
  const amounts = parseExpenseAmounts(record["amounts"]);
  const revision = record["revision"];
  return date !== null && date === record["date"] && isWorkday(date) && amounts !== null && typeof revision === "string" && revision.length > 0 && revision.length <= 200
    ? { date, amounts, revision } : null;
}

export function parseExpenseCommand(value: unknown): ExpenseCommand | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const day = parseExpenseDay({ date: record["date"], amounts: record["amounts"], revision: record["id"] });
  const previous = record["expectedRevision"];
  if (day === null || day.revision.startsWith("conflict:") || !(previous === null || (typeof previous === "string" && previous.length > 0 && previous.length <= 200))) return null;
  return { id: day.revision, date: day.date, amounts: day.amounts, expectedRevision: previous };
}

export type ExpenseDayKind = "complete" | "partial" | "no-work" | "not-entered" | "future" | "outside-history" | "weekend";

export function expenseDayKind(day: ExpenseDay | undefined, date: IsoDate, today: IsoDate, startDate: IsoDate | null = null): ExpenseDayKind {
  if (!isWorkday(date)) return "weekend";
  const status = expenseEntryStatus(day?.amounts ?? EMPTY_EXPENSE_AMOUNTS);
  if (date > today) return "future";
  if (status.complete) return "complete";
  if (status.partial) return "partial";
  if (date === today) return "not-entered";
  if (startDate === null || date < startDate) return "outside-history";
  return "no-work";
}

export interface ExpenseTotals {
  readonly total: EuroCents | null;
  readonly categoryTotals: ExpenseAmounts;
  readonly completeDays: number;
  readonly partialDays: number;
  readonly overflow: boolean;
}

/** Sums known amounts only; callers retain the partial-day count instead of treating these as complete spending. */
export function expenseTotals(days: readonly ExpenseDay[]): ExpenseTotals {
  const categories = EXPENSE_LABELS.map((_, index) => days.reduce<bigint>((sum, day) => sum + BigInt(day.amounts[index] ?? 0), BigInt(0)));
  const categoryTotals = categories.map(exactCents) as unknown as ExpenseAmounts;
  const total = exactCents(categories.reduce((sum, amount) => sum + amount, BigInt(0)));
  return {
    total,
    categoryTotals,
    completeDays: days.filter((day) => expenseEntryStatus(day.amounts).complete).length,
    partialDays: days.filter((day) => expenseEntryStatus(day.amounts).partial).length,
    overflow: total === null || categoryTotals.some((amount) => amount === null),
  };
}

export function sumExpenseDays(days: readonly ExpenseDay[]): EuroCents | null {
  return expenseTotals(days).total;
}

export function expenseWeek(days: readonly ExpenseDay[], date: IsoDate, today: IsoDate): ExpenseTotals & { readonly dates: readonly IsoDate[] } {
  const dates = weekDates(date);
  return { ...expenseTotals(days.filter((day) => dates.includes(day.date) && day.date <= today)), dates };
}

function roundedRatio(sum: bigint, numerator: number, denominator: number): EuroCents | null {
  if (denominator <= 0) return null;
  const divisor = BigInt(denominator);
  return exactCents((sum * BigInt(numerator) * BigInt(2) + divisor) / (divisor * BigInt(2)));
}

function fullDaySum(days: readonly ExpenseDay[]): bigint {
  return days.reduce((sum, day) => sum + day.amounts.reduce<bigint>((subtotal, amount) => subtotal + BigInt(amount ?? 0), BigInt(0)), BigInt(0));
}

function monthEnd(date: IsoDate): IsoDate | null {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const next = toIsoDate(year + (month === 12 ? 1 : 0), month === 12 ? 1 : month + 1, 1);
  return next === null ? toIsoDate(year, 12, 31) : shiftDate(next, -1);
}

export interface ExpenseReport extends ExpenseTotals {
  readonly year: number;
  readonly policy: ExpenseAveragingPolicy;
  readonly startDate: IsoDate | null;
  readonly averageDaily: EuroCents | null;
  readonly averageWeekly: EuroCents | null;
  readonly averageMonthly: EuroCents | null;
  readonly totalYearly: EuroCents | null;
  readonly yearlyProjection: EuroCents | null;
  readonly eligibleWeeks: number;
  readonly eligibleMonths: number;
  readonly weekdaysInYear: number;
  readonly excludedFutureDays: number;
}

/**
 * Versioned reporting policy: an entered optional cost completes a workday; otherwise
 * all routine commute/lunch amounts require explicit values, including zeroes.
 * Every entered amount remains part of the total. Optional blanks are preserved. Partial days
 * contribute only their known amounts to annual/category totals. Completed periods
 * must be wholly inside the selected year and tracked coverage, ended before today,
 * contain a complete workday and contain no partial day. Blank weekdays mean no work.
 * Typical periods and projection use the unrounded daily ratio, then round half up once.
 */
export function expenseReport(days: readonly ExpenseDay[], year: number, today: IsoDate, policy: ExpenseAveragingPolicy = "completed-periods"): ExpenseReport {
  const first = toIsoDate(year, 1, 1);
  const last = toIsoDate(year, 12, 31);
  const startDate = [...days].sort((left, right) => left.date < right.date ? -1 : left.date > right.date ? 1 : 0)[0]?.date ?? null;
  const recorded = days.filter((day) => day.date.slice(0, 4) === String(year) && day.date <= today);
  const totals = expenseTotals(recorded);
  const complete = recorded.filter((day) => expenseEntryStatus(day.amounts).complete);
  const completeSum = fullDaySum(complete);
  const weeks = new Map<string, ExpenseDay[]>();
  const months = new Map<string, ExpenseDay[]>();
  for (const day of recorded) {
    const monday = weekDates(day.date)[0];
    if (monday !== undefined) {
      const entries = weeks.get(monday) ?? [];
      entries.push(day);
      weeks.set(monday, entries);
    }
    const month = day.date.slice(0, 7);
    const entries = months.get(month) ?? [];
    entries.push(day);
    months.set(month, entries);
  }
  const eligibleWeeks = [...weeks].filter(([monday, entries]) => {
    const dates = weekDates(monday as IsoDate);
    const friday = dates[4];
    return dates.length === 5 && first !== null && last !== null && monday >= first && startDate !== null && monday >= startDate && friday !== undefined && friday <= last && friday < today && entries.some((entry) => expenseEntryStatus(entry.amounts).complete) && entries.every((entry) => !expenseEntryStatus(entry.amounts).partial);
  });
  const eligibleMonths = [...months].filter(([month, entries]) => {
    const monthFirst = parseIsoDate(`${month}-01`);
    const end = monthFirst === null ? null : monthEnd(monthFirst);
    return monthFirst !== null && startDate !== null && monthFirst >= startDate && end !== null && end < today && entries.some((entry) => expenseEntryStatus(entry.amounts).complete) && entries.every((entry) => !expenseEntryStatus(entry.amounts).partial);
  });
  let weekdaysInYear = 0;
  if (first !== null && last !== null) {
    for (let serial = dayNumber(first); serial <= dayNumber(last); serial++) if (((serial + 3) % 7 + 7) % 7 < 5) weekdaysInYear++;
  }
  const weeklySum = eligibleWeeks.reduce((sum, [, entries]) => sum + fullDaySum(entries), BigInt(0));
  const monthlySum = eligibleMonths.reduce((sum, [, entries]) => sum + fullDaySum(entries), BigInt(0));
  const averageDaily = roundedRatio(completeSum, 1, complete.length);
  const averageWeekly = policy === "typical-periods" ? roundedRatio(completeSum, 5, complete.length) : roundedRatio(weeklySum, 1, eligibleWeeks.length);
  const averageMonthly = policy === "typical-periods" ? roundedRatio(completeSum, weekdaysInYear, complete.length * 12) : roundedRatio(monthlySum, 1, eligibleMonths.length);
  const yearlyProjection = roundedRatio(completeSum, weekdaysInYear, complete.length);
  const hasAmounts = recorded.some((day) => filledExpenseFields(day.amounts) > 0);
  const arithmeticOverflow = complete.length > 0 && (averageDaily === null || yearlyProjection === null || (policy === "typical-periods" && (averageWeekly === null || averageMonthly === null)));
  return { ...totals, overflow: totals.overflow || arithmeticOverflow, year, policy, startDate, averageDaily, averageWeekly, averageMonthly, totalYearly: hasAmounts ? totals.total : null, yearlyProjection, eligibleWeeks: eligibleWeeks.length, eligibleMonths: eligibleMonths.length, weekdaysInYear, excludedFutureDays: days.filter((day) => day.date.slice(0, 4) === String(year) && day.date > today && filledExpenseFields(day.amounts) > 0).length };
}
