import type { IsoDate } from "../../../../core/IsoDate";
import type { HoldingStatus } from "../../../../core/Ledger";
import type { EuroCents } from "../../../../core/Money";

/**
 * What the overview shows. The application layer produces it from the ledger
 * and the metrics kernel; the view never calculates a financial result itself.
 */
export interface OverviewKpi {
  readonly label: string;
  readonly amount: EuroCents | null;
  readonly percent: number | null;
  /** Whether `amount` is a gain or loss and so shown with a sign. */
  readonly signed: boolean;
  readonly note: string;
}

export interface OverviewFundLatest {
  readonly value: EuroCents;
  readonly netInvested: EuroCents;
  readonly gain: EuroCents;
  readonly gainPercent: number | null;
  readonly share: number | null;
}

export interface OverviewFund {
  readonly isin: string;
  readonly name: string;
  readonly status: HoldingStatus;
  /** One entry per statement date. Null means the fund was not held (or is closed and no longer shown). */
  readonly values: readonly (EuroCents | null)[];
  readonly latest: OverviewFundLatest | null;
}

export interface OverviewModel {
  /** Whether the figures come from invented demo data or from statements the user recorded. */
  readonly source: "demo" | "recorded";
  readonly dates: readonly IsoDate[];
  readonly funds: readonly OverviewFund[];
  /** Portfolio value and net invested per statement date, aligned with `dates`. */
  readonly totals: readonly { readonly value: EuroCents; readonly invested: EuroCents }[];
  readonly kpis: readonly OverviewKpi[];
  /** True when any cash moved, so percentages depend on assumed timing. */
  readonly estimated: boolean;
}
