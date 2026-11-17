const ISIN_SHAPE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/**
 * Returns the canonical ISIN (trimmed, upper case) or null when the value is
 * malformed or its check digit is wrong. Identity is the validated ISIN.
 */
export function parseIsin(raw: string): string | null {
  const candidate = raw.trim().toUpperCase();
  if (!ISIN_SHAPE.test(candidate)) return null;

  // ISO 6166: expand each letter to two digits (A = 10 ... Z = 35), then apply
  // the Luhn check over the whole digit string.
  let digits = "";
  for (const character of candidate) {
    digits += character >= "A" ? String(character.charCodeAt(0) - 55) : character;
  }
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index--) {
    const value = (digits.charCodeAt(index) - 48) * (double ? 2 : 1);
    sum += value > 9 ? value - 9 : value;
    double = !double;
  }
  return sum % 10 === 0 ? candidate : null;
}
