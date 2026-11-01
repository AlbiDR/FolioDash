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

// Days from the 1900 spreadsheet epoch to 1970-01-01, and between the 1900 and 1904 systems.
const SERIAL_1900_TO_UNIX_DAYS = 25569;
const SERIAL_1904_OFFSET_DAYS = 1462;
// Serials before 61 touch the spreadsheet's fictitious 29 February 1900.
const FIRST_SUPPORTED_SERIAL_1900 = 61;

/**
 * Converts a whole spreadsheet date serial to a calendar date. A serial with a
 * time-of-day fraction is not a date cell and is rejected.
 */
export function fromSpreadsheetSerial(serial: number, date1904: boolean): IsoDate | null {
  if (!Number.isSafeInteger(serial)) return null;
  const serial1900 = date1904 ? serial + SERIAL_1904_OFFSET_DAYS : serial;
  if (serial1900 < FIRST_SUPPORTED_SERIAL_1900) return null;
  // Civil-from-days conversion over the proleptic Gregorian calendar.
  const z = serial1900 - SERIAL_1900_TO_UNIX_DAYS + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPart = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1;
  const month = monthPart < 10 ? monthPart + 3 : monthPart - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return toIsoDate(year, month, day);
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

/** Display only, for a narrow column heading, for example `Nov 26`. */
export function formatMonthShort(date: IsoDate): string {
  const { year, month } = parts(date);
  return `${monthName(month).slice(0, 3)} ${String(year % 100).padStart(2, "0")}`;
}
