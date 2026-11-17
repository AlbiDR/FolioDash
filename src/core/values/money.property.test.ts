import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addCents, formatEuro, parseItalianAmount, subtractCents, toEuroCents, type EuroCents } from "./money";

const safeInteger = fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER });
const cents = (value: number): EuroCents => {
  const result = toEuroCents(value);
  if (result === null) throw new Error(`not a safe cent amount: ${String(value)}`);
  return result;
};

describe("exact cents", () => {
  it("accepts exactly the safe whole numbers and normalises negative zero", () => {
    fc.assert(
      fc.property(safeInteger, (value) => {
        expect(toEuroCents(value)).toBe(value === 0 ? 0 : value);
      }),
    );
    expect(Object.is(toEuroCents(-0), 0)).toBe(true);
  });

  it("rejects fractions, infinities and NaN", () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true }).filter((value) => !Number.isInteger(value)),
        (value) => {
          expect(toEuroCents(value)).toBeNull();
        },
      ),
    );
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2 ** 53]) {
      expect(toEuroCents(value)).toBeNull();
    }
  });

  it("adds and subtracts exactly, and refuses a result that is not a safe amount", () => {
    fc.assert(
      fc.property(safeInteger, safeInteger, (left, right) => {
        const sum = left + right;
        expect(addCents(cents(left), cents(right))).toBe(Number.isSafeInteger(sum) ? (sum === 0 ? 0 : sum) : null);
        const difference = left - right;
        expect(subtractCents(cents(left), cents(right))).toBe(
          Number.isSafeInteger(difference) ? (difference === 0 ? 0 : difference) : null,
        );
      }),
    );
  });

  it("is commutative for addition and undoes a subtraction when both steps are representable", () => {
    fc.assert(
      fc.property(safeInteger, safeInteger, (left, right) => {
        expect(addCents(cents(left), cents(right))).toBe(addCents(cents(right), cents(left)));
        const difference = subtractCents(cents(left), cents(right));
        if (difference !== null) {
          const restored = addCents(difference, cents(right));
          if (restored !== null) expect(restored).toBe(left === 0 ? 0 : left);
        }
      }),
    );
  });
});

describe("Italian notation", () => {
  it("parses what it formats, for every safe amount", () => {
    fc.assert(
      fc.property(safeInteger, (value) => {
        expect(parseItalianAmount(formatEuro(cents(value)))).toBe(value === 0 ? 0 : value);
      }),
    );
  });

  it("reads typed amounts to the exact cent", () => {
    const grouped = (euros: number): string => String(euros).replace(/\B(?=(\d{3})+(?!\d))/gu, ".");
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), fc.integer({ min: 0, max: 99 }), (euros, fraction) => {
        const text = `${grouped(euros)},${String(fraction).padStart(2, "0")}`;
        expect(parseItalianAmount(text)).toBe(euros * 100 + fraction);
        expect(parseItalianAmount(`-${text}`)).toBe(-(euros * 100 + fraction) || 0);
      }),
    );
  });

  it("never returns anything but null or a safe whole number, whatever the text", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (text) => {
        const parsed = parseItalianAmount(text);
        expect(parsed === null || Number.isSafeInteger(parsed)).toBe(true);
      }),
    );
  });
});
