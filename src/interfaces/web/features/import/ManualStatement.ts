import { parseIsin } from "../../../../core/Isin";
import { isSafeFundName } from "../../../../core/Ledger";
import { addCents, parseItalianAmount, ZERO_CENTS } from "../../../../core/Money";
import type { ReviewStatement } from "../../../../applications/ImportModel";

export interface ManualRow { readonly name: string; readonly isin: string; readonly amount: string }
export function prepareManualStatement(rows: readonly ManualRow[]):
  { readonly ok: true; readonly statement: ReviewStatement } | { readonly ok: false; readonly errors: readonly string[] } {
  const errors: string[] = [], funds: ReviewStatement["funds"][number][] = [], seen = new Set<string>();
  let total = ZERO_CENTS;
  rows.forEach((row, index) => {
    const label = `Fund ${String(index + 1)}`, isin = parseIsin(row.isin), name = row.name.trim(), amount = parseItalianAmount(row.amount);
    if (isin === null) errors.push(`${label}: enter a valid ISIN, including its check digit.`);
    else if (seen.has(isin)) errors.push(`${label}: this ISIN is already listed.`);
    else seen.add(isin);
    if (!isSafeFundName(name)) errors.push(`${label}: enter a valid fund name.`);
    if (amount === null || amount < 0) errors.push(`${label}: enter a non-negative value in Italian notation, for example 10.000,00. Blank is not zero.`);
    if (isin !== null && amount !== null && amount >= 0 && isSafeFundName(name)) {
      const sum = addCents(total, amount);
      if (sum === null) errors.push("The total exceeds the supported amount.");
      else total = sum;
      funds.push({ isin, name, marketValue: amount });
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, statement: { funds, fundsSubtotal: total, total: null, categories: [], adjustments: [] } };
}
