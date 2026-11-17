import { type IsoDate, formatDateLong, formatMonthShort, toIsoDate } from "../../../../../core/values/iso-date";
import { type EuroCents, formatEuro, toEuroCents } from "../../../../../core/values/money";
import type { StatementLabel } from "../../../../../core/statements/statement-labels";

export function utcTime(date: IsoDate): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

export function monthLabel(time: number): string {
  const moment = new Date(time);
  const date = toIsoDate(moment.getUTCFullYear(), moment.getUTCMonth() + 1, moment.getUTCDate());
  return date === null ? "" : formatMonthShort(date);
}

export function euroLabel(value: number): string {
  const cents = toEuroCents(Math.round(value * 100));
  return cents === null ? "" : formatEuro(cents);
}

export function euros(cents: EuroCents | null): number | null {
  return cents === null ? null : cents / 100;
}

/**
 * Names an actual statement on a chart: its short label, with the exact export
 * date when the label is not simply its own month. A position that is not a
 * statement keeps its calendar label, so axis ticks are never renamed.
 */
export function observationLabel(
  dates: readonly IsoDate[],
  labels: readonly StatementLabel[],
  checkpointDates: readonly IsoDate[] = [],
): (time: number) => string {
  const byTime = new Map(dates.map((date, index) => [utcTime(date), labels[index]] as const));
  const checkpoints = new Map(checkpointDates.map((date) => [utcTime(date), date] as const));
  return (time) => {
    const label = byTime.get(time);
    const checkpoint = checkpoints.get(time);
    if (label === undefined)
      return checkpoint === undefined ? monthLabel(time) : `Checkpoint of ${formatDateLong(checkpoint)}`;
    const named = label.detail === null ? label.short : `${label.short}, ${label.detail}`;
    return checkpoint === undefined ? named : `${named}; checkpoint also recorded`;
  };
}
