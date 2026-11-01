/** An exact decimal number: `units` scaled down by 10^`scale`. */
export interface Decimal {
  readonly units: bigint;
  readonly scale: number;
}

// Built with BigInt() because Apps Script's file parser rejects BigInt literals such as `10n`.
const ZERO = BigInt(0);
const TEN = BigInt(10);
const PLAIN_DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/u;

export function decimalFromParts(units: bigint, scale: number): Decimal {
  return { units, scale };
}

/** Reads `12`, `-0.5` or `123.456` exactly. No exponent, no separators. */
export function parseDecimal(text: string): Decimal | null {
  const match = PLAIN_DECIMAL.exec(text.trim());
  if (!match) return null;
  const fraction = match[3] ?? "";
  const units = BigInt((match[2] ?? "") + fraction);
  return { units: match[1] === "-" ? -units : units, scale: fraction.length };
}

/** Exact canonical text, keeping every digit, for example `123.456`. */
export function decimalToString(value: Decimal): string {
  const negative = value.units < ZERO;
  const digits = (negative ? -value.units : value.units).toString().padStart(value.scale + 1, "0");
  const whole = digits.slice(0, digits.length - value.scale);
  const fraction = digits.slice(digits.length - value.scale);
  return `${negative ? "-" : ""}${whole}${value.scale > 0 ? `.${fraction}` : ""}`;
}

/** Value equality, so `1.50` equals `1.5`. */
export function decimalsEqual(left: Decimal, right: Decimal): boolean {
  const scale = Math.max(left.scale, right.scale);
  return left.units * TEN ** BigInt(scale - left.scale) === right.units * TEN ** BigInt(scale - right.scale);
}

/** Approximate value, for plausibility checks only. Never store the result. */
export function decimalToNumber(value: Decimal): number {
  return Number(value.units) / 10 ** value.scale;
}
