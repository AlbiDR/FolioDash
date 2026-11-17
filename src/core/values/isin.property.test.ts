import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseIsin } from "./isin";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALPHANUMERIC = `${LETTERS}0123456789`;
const CHARACTERS = Array.from(ALPHANUMERIC);

/** ISO 6166 written independently of the code under test: letters become two digits, then the Luhn digit. */
function checkDigit(body: string): string {
  const digits = Array.from(body)
    .map((c) => (c >= "A" ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  let sum = 0;
  Array.from(digits)
    .reverse()
    .forEach((digit, index) => {
      const value = Number(digit) * (index % 2 === 0 ? 2 : 1);
      sum += Math.floor(value / 10) + (value % 10);
    });
  return String((10 - (sum % 10)) % 10);
}

const country = fc.stringMatching(/^[A-Z]{2}$/);
const security = fc
  .array(fc.constantFrom(...CHARACTERS), { minLength: 9, maxLength: 9 })
  .map((chars) => chars.join(""));
const validIsin = fc.tuple(country, security).map(([prefix, rest]) => {
  const body = `${prefix}${rest}`;
  return `${body}${checkDigit(body)}`;
});

describe("ISIN identity", () => {
  it("accepts every identifier whose check digit is right, and returns it canonical", () => {
    fc.assert(
      fc.property(validIsin, (isin) => {
        expect(parseIsin(isin)).toBe(isin);
        expect(parseIsin(`  ${isin.toLowerCase()} `)).toBe(isin);
      }),
    );
  });

  it("rejects the same identifier with any other check digit", () => {
    fc.assert(
      fc.property(validIsin, fc.integer({ min: 1, max: 9 }), (isin, offset) => {
        const wrong = String((Number(isin.slice(-1)) + offset) % 10);
        expect(parseIsin(`${isin.slice(0, -1)}${wrong}`)).toBeNull();
      }),
    );
  });

  it("rejects an identifier of the wrong length", () => {
    fc.assert(
      fc.property(validIsin, fc.constantFrom(...CHARACTERS), (isin, extra) => {
        expect(parseIsin(`${isin}${extra}`)).toBeNull();
        expect(parseIsin(isin.slice(0, -1))).toBeNull();
      }),
    );
  });
});
