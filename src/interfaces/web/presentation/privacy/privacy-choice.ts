import { type EuroCents, formatEuro, formatSignedEuro } from "../../../../core/values/money";

const KEY = "foliodash.privacy.v1";

/** The slice of localStorage used, so the behaviour can be tested and a blocked store is survivable. */
export interface PrivacyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Amounts are hidden unless the person chose to show them. Hidden is the default
 * because the screen holds bank data and may be seen by others. Only the choice
 * is remembered, on this device, never any figure.
 */
export function readPrivacyChoice(open: () => PrivacyStorage): boolean {
  try {
    return open().getItem(KEY) !== "shown";
  } catch {
    return true;
  }
}

export function writePrivacyChoice(open: () => PrivacyStorage, hidden: boolean): void {
  try {
    open().setItem(KEY, hidden ? "hidden" : "shown");
  } catch {
    // Not remembered; the screen still works.
  }
}

export const MASK = "••••";

/**
 * Replaces the digits and separators of an already formatted amount with the mask.
 * The currency symbol, sign and spacing are kept: only the number is hidden.
 */
export function maskNumbers(formatted: string): string {
  return formatted.replace(/[\d.,]+/u, MASK);
}

/**
 * An axis tick while amounts are hidden: the mask alone. An abbreviated tick such as "12,5k" keeps its suffix under
 * maskNumbers, which would still tell the size of the portfolio.
 */
export function axisLabelText(label: string, hidden: boolean): string {
  return hidden ? MASK : label;
}

/** Text for an amount, with its number hidden when asked. Percentages never go through this: they reveal no amount. */
export function amountText(cents: EuroCents, hidden: boolean, signed = false): string {
  const formatted = signed ? formatSignedEuro(cents) : formatEuro(cents);
  return hidden ? maskNumbers(formatted) : formatted;
}
