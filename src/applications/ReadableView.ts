import { computeMetrics } from "../core/Metrics";
import type { LedgerState } from "../core/Ledger";
import type { EuroCents } from "../core/Money";

export type ViewCell = string | number;

const euros = (cents: EuroCents): number => cents / 100;

/**
 * The lines of the readable tab in the person's spreadsheet: the latest figures at
 * a glance, so the sheet is useful on its own. It is rebuilt from the ledger on
 * every save, so it is a view and never a record, and it says so.
 */
export function readableView(state: LedgerState): ViewCell[][] {
  const notice = "This tab is rebuilt by FolioDash every time you save. Do not edit it: changes are overwritten. Your records are kept in the hidden tab _FolioDash ledger.";
  const metrics = computeMetrics(state);
  const latest = metrics[metrics.length - 1];
  if (latest === undefined) return [["FolioDash"], [notice], [], ["No statements recorded yet."]];

  const lines: ViewCell[][] = [
    ["FolioDash"],
    [notice],
    [],
    ["Latest statement", latest.date],
    ["Statements recorded", metrics.length],
    ["Fund value (EUR)", euros(latest.total)],
    ["Net invested (EUR)", euros(latest.invested)],
    ["Gain (EUR)", euros(latest.gain)],
    ["Gain as a share of net invested", latest.gainPercent ?? ""],
    [],
    ["Fund", "ISIN", "Status", "Value (EUR)", "Net invested (EUR)", "Gain (EUR)", "Gain as a share of net invested"],
  ];
  const names = new Map(state.funds.map((fund) => [fund.isin, fund.name]));
  const funds = Object.entries(latest.funds).sort(([, left], [, right]) => (left.status === right.status ? right.value - left.value : left.status === "active" ? -1 : 1));
  for (const [isin, fund] of funds) {
    lines.push([names.get(isin) ?? isin, isin, fund.status === "closed" ? "Closed" : "Active", euros(fund.value), euros(fund.netInvested), euros(fund.gain), fund.gainPercent ?? ""]);
  }
  return lines;
}
