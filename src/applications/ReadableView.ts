import { computeMetrics } from "../core/Metrics";
import type { LedgerState } from "../core/Ledger";
import { toSpreadsheetSerial } from "../core/IsoDate";
import type { EuroCents } from "../core/Money";
import { type Grid, type GridCell, bufferedGrid, plainCell } from "./SheetGrid";

const EURO = '#,##0.00" €"';
const PERCENT = "0.00%";
const DATE = "dd/mm/yyyy";

const euros = (cents: EuroCents): GridCell => ({ value: cents / 100, format: EURO, emphasis: null });
const percent = (value: number | null): GridCell => (value === null ? plainCell("") : { value, format: PERCENT, emphasis: null });

/**
 * The readable tab in the person's spreadsheet: the latest figures at a glance, so
 * the sheet is useful on its own. It is rebuilt from the ledger on every save, so
 * it is a view and never a record, and it says so.
 */
export function readableView(state: LedgerState): Grid {
  const notice = "This tab is rebuilt by FolioDash every time you save. Do not edit it: changes are overwritten. Your records are kept in the hidden tab _FolioDash ledger.";
  const title = [plainCell("FolioDash", "strong")];
  const metrics = computeMetrics(state);
  const latest = metrics[metrics.length - 1];
  if (latest === undefined) return bufferedGrid([title, [plainCell(notice)], [], [plainCell("No statements recorded yet.")]], [220]);

  const label = (text: string): GridCell => plainCell(text);
  const head = (text: string): GridCell => plainCell(text, "header");
  const lines: (readonly GridCell[])[] = [
    title,
    [plainCell(notice)],
    [],
    [label("Latest statement"), { value: toSpreadsheetSerial(latest.date), format: DATE, emphasis: null }],
    [label("Statements recorded"), plainCell(metrics.length)],
    [label("Fund value"), euros(latest.total)],
    [label("Net invested"), euros(latest.invested)],
    [label("Gain"), euros(latest.gain)],
    [label("Gain as a share of net invested"), percent(latest.gainPercent)],
    [],
    ["Fund", "ISIN", "Status", "Value", "Net invested", "Gain", "Gain as a share of net invested"].map(head),
  ];
  const names = new Map(state.funds.map((fund) => [fund.isin, fund.name]));
  const funds = Object.entries(latest.funds).sort(([, left], [, right]) => (left.status === right.status ? right.value - left.value : left.status === "active" ? -1 : 1));
  for (const [isin, fund] of funds) {
    lines.push([plainCell(names.get(isin) ?? isin), plainCell(isin), plainCell(fund.status === "closed" ? "Closed" : "Active"), euros(fund.value), euros(fund.netInvested), euros(fund.gain), percent(fund.gainPercent)]);
  }
  return bufferedGrid(lines, [230, 150, 90, 120, 120, 120, 200]);
}
