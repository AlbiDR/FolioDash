import { type IsoDate, monthSerial } from "../../../../core/IsoDate";

export type ChartRange = "3M" | "6M" | "YTD" | "1Y" | "3Y" | "All";

const ALL_RANGES: readonly { readonly id: ChartRange; readonly label: string }[] = [
  { id: "3M", label: "3M" },
  { id: "6M", label: "6M" },
  { id: "YTD", label: "YTD" },
  { id: "1Y", label: "1Y" },
  { id: "3Y", label: "3Y" },
  { id: "All", label: "All" },
];

const MONTHS: Readonly<Record<ChartRange, number | null>> = { "3M": 3, "6M": 6, YTD: null, "1Y": 12, "3Y": 36, All: null };

function ytdStart(dates: readonly IsoDate[]): number {
  const latest = dates[dates.length - 1];
  if (latest === undefined) return 0;
  const januaryOfLatestYear = monthSerial(latest) - (monthSerial(latest) % 12);
  const index = dates.findIndex((date) => monthSerial(date) >= januaryOfLatestYear);
  return index < 0 ? 0 : index;
}

/**
 * The ranges the history can actually fill. A fixed range is offered only when the
 * history spans at least that many calendar months; YTD only when it would show at
 * least two statements and differ from All. All is always offered.
 */
export function availableRanges(dates: readonly IsoDate[]): readonly { readonly id: ChartRange; readonly label: string }[] {
  const first = dates[0];
  const latest = dates[dates.length - 1];
  const span = first === undefined || latest === undefined ? 0 : monthSerial(latest) - monthSerial(first);
  return ALL_RANGES.filter(({ id }) => {
    if (id === "All") return true;
    if (id === "YTD") {
      const start = ytdStart(dates);
      return start > 0 && dates.length - start >= 2;
    }
    return span >= (MONTHS[id] ?? 0);
  });
}

/** The chosen range if the history still supports it, otherwise All. */
export function resolveRange(range: ChartRange, dates: readonly IsoDate[]): ChartRange {
  return availableRanges(dates).some((option) => option.id === range) ? range : "All";
}

/**
 * Index of the first statement inside the range, counted back in calendar months
 * from the latest statement. The range only decides what a chart shows; it never
 * changes a figure.
 */
export function rangeStart(dates: readonly IsoDate[], range: ChartRange): number {
  if (range === "YTD") return ytdStart(dates);
  const months = MONTHS[range];
  const latest = dates[dates.length - 1];
  if (months === null || latest === undefined) return 0;
  const from = monthSerial(latest) - months;
  const index = dates.findIndex((date) => monthSerial(date) >= from);
  return index < 0 ? 0 : index;
}
