import type { IsoDate } from "../../../../core/IsoDate";
import type { EuroCents } from "../../../../core/Money";

/**
 * What the overview needs to show. The application layer will produce this from
 * the committed ledger; the view never calculates financial results itself.
 */
export interface OverviewFund {
  readonly isin: string;
  readonly name: string;
  readonly status: "active" | "closed";
  /** One entry per statement date. Null means the fund was not held on that date. */
  readonly values: readonly (EuroCents | null)[];
}

export interface OverviewModel {
  readonly dates: readonly IsoDate[];
  readonly funds: readonly OverviewFund[];
  /** Portfolio value and net invested per statement date, aligned with `dates`. */
  readonly totals: readonly { readonly value: EuroCents; readonly invested: EuroCents }[];
}
