import type { IsoDate } from "../../../../../core/values/iso-date";
import type { StatementLabel } from "../../../../../core/statements/statement-labels";

export const GRID_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export interface ReturnsRow {
  readonly year: number;
  /** January to December; null where no statement names that month or it has no month-on-month change. */
  readonly cells: readonly (number | null)[];
}

export interface ReturnsGrid {
  readonly rows: readonly ReturnsRow[];
  /** The largest size of change in the grid, for scaling the tint. Zero when there is none. */
  readonly largest: number;
}

/** The calendar month a statement is named after, following the same rule as its on-screen label. */
function monthOf(date: IsoDate, label: StatementLabel | undefined): { readonly year: number; readonly month: number } {
  let year = Number(date.slice(0, 4));
  let month = Number(date.slice(5, 7));
  if (label?.kind === "closes-previous-month") {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return { year, month };
}

/**
 * Lays the model's month-on-month changes out by calendar year and month. It only places figures the model already
 * holds; it adds, averages and compounds nothing. Years with no statements between the first and last still get a row.
 */
export function returnsGrid(
  dates: readonly IsoDate[],
  labels: readonly (StatementLabel | undefined)[],
  changes: readonly (number | null)[],
): ReturnsGrid {
  const placed = new Map<number, (number | null)[]>();
  let first = Infinity;
  let last = -Infinity;
  dates.forEach((date, index) => {
    const { year, month } = monthOf(date, labels[index]);
    first = Math.min(first, year);
    last = Math.max(last, year);
    const row = placed.get(year) ?? Array.from({ length: 12 }, () => null);
    row[month - 1] = changes[index] ?? null;
    placed.set(year, row);
  });
  if (first === Infinity) return { rows: [], largest: 0 };
  const rows: ReturnsRow[] = [];
  for (let year = first; year <= last; year++)
    rows.push({ year, cells: placed.get(year) ?? Array.from({ length: 12 }, () => null) });
  const largest = Math.max(0, ...rows.flatMap((row) => row.cells.map((cell) => (cell === null ? 0 : Math.abs(cell)))));
  return { rows, largest };
}
