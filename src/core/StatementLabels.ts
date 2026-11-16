import { type IsoDate, formatDateLong, formatMonthShort, formatMonthYear, monthSerial, toIsoDate } from "./IsoDate";

/**
 * The bank's export is a snapshot of the moment it is made. An export taken on
 * the 1st of a month holds the close of the month before, so naming it after the
 * month it was made in is misleading. This module only chooses names. It reads
 * no money and changes no figure: every calculation still follows the actual
 * statement dates (reporting policy "legacy-parity-v1").
 */

/** A statement dated on the 1st to this day of a month is taken to close the previous month. */
export const CLOSE_GRACE_DAYS = 3;

export type StatementLabelKind =
  /** Named after its own month, exactly as before. */
  | "unchanged"
  /** Named after the previous month it most likely closes. */
  | "closes-previous-month"
  /** The previous month is already named by an earlier statement, so no period is claimed. */
  | "date-only";

export interface StatementLabel {
  readonly kind: StatementLabelKind;
  /** For a narrow heading or axis, for example `Oct 26`. */
  readonly short: string;
  /** For headings, selectors, accessible names and tables. */
  readonly long: string;
  /** Where the exact date is not already in `short`, for example `exported 1 Nov 2026`. */
  readonly detail: string | null;
}

function dayOf(date: IsoDate): number {
  return Number(date.slice(8, 10));
}

function firstOfMonth(serial: number): IsoDate | null {
  return toIsoDate(Math.floor(serial / 12), (serial % 12) + 1, 1);
}

/**
 * Names every statement, in the order given. One pass in date order. A
 * statement dated on day 1 to 3 closes the previous month unless an earlier
 * statement already carries that month's name; then it is named by its date
 * only, which claims no period and cannot push later statements out of step.
 * Display only: nothing here is stored.
 */
export function statementLabels(dates: readonly IsoDate[]): readonly StatementLabel[] {
  const order = dates.map((date, index) => ({ date, index })).sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : left.index - right.index));
  const named = new Set<number>();
  const labels = new Array<StatementLabel>(dates.length);

  for (const { date, index } of order) {
    const own = monthSerial(date);
    if (dayOf(date) <= CLOSE_GRACE_DAYS) {
      const previous = firstOfMonth(own - 1);
      if (previous !== null && !named.has(own - 1)) {
        named.add(own - 1);
        labels[index] = {
          kind: "closes-previous-month",
          short: formatMonthShort(previous),
          long: `${formatMonthYear(previous)} close, exported ${formatDateLong(date)}`,
          detail: `exported ${formatDateLong(date)}`,
        };
        continue;
      }
      if (previous !== null) {
        const month = formatMonthShort(date).slice(0, 3);
        labels[index] = {
          kind: "date-only",
          short: `${String(dayOf(date))} ${month} ${formatMonthShort(date).slice(4)}`,
          long: `Statement of ${formatDateLong(date)}`,
          detail: null,
        };
        continue;
      }
    }
    named.add(own);
    labels[index] = { kind: "unchanged", short: formatMonthShort(date), long: formatDateLong(date), detail: null };
  }
  return labels;
}
