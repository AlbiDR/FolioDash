import { type IsoDate, formatMonthShort } from "../../../core/IsoDate";
import type { EuroCents } from "../../../core/Money";
import { euros, utcTime } from "../features/overview/chartData";
import type { OverviewFund, OverviewModel, OverviewMonth } from "../features/overview/OverviewModel";
import type { Bar } from "../shared/charts/MonthlyBars";
import type { ChartSeries } from "../shared/charts/lineChartGeometry";
import { type ChartRange, rangeStart } from "./chartRange";
import { memoizeLast } from "./memo";

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
    fund.status === "closed" || fund.latest === null || fund.latest.value <= 0 ? [] : [{ isin: fund.isin, name: fund.name, value: fund.latest.value }],
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
export function metricSeries(months: readonly OverviewMonth[], start: number, metric: MonthMetric): { readonly date: IsoDate; readonly value: number | null }[] {
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
export function computeDashboard(model: OverviewModel, range: ChartRange): Dashboard {
  const { dates, funds, totals, months } = model;
  const start = rangeStart(dates, range);
  const shown = dates.slice(start);
  const metricTrend = (metric: MonthMetric): (number | null)[] => metricSeries(months, start, metric).map((point) => point.value);
  return {
    start,
    shownTimes: shown.map(utcTime),
    allTimes: dates.map(utcTime),
    totalSeries: [
      { id: "value", label: "Portfolio value", points: shown.map((date, index) => ({ time: utcTime(date), value: euros(totals[start + index]?.value ?? null) })) },
      { id: "invested", label: "Net invested", dashed: true, points: shown.map((date, index) => ({ time: utcTime(date), value: euros(totals[start + index]?.invested ?? null) })) },
    ],
    // Each fund's money invested is drawn beneath its value, in the same colour, dotted and faded.
    fundSeries: [
      ...funds.map((fund, slot) => ({
        id: `${fund.isin}-invested`,
        label: `${fund.name}: net invested`,
        slot,
        muted: true,
        points: shown.map((date, index) => ({ time: utcTime(date), value: euros(fund.netInvested[start + index] ?? null) })),
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
    bars: metricSeries(months, start, "monthlyGain").map((entry) => ({ key: entry.date, label: formatMonthShort(entry.date), value: entry.value })),
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
