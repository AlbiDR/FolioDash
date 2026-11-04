import { formatEuro, parseItalianAmount } from "../../../../core/Money";
import type { ExpenseAmounts } from "../../../../core/WorkExpenses";

export type ExpenseDraft = readonly [string, string, string, string, string];
export const EMPTY_EXPENSE_DRAFT: ExpenseDraft = ["", "", "", "", ""];

/** Display and parsing remain on the existing Italian manual-entry boundary. */
export function expenseDraftFor(amounts: ExpenseAmounts): ExpenseDraft {
  return amounts.map(value => value === null ? "" : formatEuro(value).replace(/\s*€$/u, "")) as unknown as ExpenseDraft;
}

export function parseExpenseDraft(draft: ExpenseDraft): { readonly amounts: ExpenseAmounts; readonly invalid: readonly number[] } {
  const invalid: number[] = [];
  const amounts = draft.map((text, index) => {
    if (text.trim() === "") return null;
    const cents = parseItalianAmount(text);
    if (cents === null || cents < 0) {
      invalid.push(index);
      return null;
    }
    return cents;
  }) as unknown as ExpenseAmounts;
  return { amounts, invalid };
}

/** Formatting-only edits do not turn an unchanged stored day into a correction. */
export function expenseDraftChanged(draft: ExpenseDraft, original: ExpenseAmounts): boolean {
  const parsed = parseExpenseDraft(draft);
  return parsed.invalid.length > 0 || parsed.amounts.some((value, index) => value !== original[index]);
}
