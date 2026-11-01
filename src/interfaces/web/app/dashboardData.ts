import type { IsoDate } from "../../../core/IsoDate";
import type { EuroCents } from "../../../core/Money";
import type { OverviewModel, OverviewMonth } from "../features/overview/OverviewModel";

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
