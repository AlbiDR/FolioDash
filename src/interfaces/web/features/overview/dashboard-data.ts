import { type IsoDate, formatMonthShort } from "../../../../core/iso-date";
import type { EuroCents } from "../../../../core/money";
import { euros, utcTime } from "./chart-data";
import type { OverviewFund, OverviewModel, OverviewMonth } from "./overview-model";
import type { Bar } from "../../presentation/charts/monthly-bars";
import type { ChartSeries } from "../../presentation/charts/line-chart-geometry";
import { type ChartRange, rangeFromDate, rangeStart } from "./chart-range";
import { memoizeLast } from "../../shared/ui/memo";
import type { CheckpointMarker } from "../../../../core/checkpoints";

export const NO_MARKERS: readonly CheckpointMarker[] = [];

/** The value-only observations to draw within the shown period. They are never part of the statements' figures. */
export function checkpointSeries(
  markers: readonly CheckpointMarker[],
  from: IsoDate | null | undefined,
): ChartSeries | null {
  // Undefined means there is nothing to compare with (no statement); null means the period has no start.
  if (from === undefined) return null;
  const inside = markers.filter((marker) => from === null || marker.date >= from);
  if (inside.length === 0) return null;
  return {
    id: "checkpoints",
    label: "Checkpoint (value only)",
    slot: 2,
    markers: true,
    points: inside.map((marker) => ({
      time: utcTime(marker.date),
      value: marker.cents / 100,
      ...(marker.count > 1 ? { detail: `${String(marker.count)} checkpoints on this date` } : {}),
    })),
  };
}

export interface AllocationSlice {
  readonly isin: string;
  readonly name: string;
  readonly value: EuroCents;
  /** Share of the active funds' value, 0 to 1. */
  readonly share: number;
}

/** The funds still held, largest first, with their share of what is held. Closed funds hold nothing and are left out. */
export function allocation(model: OverviewModel): AllocationSlice[] {
  const held = model.funds.flatMap((fund) =>
    fund.status === "closed" || fund.latest === null || fund.latest.value <= 0
      ? []
      : [{ isin: fund.isin, name: fund.name, value: fund.latest.value }],
  );
  const total = held.reduce((sum, fund) => sum + fund.value, 0);
  if (total <= 0) return [];
  return held.map((fund) => ({ ...fund, share: fund.value / total })).sort((left, right) => right.value - left.value);
}

export interface RankedFund {
  readonly isin: string;
  readonly name: string;
  /** Gain as a share of net invested, for example 0.135 for +13,5 %. */
  readonly percent: number;
  readonly closed: boolean;
}

/** Funds by gain percentage, best first. A fund whose percentage cannot be calculated is left out, never shown as zero. */
export function fundRanking(model: OverviewModel): RankedFund[] {
  return model.funds
    .flatMap((fund) =>
      fund.latest === null || fund.latest.gainPercent === null
        ? []
        : [{ isin: fund.isin, name: fund.name, percent: fund.latest.gainPercent, closed: fund.status === "closed" }],
    )
    .sort((left, right) => right.percent - left.percent);
}

export type MonthMetric = "gain" | "monthlyGain" | "yearToDateGain" | "yearOverYearGain";

/** One metric of the monthly summary in euros, from the first shown statement on. A missing figure stays a gap. */
export function metricSeries(
  months: readonly OverviewMonth[],
  start: number,
  metric: MonthMetric,
): { readonly date: IsoDate; readonly value: number | null }[] {
  return months.slice(start).map((month) => {
    const cents = month[metric];
    return { date: month.date, value: cents === null ? null : cents / 100 };
  });
}

export interface Dashboard {
  readonly start: number;
  /** Times of the statements inside the range, for trends drawn over the range. */
  readonly shownTimes: readonly number[];
  /** Times of every statement, for trends drawn over the whole history. */
  readonly allTimes: readonly number[];
  readonly totalSeries: readonly ChartSeries[];
  readonly fundSeries: readonly ChartSeries[];
  readonly slices: readonly AllocationSlice[];
  readonly ranking: readonly RankedFund[];
  readonly bars: readonly Bar[];
  readonly heroTrend: readonly (number | null)[];
  readonly metricTrends: Readonly<Record<MonthMetric, readonly (number | null)[]>>;
  readonly held: readonly OverviewFund[];
  readonly closed: readonly OverviewFund[];
  /** Each fund's value over the whole history in euros, for the small trend in its row. */
  readonly holdingTrends: Readonly<Record<string, readonly (number | null)[]>>;
}

/**
 * Everything the dashboard draws, derived once from the model and the chosen
 * range. It is a pure function of those two inputs, so it is remembered and only
 * redone when one of them changes.
 */
export function computeDashboard(
  model: OverviewModel,
  range: ChartRange,
  markers: readonly CheckpointMarker[] = NO_MARKERS,
): Dashboard {
  const { dates, funds, totals, months } = model;
  const start = rangeStart(dates, range);
  const shown = dates.slice(start);
  const metricTrend = (metric: MonthMetric): (number | null)[] =>
    metricSeries(months, start, metric).map((point) => point.value);
  return {
    start,
    shownTimes: shown.map(utcTime),
    allTimes: dates.map(utcTime),
    totalSeries: [
      {
        id: "value",
        label: "Portfolio value",
        points: shown.map((date, index) => ({
          time: utcTime(date),
          value: euros(totals[start + index]?.value ?? null),
        })),
      },
      {
        id: "invested",
        label: "Net invested",
        dashed: true,
        points: shown.map((date, index) => ({
          time: utcTime(date),
          value: euros(totals[start + index]?.invested ?? null),
        })),
      },
      ...(() => {
        const extra = checkpointSeries(markers, shown.length === 0 ? undefined : rangeFromDate(dates, range));
        return extra === null ? [] : [extra];
      })(),
    ],
    // Each fund's money invested is drawn beneath its value, in the same colour, dotted and faded.
    fundSeries: [
      ...funds.map((fund, slot) => ({
        id: `${fund.isin}-invested`,
        label: `${fund.name}: net invested`,
        slot,
        muted: true,
        points: shown.map((date, index) => ({
          time: utcTime(date),
          value: euros(fund.netInvested[start + index] ?? null),
        })),
      })),
      ...funds.map((fund, slot) => ({
        id: fund.isin,
        label: fund.name,
        slot,
        points: shown.map((date, index) => ({ time: utcTime(date), value: euros(fund.values[start + index] ?? null) })),
      })),
    ],
    slices: allocation(model),
    ranking: fundRanking(model),
    bars: metricSeries(months, start, "monthlyGain").map((entry, index) => {
      const name = model.labels[start + index];
      return {
        key: entry.date,
        label: name?.short ?? formatMonthShort(entry.date),
        detail: name?.detail ?? null,
        value: entry.value,
      };
    }),
    heroTrend: shown.map((_, index) => euros(totals[start + index]?.value ?? null)),
    metricTrends: {
      gain: metricTrend("gain"),
      monthlyGain: metricTrend("monthlyGain"),
      yearToDateGain: metricTrend("yearToDateGain"),
      yearOverYearGain: metricTrend("yearOverYearGain"),
    },
    held: funds.filter((fund) => fund.status !== "closed"),
    closed: funds.filter((fund) => fund.status === "closed"),
    holdingTrends: Object.fromEntries(funds.map((fund) => [fund.isin, fund.values.map((value) => euros(value))])),
  };
}

/** The remembered form the screens use. */
export const dashboardFor = memoizeLast(computeDashboard);
