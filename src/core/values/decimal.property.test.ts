import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decimalFromParts, decimalToString, decimalsEqual, parseDecimal } from "./decimal";

const decimal = fc
  .record({
    units: fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n }),
    scale: fc.integer({ min: 0, max: 18 }),
  })
  .map(({ units, scale }) => decimalFromParts(units, scale));

describe("exact decimals", () => {
  it("round-trip through their text without losing a digit", () => {
    fc.assert(
      fc.property(decimal, (value) => {
        const parsed = parseDecimal(decimalToString(value));
        expect(parsed).not.toBeNull();
        if (parsed !== null) expect(decimalsEqual(parsed, value)).toBe(true);
      }),
    );
  });

  it("compare by value, so a trailing zero changes nothing", () => {
    fc.assert(
      fc.property(decimal, fc.integer({ min: 0, max: 6 }), (value, zeros) => {
        const padded = decimalFromParts(value.units * 10n ** BigInt(zeros), value.scale + zeros);
        expect(decimalsEqual(value, padded)).toBe(true);
        expect(decimalsEqual(padded, value)).toBe(true);
      }),
    );
  });

  it("tell apart two values that differ by one unit in the last place", () => {
    fc.assert(
      fc.property(decimal, (value) => {
        expect(decimalsEqual(value, decimalFromParts(value.units + 1n, value.scale))).toBe(false);
      }),
    );
  });

  it("refuse anything that is not plain decimal text", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{1,6}[eE][+-]?[0-9]{1,3}$/), (text) => {
        expect(parseDecimal(text)).toBeNull();
      }),
    );
  });
});
