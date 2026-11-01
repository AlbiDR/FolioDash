import { type IsoDate, formatMonthShort, toIsoDate } from "../../../../core/IsoDate";
import { type EuroCents, formatEuro, toEuroCents } from "../../../../core/Money";

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
