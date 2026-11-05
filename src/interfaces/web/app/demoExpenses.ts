import type { IsoDate } from "../../../core/IsoDate";
import { adjacentWorkday, EMPTY_EXPENSE_AMOUNTS, parseExpenseAmounts, type ExpenseDay } from "../../../core/WorkExpenses";

/** Invented examples relative to Today, used only in the explicitly labelled in-memory demo. */
export function demoExpenses(today: IsoDate): readonly ExpenseDay[] {
  const days: ExpenseDay[] = [];
  let date = today;
  for (let index = 0; index < 15; index++) {
    const previous = adjacentWorkday(date, -1);
    if (previous === null) break;
    date = previous;
    if (index === 4 || index === 8) continue;
    const amounts = index === 2 ? [0, 0, 0, null, null] : index === 5 ? [240, 850, null, null, null] : [240, 700 + index * 25, 240, index === 3 ? 1200 : null, null];
    days.push({ date, amounts: parseExpenseAmounts(amounts) ?? EMPTY_EXPENSE_AMOUNTS, revision: `demo:${date}` });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}
