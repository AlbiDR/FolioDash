declare const euroCentsBrand: unique symbol;

/** Euro money as a whole number of cents. Never a binary-float amount of euros. */
export type EuroCents = number & { readonly [euroCentsBrand]: true };

const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const ITALIAN_AMOUNT = /^([+-]?)(\d+|[1-9]\d{0,2}(?:\.\d{3})+)(?:,(\d{1,2}))?$/u;
const US_AMOUNT = /^([+-]?)(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/u;
const PLAIN_DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/u;

// Decimal text is scaled to 1e-12 euro, so one cent is 1e10 units.
const DECIMAL_DIGITS = 12;
const CENT_UNITS = 10n ** 10n;
// Float noise from a double (for example 1234.560000000001) is far below 1e-6 euro.
const NOISE_LIMIT_UNITS = 10n ** 6n;

function fromBigInt(value: bigint): EuroCents | null {
  if (value > MAX_CENTS || value < -MAX_CENTS) return null;
  return Number(value) as EuroCents;
}

/** Accepts only safe whole numbers of cents. */
export function toEuroCents(value: number): EuroCents | null {
  if (!Number.isSafeInteger(value)) return null;
  return (value === 0 ? 0 : value) as EuroCents;
}

export function addCents(left: EuroCents, right: EuroCents): EuroCents | null {
  return toEuroCents(left + right);
}

export function subtractCents(left: EuroCents, right: EuroCents): EuroCents | null {
  return toEuroCents(left - right);
}

/**
 * Parses an amount typed by a person in Italian notation: dot for thousands,
 * comma for at most two decimals, optional sign and euro sign. Ambiguous or
 * foreign forms such as `1.5` or `1,000.50` are rejected, not guessed.
 */
export function parseItalianAmount(text: string): EuroCents | null {
  const match = ITALIAN_AMOUNT.exec(text.replace(/[\s€]/gu, ""));
  if (!match) return null;
  const whole = (match[2] ?? "").replaceAll(".", "");
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const cents = BigInt(whole) * 100n + BigInt(fraction);
  return fromBigInt(match[1] === "-" ? -cents : cents);
}

/**
 * Parses an amount in US notation (comma for thousands, dot for at most two
 * decimals). Only used to recognise a re-saved bank file, never for typed input.
 */
export function parseUsAmount(text: string): EuroCents | null {
  const match = US_AMOUNT.exec(text.replace(/[\s€]/gu, ""));
  if (!match) return null;
  const whole = (match[2] ?? "").replaceAll(",", "");
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const cents = BigInt(whole) * 100n + BigInt(fraction);
  return fromBigInt(match[1] === "-" ? -cents : cents);
}

/**
 * Reads a plain decimal such as `1234.56` exactly, without binary floating
 * point, and returns whole cents. Float noise far below a cent is absorbed;
 * a value that genuinely needs more than two decimals, or uses an exponent, is
 * rejected.
 */
export function parseDecimalAsCents(text: string): EuroCents | null {
  const match = PLAIN_DECIMAL.exec(text.trim());
  if (!match) return null;
  const fraction = (match[3] ?? "").slice(0, DECIMAL_DIGITS).padEnd(DECIMAL_DIGITS, "0");
  const units = BigInt((match[2] ?? "") + fraction);
  const cents = (units + CENT_UNITS / 2n) / CENT_UNITS;
  const exact = cents * CENT_UNITS;
  const residual = units > exact ? units - exact : exact - units;
  if (residual > NOISE_LIMIT_UNITS) return null;
  return fromBigInt(match[1] === "-" ? -cents : cents);
}

/** Display form only. Never parse this string back to obtain a stored value. */
export function formatEuro(amount: EuroCents): string {
  const magnitude = BigInt(Math.abs(amount));
  const euros = (magnitude / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ".");
  const cents = (magnitude % 100n).toString().padStart(2, "0");
  return `${amount < 0 ? "-" : ""}${euros},${cents} €`;
}
