import { type IsoDate, formatDateLong, formatMonthShort, formatMonthYear, monthSerial, toIsoDate } from "./IsoDate";

/**
 * The bank's export is a snapshot of the moment it is made. An export taken just
 * after a month ends holds that month's close, so naming it after the month it
 * was made in is misleading, and one taken a little early is still that month's
 * close. This module only chooses names. It reads no money and changes no figure:
 * every calculation still follows the actual statement dates (reporting policy
 * "legacy-parity-v1").
 */

/**
 * The window around a month end: the last this-many days of a month and the
 * first this-many days of the next are taken to be that month's close.
 */
export const CLOSE_WINDOW_DAYS = 7;

export type StatementLabelKind =
  /** Dated well inside a month, named after its own month exactly as before. */
  | "unchanged"
  /** Exported in the last days of a month: named after that month, as its close. */
  | "closes-month"
  /** Exported in the first days of a month: named after the previous month it closes. */
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

function lastDayOfMonth(date: IsoDate): number {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
}

/**
 * Names every statement, in the order given. One pass in date order. A statement
 * in the first days of a month closes the previous month, and one in the last
 * days closes its own month, unless an earlier statement already carries that
 * month's name; then it is named by its date only, which claims no period and
 * cannot push later statements out of step. Display only: nothing here is stored.
 */
export function statementLabels(dates: readonly IsoDate[]): readonly StatementLabel[] {
  const order = dates
    .map((date, index) => ({ date, index }))
    .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : left.index - right.index));
  const named = new Set<number>();
  const labels = new Array<StatementLabel>(dates.length);

  for (const { date, index } of order) {
    const own = monthSerial(date);
    const day = dayOf(date);
    const early = day <= CLOSE_WINDOW_DAYS;
    const late = !early && day > lastDayOfMonth(date) - CLOSE_WINDOW_DAYS;
    if (early || late) {
      const target = early ? firstOfMonth(own - 1) : firstOfMonth(own);
      const targetSerial = early ? own - 1 : own;
      if (target !== null && !named.has(targetSerial)) {
        named.add(targetSerial);
        labels[index] = {
          kind: early ? "closes-previous-month" : "closes-month",
          short: formatMonthShort(target),
          long: `${formatMonthYear(target)} close, exported ${formatDateLong(date)}`,
          detail: `exported ${formatDateLong(date)}`,
        };
        continue;
      }
      if (target !== null) {
        const month = formatMonthShort(date).slice(0, 3);
        labels[index] = {
          kind: "date-only",
          short: `${String(day)} ${month} ${formatMonthShort(date).slice(4)}`,
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
