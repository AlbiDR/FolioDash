import { type IsoDate, monthSerial } from "../../../../core/IsoDate";

export type ChartRange = "3M" | "6M" | "1Y" | "All";

export const CHART_RANGES: readonly { readonly id: ChartRange; readonly label: string }[] = [
  { id: "3M", label: "3M" },
  { id: "6M", label: "6M" },
  { id: "1Y", label: "1Y" },
  { id: "All", label: "All" },
];

const MONTHS: Readonly<Record<ChartRange, number | null>> = { "3M": 3, "6M": 6, "1Y": 12, All: null };

/**
 * Index of the first statement inside the range, counted back in calendar months
 * from the latest statement. The range only decides what a chart shows; it never
 * changes a figure.
 */
export function rangeStart(dates: readonly IsoDate[], range: ChartRange): number {
  const months = MONTHS[range];
  const latest = dates[dates.length - 1];
  if (months === null || latest === undefined) return 0;
  const from = monthSerial(latest) - months;
  const index = dates.findIndex((date) => monthSerial(date) >= from);
  return index < 0 ? 0 : index;
}
