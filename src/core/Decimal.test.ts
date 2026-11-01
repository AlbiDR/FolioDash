import { describe, expect, it } from "vitest";
import { decimalToNumber, decimalToString, decimalsEqual, parseDecimal } from "./Decimal";

function decimal(text: string) {
  const result = parseDecimal(text);
  if (result === null) throw new Error(`not a decimal: ${text}`);
  return result;
}

describe("parseDecimal", () => {
  it.each(["12", "-0.5", "123.456", "0.0000001", "+3.10"])("round-trips %s exactly", (text) => {
    const expected = text.startsWith("+") ? text.slice(1) : text;
    expect(decimalToString(decimal(text))).toBe(expected);
  });

  it.each(["", "1e3", "12.", ".5", "1,5", "abc", "1.2.3"])("rejects %j", (text) => {
    expect(parseDecimal(text)).toBeNull();
  });
});

describe("decimalsEqual", () => {
  it("compares by value, not by written scale", () => {
    expect(decimalsEqual(decimal("1.50"), decimal("1.5"))).toBe(true);
    expect(decimalsEqual(decimal("1.5"), decimal("1.51"))).toBe(false);
    expect(decimalsEqual(decimal("-0"), decimal("0"))).toBe(true);
  });
});

describe("decimalToNumber", () => {
  it("gives an approximate value for plausibility checks", () => {
    expect(decimalToNumber(decimal("123.456"))).toBeCloseTo(123.456, 9);
  });
});
