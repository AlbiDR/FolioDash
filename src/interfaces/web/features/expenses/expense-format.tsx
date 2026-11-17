import type { JSX } from "preact";
import type { IsoDate } from "../../../../core/values/iso-date";
import type { expenseDayKind } from "../../../../core/expenses/work-expenses";
import { Amount } from "../../presentation/privacy/privacy";

export function weekdayLabel(date: IsoDate): string {
  return new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function workdayLabel(date: IsoDate): string {
  const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
  return `${weekdayLabel(date)} ${String(Number(date.slice(8)))} ${month}`;
}

export function shortDate(date: IsoDate): string {
  return `${weekdayLabel(date)} ${String(Number(date.slice(8)))}`;
}

export function labelFor(kind: ReturnType<typeof expenseDayKind>): string {
  switch (kind) {
    case "complete":
      return "Recorded workday";
    case "partial":
      return "Needs review";
    case "no-work":
      return "No onsite work";
    case "future":
      return "Future date";
    case "outside-history":
      return "Before tracking";
    case "weekend":
      return "Weekend";
    default:
      return "Not entered yet";
  }
}

/** The week list has less room than the day heading, so its states are one word where they can be. */
export function weekLabelFor(kind: ReturnType<typeof expenseDayKind>): string {
  switch (kind) {
    case "complete":
      return "Recorded";
    case "no-work":
      return "No onsite work";
    case "not-entered":
      return "Not entered";
    default:
      return labelFor(kind);
  }
}

// A public maximum value sets one intrinsic wrapping footprint in both privacy states. It never measures or
// copies an actual private figure. Annual figures reserve the largest safe amount; amounts that sit in a row with
// a label (a day, a week, an average) reserve a shorter public maximum, so the label keeps its room.
const EXPENSE_AMOUNT_RESERVE = "90.071.992.547.409,91 €";
const EXPENSE_AMOUNT_COMPACT_RESERVE = "999.999,99 €";
export function ExpenseAmount(props: Parameters<typeof Amount>[0] & { readonly compact?: boolean }): JSX.Element {
  const { compact, ...amount } = props;
  return (
    <span class={compact === true ? "expense-money expense-money-compact" : "expense-money"}>
      <span class="expense-money-space" aria-hidden="true">
        {compact === true ? EXPENSE_AMOUNT_COMPACT_RESERVE : EXPENSE_AMOUNT_RESERVE}
      </span>
      <Amount {...amount} />
    </span>
  );
}
