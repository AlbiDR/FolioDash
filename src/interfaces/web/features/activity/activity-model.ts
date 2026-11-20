import { formatMonthYear, monthKey, compareIsoDates, type IsoDate } from "../../../../core/values/iso-date";
import { formatEuro, type EuroCents } from "../../../../core/values/money";
import {
  EXPENSE_LABELS,
  expenseEntryStatus,
  expenseTotals,
  sumExpenseAmounts,
  weekDates,
  type ExpenseDay,
  type ExpenseTotals,
} from "../../../../core/expenses/work-expenses";

/** Presentation projection of recorded expense days. Every amount and total comes from the canonical expense model. */

export const ACTIVITY_STATUSES = ["all", "complete", "partial"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_SORTS = ["newest", "oldest", "largest"] as const;
export type ActivitySort = (typeof ACTIVITY_SORTS)[number];

export interface ActivityOptions {
  readonly status: ActivityStatus;
  /** `YYYY-MM`, or an empty string for any month. */
  readonly month: string;
  readonly query: string;
  readonly sort: ActivitySort;
}

export interface ActivityRow {
  readonly day: ExpenseDay;
  /** Sum of the known amounts, or null when the sum cannot be represented exactly. */
  readonly total: EuroCents | null;
  readonly complete: boolean;
  readonly filledCount: number;
  readonly missingLabels: readonly string[];
}

export interface ActivityWeek {
  readonly start: IsoDate;
  readonly rows: readonly ActivityRow[];
}

export interface ActivityMonth {
  readonly key: string;
  readonly label: string;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function activityDayLabel(date: IsoDate): string {
  return DAY_FORMAT.format(new Date(`${date}T12:00:00Z`));
}

export function categoryLabel(index: number): string {
  return EXPENSE_LABELS[index] ?? "";
}

export function parseActivityStatus(value: string): ActivityStatus {
  return ACTIVITY_STATUSES.find((status) => status === value) ?? "all";
}

export function parseActivitySort(value: string): ActivitySort {
  return ACTIVITY_SORTS.find((sort) => sort === value) ?? "newest";
}

/** A day is activity only when at least one category has a recorded amount; an unentered day is not a record. */
export function recordedDays(days: readonly ExpenseDay[]): readonly ExpenseDay[] {
  return days.filter((day) => expenseEntryStatus(day.amounts).filled > 0);
}

/** Months that have recorded activity, newest first. */
export function activityMonths(days: readonly ExpenseDay[]): readonly ActivityMonth[] {
  const firstDate = new Map<string, IsoDate>();
  for (const day of recordedDays(days)) {
    const key = monthKey(day.date);
    if (!firstDate.has(key)) firstDate.set(key, day.date);
  }
  return [...firstDate]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, date]) => ({ key, label: formatMonthYear(date) }));
}

function matchesQuery(row: ActivityRow, query: string): boolean {
  if (query === "") return true;
  if (row.day.date.includes(query)) return true;
  if (activityDayLabel(row.day.date).toLowerCase().includes(query)) return true;
  if (row.total !== null && formatEuro(row.total).toLowerCase().includes(query)) return true;
  return row.day.amounts.some((amount, index) => amount !== null && categoryLabel(index).toLowerCase().includes(query));
}

function compareRows(sort: ActivitySort): (left: ActivityRow, right: ActivityRow) => number {
  if (sort === "oldest") return (left, right) => compareIsoDates(left.day.date, right.day.date);
  if (sort === "largest") {
    // Unknown totals sort last; equal totals keep the newest day first.
    return (left, right) => (right.total ?? -1) - (left.total ?? -1) || compareIsoDates(right.day.date, left.day.date);
  }
  return (left, right) => compareIsoDates(right.day.date, left.day.date);
}

/** Filters and sorts the recorded days. Missing categories are reported, never filled in. */
export function activityRows(days: readonly ExpenseDay[], options: ActivityOptions): readonly ActivityRow[] {
  const query = options.query.trim().toLowerCase();
  const rows = recordedDays(days).flatMap((day): ActivityRow[] => {
    const status = expenseEntryStatus(day.amounts);
    if (options.status === "complete" && !status.complete) return [];
    if (options.status === "partial" && !status.partial) return [];
    if (options.month !== "" && monthKey(day.date) !== options.month) return [];
    const row: ActivityRow = {
      day,
      total: sumExpenseAmounts(day.amounts),
      complete: status.complete,
      filledCount: status.filled,
      missingLabels: status.missingRequired.map(categoryLabel),
    };
    return matchesQuery(row, query) ? [row] : [];
  });
  return rows.sort(compareRows(options.sort));
}

/** Groups rows by their Monday, in the order the rows already have, so the chosen sort carries into the groups. */
export function activityWeeks(rows: readonly ActivityRow[]): readonly ActivityWeek[] {
  const groups = new Map<IsoDate, ActivityRow[]>();
  for (const row of rows) {
    const start = weekDates(row.day.date)[0] ?? row.day.date;
    const group = groups.get(start);
    if (group === undefined) groups.set(start, [row]);
    else group.push(row);
  }
  return [...groups].map(([start, weekRows]) => ({ start, rows: weekRows }));
}

/** The days the screen reads: the invented sample while signed out, otherwise the person's own recorded days. */
export function activityDaysFor(
  signedOut: boolean,
  sample: readonly ExpenseDay[],
  own: readonly ExpenseDay[],
): readonly ExpenseDay[] {
  return signedOut ? sample : own;
}

/** The figures under "In this view": the canonical totals of the shown days, with partial days counted apart. */
export function activityTotals(rows: readonly ActivityRow[]): ExpenseTotals {
  return expenseTotals(rows.map((row) => row.day));
}
