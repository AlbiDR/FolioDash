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

/** Axis display only: k denotes thousands, M millions. Readouts and tables always retain euroLabel's exact cents. */
export function euroAxisLabel(value: number): string {
  if (!Number.isFinite(value)) return "";
  const units = [
    { scale: 1, suffix: "", digits: 0 },
    { scale: 1_000, suffix: "k", digits: 1 },
    { scale: 1_000_000, suffix: "M", digits: 1 },
  ] as const;
  const magnitude = Math.abs(value);
  let at = magnitude >= 1_000_000 ? 2 : magnitude >= 1_000 ? 1 : 0;
  const roundedIn = (index: number): number => {
    const unit = units[index] ?? units[0];
    const factor = 10 ** unit.digits;
    // Half away from zero, as the number formatter rounds, so -1,25k and 1,25k are mirror images.
    return (Math.sign(value) * Math.round((Math.abs(value) / unit.scale) * factor)) / factor;
  };
  // Rounding can reach the next unit (999 999 is "1M", not "1000k"), so the unit follows the rounded figure.
  while (at < 2 && Math.abs(roundedIn(at)) >= 1_000) at += 1;
  const unit = units[at] ?? units[0];
  const shown = roundedIn(at);
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: unit.digits }).format(shown === 0 ? 0 : shown)}${unit.suffix}`;
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

/** The exceptional extraction date is secondary to the month in dense chart tables. */
export function observationDetail(
  dates: readonly IsoDate[],
  labels: readonly StatementLabel[],
  checkpointDates: readonly IsoDate[] = [],
): (time: number) => string | null {
  const byTime = new Map(dates.map((date, index) => [utcTime(date), labels[index]] as const));
  const checkpoints = new Map(checkpointDates.map((date) => [utcTime(date), date] as const));
  return (time) => {
    const label = byTime.get(time);
    const checkpoint = checkpoints.get(time);
    if (label?.detail !== null && label?.detail !== undefined) return label.detail;
    return checkpoint === undefined ? null : `Checkpoint: ${formatDateLong(checkpoint)}`;
  };
}
