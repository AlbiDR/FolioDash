import type { ExpenseConflict } from "../../../applications/session/expense-model";
import { bufferedGrid, plainCell, type Grid, type GridCell } from "../../../applications/ledger/sheet-grid";
import { toSpreadsheetSerial, type IsoDate } from "../../../core/values/iso-date";
import {
  EXPENSE_LABELS,
  EXPENSE_OPTIONAL_INDICES,
  EXPENSE_REPORTING_POLICY,
  expenseDayKind,
  expenseReport,
  expenseWeek,
  filledExpenseFields,
  sumExpenseAmounts,
  weekDates,
  type ExpenseDay,
} from "../../../core/expenses/work-expenses";
import type { EuroCents } from "../../../core/values/money";

/** The same checked expense projection is used after saves and workbook organization. */
export function buildExpenseView(
  days: readonly ExpenseDay[],
  conflicts: readonly ExpenseConflict[] = [],
  today?: IsoDate,
): Grid {
  const money = (amount: EuroCents | null): GridCell =>
    amount === null ? plainCell("") : { value: amount / 100, format: '#,##0.00" €"', emphasis: null };
  const startDate = days.toSorted((left, right) => left.date.localeCompare(right.date))[0]?.date ?? null;
  const descriptions = {
    complete: "Recorded workday",
    partial: "Needs review; amount recorded so far",
    "no-work": "No onsite work",
    "not-entered": "Not entered yet",
    future: "Future date",
    "outside-history": "Outside tracked history",
    weekend: "Weekend",
  };
  const rows: GridCell[][] = [
    [plainCell("Work expenses", "header")],
    [
      plainCell(
        "Costs incurred because of onsite work. Dinner and Other Expenses are optional. Rebuilt from checked records; edit in FolioDash.",
      ),
    ],
    [
      plainCell("Date", "header"),
      ...EXPENSE_LABELS.map((label, index) =>
        plainCell(
          EXPENSE_OPTIONAL_INDICES.some((optional) => optional === index) ? `${label} (optional)` : label,
          "header",
        ),
      ),
      plainCell("Recorded amount", "header"),
      plainCell("State", "header"),
    ],
    ...days.map((day) => [
      { value: toSpreadsheetSerial(day.date), format: "dd/mm/yyyy", emphasis: null },
      ...day.amounts.map(money),
      money(filledExpenseFields(day.amounts) === 0 ? null : sumExpenseAmounts(day.amounts)),
      plainCell(descriptions[expenseDayKind(day, day.date, today ?? day.date, startDate)]),
    ]),
    ...conflicts.map((conflict) => [
      plainCell(conflict.date),
      plainCell("Conflicting saved versions; review in FolioDash"),
    ]),
  ];
  rows.push([plainCell("Weekly recorded spending", "header")]);
  for (const monday of [...new Set([...days, ...conflicts].flatMap((day) => weekDates(day.date)[0] ?? []))].sort()) {
    const total = expenseWeek(days, monday, today ?? weekDates(monday)[4] ?? monday);
    const unresolved = conflicts.some((conflict) => total.dates.includes(conflict.date));
    rows.push([
      plainCell(monday),
      money(unresolved || total.completeDays + total.partialDays === 0 ? null : total.total),
      plainCell(
        unresolved
          ? "Resolve conflicting versions first"
          : `${String(total.partialDays)} partial day(s); sum of entered amounts`,
      ),
    ]);
  }
  if (today !== undefined) {
    rows.push(
      [plainCell(`Annual recap: ${EXPENSE_REPORTING_POLICY}, completed-periods`, "header")],
      [
        plainCell(
          `As of ${today}; Dinner and Other Expenses may stay blank. An entered Dinner or Other Expenses amount, including zero, completes a day; otherwise missing commute/lunch entries are excluded from averages. Estimates exclude leave and holidays.`,
        ),
      ],
    );
    for (const year of [
      ...new Set([Number(today.slice(0, 4)), ...days.map((day) => Number(day.date.slice(0, 4)))]),
    ].sort()) {
      const report = expenseReport(days, year, today);
      const unresolved = conflicts.some((conflict) => Number(conflict.date.slice(0, 4)) === year);
      rows.push([plainCell(String(year), "strong")]);
      const metrics = [
        ["Average Daily", report.averageDaily],
        ["Average Weekly", report.averageWeekly],
        ["Average Monthly", report.averageMonthly],
        ["Total Yearly", report.totalYearly],
        ["Yearly Projection (estimate)", report.yearlyProjection],
      ] as const;
      for (const [label, amount] of metrics)
        rows.push([
          plainCell(label),
          money(unresolved ? null : amount),
          plainCell(
            unresolved
              ? "Resolve conflicting versions first"
              : amount === null
                ? "Not enough eligible history"
                : "See FolioDash for period counts and definitions",
          ),
        ]);
    }
  }
  return bufferedGrid(rows, [140, 160, 130, 160, 130, 160, 150, 260]);
}
