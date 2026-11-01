declare const isoDateBrand: unique symbol;

/**
 * A calendar date without time or time zone, written `YYYY-MM-DD`. This form
 * sorts chronologically as plain text, so storage and ordering never depend on
 * a locale. Spelled months exist only in display functions.
 */
export type IsoDate = string & { readonly [isoDateBrand]: true };

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2999;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const BANK_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/u;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** Builds a date from parts, or returns null when it is not a real calendar date in range. */
export function toIsoDate(year: number, month: number, day: number): IsoDate | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as IsoDate;
}

/** Strict `YYYY-MM-DD` only; surrounding spaces are ignored. */
export function parseIsoDate(text: string): IsoDate | null {
  const match = ISO_DATE.exec(text.trim());
  if (!match) return null;
  return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** The bank's text form `dd/mm/yyyy`, always day first and zero padded. */
export function parseBankDate(text: string): IsoDate | null {
  const match = BANK_DATE.exec(text.trim());
  if (!match) return null;
  return toIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

export function compareIsoDates(left: IsoDate, right: IsoDate): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function parts(date: IsoDate): { year: number; month: number; day: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) };
}

/** Counts months from year 0, so consecutive months differ by exactly 1 across year ends. */
export function monthSerial(date: IsoDate): number {
  const { year, month } = parts(date);
  return year * 12 + month - 1;
}

/** `YYYY-MM`, for grouping statements by calendar month. */
export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

function monthName(month: number): string {
  // An IsoDate always carries a month from 1 to 12.
  return MONTH_NAMES[month - 1] as string;
}

/** Display only, for example `1 November 2026`. Never parse it back. */
export function formatDateLong(date: IsoDate): string {
  const { year, month, day } = parts(date);
  return `${String(day)} ${monthName(month)} ${String(year)}`;
}

/** Display only, for example `November 2026`. */
export function formatMonthYear(date: IsoDate): string {
  const { year, month } = parts(date);
  return `${monthName(month)} ${String(year)}`;
}
