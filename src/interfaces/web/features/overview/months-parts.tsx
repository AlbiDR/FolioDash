import type { JSX } from "preact";
import { type IsoDate, formatDateLong } from "../../../../core/values/iso-date";
import type { StatementLabel } from "../../../../core/statements/statement-labels";
import type { OverviewModel } from "./model/overview-model";

/** A column heading: the short name, with the exact export date for anyone who cannot see it. */
export function StatementHeading(props: {
  readonly label: StatementLabel | undefined;
  readonly date: IsoDate;
}): JSX.Element {
  const { label } = props;
  return label === undefined ? (
    <>{props.date}</>
  ) : (
    <>
      {label.short}
      {label.detail !== null && <span class="visually-hidden">, {label.detail}</span>}
    </>
  );
}

/** Names the statements the comparisons were made against. Calculations follow the actual dates, so say which. */
export function comparisonNote(month: OverviewModel["months"][number]): string | null {
  const parts = [
    month.monthlyGain !== null && month.previousDate !== null
      ? `${formatDateLong(month.previousDate)} (month on month)`
      : null,
    month.yearToDateGain !== null && month.yearToDateFrom !== null
      ? `${formatDateLong(month.yearToDateFrom)} (year to date)`
      : null,
    month.yearOverYearGain !== null && month.yearOverYearFrom !== null
      ? `${formatDateLong(month.yearOverYearFrom)} (year on year)`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : `Compared with the statements dated ${parts.join(", ")}.`;
}
