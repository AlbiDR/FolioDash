/** Frozen synthetic values written by the summary layout before 9a7d554.
 * Deliberately independent of the current report builder: this exercises migration.
 */
export const LEGACY_SUMMARY_NOTICE = "This tab is rebuilt by FolioDash every time you save. Do not edit it: changes are overwritten. Your records are kept in the hidden tab _FolioDash ledger.";

export function legacyJanuarySummary(isin: string): (string | number)[][] {
  return [
    [],
    ["", "FolioDash"],
    ["", LEGACY_SUMMARY_NOTICE],
    [],
    ["", "Latest statement", 46053],
    ["", "Statements recorded", 1],
    ["", "Fund value", 1000],
    ["", "Net invested", 1000],
    ["", "Gain", 0],
    ["", "Gain as a share of net invested", 0],
    [],
    ["", "Fund", "ISIN", "Status", "Value", "Net invested", "Gain", "Gain as a share of net invested"],
    ["", "Synthetic Fund A", isin, "Active", 1000, 1000, 0, 0],
  ];
}
