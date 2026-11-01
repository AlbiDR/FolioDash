import { type Decimal, decimalFromParts, decimalToNumber, decimalsEqual, parseDecimal } from "../../core/Decimal";
import { type IsoDate, fromSpreadsheetSerial, parseBankDate } from "../../core/IsoDate";
import { type EuroCents, parseDecimalAsCents, parseItalianAmount, parseUsAmount } from "../../core/Money";
import type { RawCell } from "../../core/RawSheet";

export type Currency = "EUR" | "USD" | "OTHER";

/** One possible reading of a cell. `adjustment` names how it differs from the bank's own form. */
export interface Candidate<T> {
  readonly value: T;
  readonly adjustment: string | null;
}

export type ReadResult<T> =
  | { readonly status: "missing" }
  | { readonly status: "unreadable" }
  | { readonly status: "ok"; readonly candidates: readonly Candidate<T>[] };

export interface PriceReading {
  readonly value: Decimal;
  readonly currency: Currency | null;
}

const PLACEHOLDERS = new Set(["", "-", "N.A.", "N.D.", "N.C."]);
const IT_DECIMAL = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d+)$/u;
const US_DECIMAL = /^(\d{1,3}(?:,\d{3})+|\d+)\.(\d+)$/u;
const WHOLE = /^\d+$/u;
const NATIVE_PRICE = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d+)([€$]) $/u;
const NATIVE_RATE = /^(\d+),(\d+) $/u;
const PRICE_WITH_SYMBOL = /^(.*?)([€$]?)\s*$/u;
const DURATION_FORMAT = /\[h\]/iu;

/** True for an absent cell, blank text, or one of the bank's placeholder tokens. */
export function isMissing(cell: RawCell | undefined): boolean {
  return cell === undefined || (cell.kind === "text" && PLACEHOLDERS.has(cell.text.trim()));
}

function ok<T>(candidates: readonly Candidate<T>[]): ReadResult<T> {
  return candidates.length === 0 ? { status: "unreadable" } : { status: "ok", candidates };
}

function decimalReadings(text: string): Decimal[] {
  const readings: Decimal[] = [];
  const italian = IT_DECIMAL.exec(text);
  if (italian) {
    const value = parseDecimal(`${(italian[1] ?? "").replaceAll(".", "")}.${italian[2] ?? ""}`);
    if (value) readings.push(value);
  }
  const american = US_DECIMAL.exec(text);
  if (american) {
    const value = parseDecimal(`${(american[1] ?? "").replaceAll(",", "")}.${american[2] ?? ""}`);
    if (value) readings.push(value);
  }
  if (WHOLE.test(text)) {
    const value = parseDecimal(text);
    if (value) readings.push(value);
  }
  return readings;
}

function isPositive(value: Decimal): boolean {
  return value.units > 0n;
}

/** A quantity stored as a time duration (hours.minutes typed into a time format) has many possible readings. */
function durationReadings(text: string): Decimal[] {
  const days = parseDecimal(text);
  if (!days) return [];
  const numerator = days.units * 1440n;
  const denominator = 10n ** BigInt(days.scale);
  const minutes = (2n * numerator + denominator) / (2n * denominator);
  const residual = numerator > minutes * denominator ? numerator - minutes * denominator : minutes * denominator - numerator;
  if (minutes < 0n || residual * 1_000_000n > denominator) return [];
  // The original text was hours + thousandths (for example 123.456), read as hours + minutes.
  const readings: Decimal[] = [];
  for (let thousandths = 0n; thousandths < 1000n; thousandths++) {
    const remaining = minutes - thousandths;
    if (remaining >= 0n && remaining % 60n === 0n) {
      readings.push(decimalFromParts((remaining / 60n) * 1000n + thousandths, 3));
    }
  }
  return readings;
}

export function readQuantity(cell: RawCell | undefined): ReadResult<Decimal> {
  if (cell === undefined || isMissing(cell)) return { status: "missing" };
  if (cell.kind === "number") {
    if (cell.format !== null && DURATION_FORMAT.test(cell.format)) {
      return ok(durationReadings(cell.text).map((value) => ({ value, adjustment: "quantity stored as a time duration" })));
    }
    const value = parseDecimal(cell.text);
    return value && value.units >= 0n ? ok([{ value, adjustment: null }]) : { status: "unreadable" };
  }
  if (cell.kind === "text") {
    return ok(
      decimalReadings(cell.text.trim())
        .filter((value) => value.units >= 0n)
        .map((value) => ({ value, adjustment: "quantity stored as text" })),
    );
  }
  return { status: "unreadable" };
}

function currencyOf(symbol: string): Currency | null {
  if (symbol === "€") return "EUR";
  if (symbol === "$") return "USD";
  return null;
}

export function readPrice(cell: RawCell | undefined): ReadResult<PriceReading> {
  if (cell === undefined || isMissing(cell)) return { status: "missing" };
  if (cell.kind === "number") {
    const value = parseDecimal(cell.text);
    return value && isPositive(value)
      ? ok([{ value: { value, currency: null }, adjustment: "price stored as a number" }])
      : { status: "unreadable" };
  }
  if (cell.kind !== "text") return { status: "unreadable" };
  const native = NATIVE_PRICE.exec(cell.text);
  if (native) {
    const value = parseDecimal(`${(native[1] ?? "").replaceAll(".", "")}.${native[2] ?? ""}`);
    return value && isPositive(value)
      ? ok([{ value: { value, currency: currencyOf(native[3] ?? "") }, adjustment: null }])
      : { status: "unreadable" };
  }
  const split = PRICE_WITH_SYMBOL.exec(cell.text.trim());
  const currency = currencyOf(split?.[2] ?? "");
  return ok(
    decimalReadings((split?.[1] ?? "").trim())
      .filter(isPositive)
      .map((value) => ({ value: { value, currency }, adjustment: "price text differs from the bank's form" })),
  );
}

export function readRate(cell: RawCell | undefined): ReadResult<Decimal> {
  if (cell === undefined || isMissing(cell)) return { status: "missing" };
  if (cell.kind === "number") {
    const value = parseDecimal(cell.text);
    return value && isPositive(value)
      ? ok([{ value, adjustment: "exchange rate stored as a number" }])
      : { status: "unreadable" };
  }
  if (cell.kind !== "text") return { status: "unreadable" };
  const native = NATIVE_RATE.exec(cell.text);
  if (native) {
    const value = parseDecimal(`${native[1] ?? ""}.${native[2] ?? ""}`);
    return value && isPositive(value) ? ok([{ value, adjustment: null }]) : { status: "unreadable" };
  }
  return ok(
    decimalReadings(cell.text.trim())
      .filter(isPositive)
      .map((value) => ({ value, adjustment: "exchange rate text differs from the bank's form" })),
  );
}

/** The bank-published risk figure, a fraction. Not used in results. */
export function readRisk(cell: RawCell | undefined): ReadResult<Decimal> {
  if (cell === undefined || isMissing(cell)) return { status: "missing" };
  if (cell.kind === "number") {
    const value = parseDecimalFraction(cell.text);
    return value ? ok([{ value, adjustment: null }]) : { status: "unreadable" };
  }
  if (cell.kind !== "text") return { status: "unreadable" };
  return ok(decimalReadings(cell.text.trim()).map((value) => ({ value, adjustment: "risk stored as text" })));
}

/** Float noise such as 0.21000000000000002 is rounded to four decimals (the 0.00% display). */
function parseDecimalFraction(text: string): Decimal | null {
  const value = parseDecimal(text);
  if (!value) return null;
  if (value.scale <= 4) return value;
  const drop = 10n ** BigInt(value.scale - 4);
  const rounded = (value.units + (value.units < 0n ? -drop / 2n : drop / 2n)) / drop;
  return decimalFromParts(rounded, 4);
}

/** Euro amounts: numeric cells, or text in Italian or US notation. `nativeText` marks text as the bank's own form. */
export function readMoney(cell: RawCell | undefined, nativeText: boolean): ReadResult<EuroCents> {
  if (cell === undefined || isMissing(cell)) return { status: "missing" };
  if (cell.kind === "number") {
    const value = parseDecimalAsCents(cell.text);
    return value === null
      ? { status: "unreadable" }
      : ok([{ value, adjustment: nativeText ? "amount stored as a number" : null }]);
  }
  if (cell.kind !== "text") return { status: "unreadable" };
  const italian = parseItalianAmount(cell.text);
  const american = parseUsAmount(cell.text);
  const candidates: Candidate<EuroCents>[] = [];
  if (italian !== null) {
    candidates.push({ value: italian, adjustment: nativeText ? null : "amount stored as text" });
  }
  if (american !== null && american !== italian) {
    candidates.push({ value: american, adjustment: "amount stored as text in US notation" });
  }
  return ok(candidates);
}

/** The subscription date: the bank's `dd/mm/yyyy` text, or a spreadsheet date number. */
export function readDate(cell: RawCell | undefined, date1904: boolean): ReadResult<IsoDate> {
  if (cell === undefined || isMissing(cell)) return { status: "missing" };
  if (cell.kind === "text") {
    const value = parseBankDate(cell.text);
    return value === null ? { status: "unreadable" } : ok([{ value, adjustment: null }]);
  }
  if (cell.kind === "number") {
    const value = fromSpreadsheetSerial(Number(cell.text), date1904);
    return value === null ? { status: "unreadable" } : ok([{ value, adjustment: "date stored as a number" }]);
  }
  return { status: "unreadable" };
}

export function risksEqual(left: Decimal | null, right: Decimal | null): boolean {
  if (left === null || right === null) return left === right;
  return decimalsEqual(left, right);
}

// Bank prices and rates carry at least three decimals, even when a number cell drops trailing zeros.
const MINIMUM_DISPLAYED_DECIMALS = 3;

function halfUnitInLastPlace(value: Decimal): number {
  return 0.5 / 10 ** Math.max(value.scale, MINIMUM_DISPLAYED_DECIMALS);
}

/**
 * Plausibility check: market value should equal quantity x price (divided by the
 * exchange rate for foreign funds). The allowed gap is twice the rounding error of
 * the displayed price and rate, plus one cent. Floating point is acceptable here
 * because nothing computed is stored.
 */
export function reconciles(quantity: Decimal, price: Decimal, rate: Decimal | null, marketValue: EuroCents): boolean {
  const priceValue = decimalToNumber(price);
  const rateValue = rate === null ? 1 : decimalToNumber(rate);
  if (priceValue <= 0 || rateValue <= 0) return false;
  const expected = (decimalToNumber(quantity) * priceValue) / rateValue;
  const actual = Number(marketValue) / 100;
  const relativeAllowance =
    2 * (halfUnitInLastPlace(price) / priceValue + (rate === null ? 0 : halfUnitInLastPlace(rate) / rateValue));
  const gap = Math.abs(expected - actual);
  return gap <= relativeAllowance * Math.abs(actual) + 0.01;
}

export interface FundValues {
  readonly quantity: Decimal | null;
  readonly price: Decimal | null;
  readonly currency: Currency | null;
  readonly exchangeRate: Decimal | null;
  readonly adjustments: readonly string[];
}

export type ResolveOutcome =
  | { readonly status: "ok"; readonly values: FundValues }
  | {
      readonly status: "failed";
      readonly code: "ambiguous-reading" | "does-not-reconcile" | "currency-mismatch";
      readonly message: string;
    };

function candidatesOrAbsent<T>(result: ReadResult<T>): readonly Candidate<T | null>[] {
  return result.status === "ok" ? result.candidates : [{ value: null, adjustment: null }];
}

function key(value: Decimal | null): string {
  return value === null ? "-" : `${value.units.toString()}e${String(value.scale)}`;
}

/**
 * Chooses the one reading of quantity, price and rate that is consistent with the
 * market value and with the currency symbol. Fails when none or several qualify.
 */
export function resolveFundValues(input: {
  readonly quantity: ReadResult<Decimal>;
  readonly price: ReadResult<PriceReading>;
  readonly rate: ReadResult<Decimal>;
  readonly marketValue: EuroCents;
}): ResolveOutcome {
  const passing = new Map<string, FundValues>();
  let currencyConflict = false;
  for (const quantity of candidatesOrAbsent(input.quantity)) {
    for (const price of candidatesOrAbsent(input.price)) {
      for (const rate of candidatesOrAbsent(input.rate)) {
        const symbolCurrency = price.value?.currency ?? null;
        if ((symbolCurrency === "EUR" && rate.value !== null) || (symbolCurrency === "USD" && rate.value === null)) {
          currencyConflict = true;
          continue;
        }
        const currency: Currency | null =
          price.value === null ? null : (symbolCurrency ?? (rate.value === null ? "EUR" : "OTHER"));
        if (
          quantity.value !== null &&
          price.value !== null &&
          !reconciles(quantity.value, price.value.value, rate.value, input.marketValue)
        ) {
          continue;
        }
        const adjustments = [quantity.adjustment, price.adjustment, rate.adjustment].filter(
          (entry): entry is string => entry !== null,
        );
        passing.set(`${key(quantity.value)}|${key(price.value?.value ?? null)}|${key(rate.value)}`, {
          quantity: quantity.value,
          price: price.value?.value ?? null,
          currency,
          exchangeRate: rate.value,
          adjustments,
        });
      }
    }
  }
  const [only, ...others] = [...passing.values()];
  if (only === undefined) {
    return currencyConflict
      ? {
          status: "failed",
          code: "currency-mismatch",
          message: "The price currency symbol disagrees with the exchange-rate cell.",
        }
      : {
          status: "failed",
          code: "does-not-reconcile",
          message: "No reading of quantity, price and exchange rate matches the market value.",
        };
  }
  if (others.length > 0) {
    return {
      status: "failed",
      code: "ambiguous-reading",
      message: "More than one reading of quantity, price and exchange rate matches the market value.",
    };
  }
  return { status: "ok", values: only };
}
