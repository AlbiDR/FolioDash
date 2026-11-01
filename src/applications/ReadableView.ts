import { computeMetrics } from "../core/Metrics";
import type { LedgerState } from "../core/Ledger";
import type { EuroCents } from "../core/Money";
import type { RawSheet } from "../core/RawSheet";

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

/**
 * A bank statement as plain cells for a readable tab. A number is written as a
 * number only when that loses nothing; otherwise it stays as the file's own text.
 * The exact statement is kept in the ledger; this tab is only a view of it.
 */
export function statementCells(sheet: RawSheet): ViewCell[][] {
  return sheet.rows.map((row) =>
    row.map((cell): ViewCell => {
      if (cell === undefined || cell.kind === "formula") return "";
      if (cell.kind === "text") return cell.text;
      const value = Number(cell.text);
      return Number.isFinite(value) && String(value) === cell.text ? value : cell.text;
    }),
  );
}
