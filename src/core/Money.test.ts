import { describe, expect, it } from "vitest";
import {
  addCents,
  formatEuro,
  formatSignedEuro,
  parseDecimalAsCents,
  parseItalianAmount,
  parseUsAmount,
  subtractCents,
  toEuroCents,
} from "./Money";

function cents(value: number) {
  const result = toEuroCents(value);
  if (result === null) throw new Error(`not whole cents: ${String(value)}`);
  return result;
}

describe("toEuroCents and arithmetic", () => {
  it("accepts safe whole numbers and rejects everything else", () => {
    expect(toEuroCents(1234)).toBe(1234);
    expect(toEuroCents(1.5)).toBeNull();
    expect(toEuroCents(Number.NaN)).toBeNull();
    expect(toEuroCents(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });

  it("never produces negative zero", () => {
    expect(Object.is(toEuroCents(-0), 0)).toBe(true);
  });

  it("adds and subtracts exactly, and reports overflow", () => {
    expect(addCents(cents(10), cents(20))).toBe(30);
    expect(subtractCents(cents(10), cents(25))).toBe(-15);
    expect(addCents(cents(Number.MAX_SAFE_INTEGER), cents(1))).toBeNull();
  });
});

describe("parseItalianAmount", () => {
  it.each([
    ["1.000,50", 100050],
    ["0,5", 50],
    ["12", 1200],
    ["1.234.567,89", 123456789],
    [" 12,34 € ", 1234],
    ["-1.000,00", -100000],
    ["+5,00", 500],
    ["1.000", 100000],
  ])("reads %j as %i cents", (text, expected) => {
    expect(parseItalianAmount(text)).toBe(expected);
  });

  it("never returns negative zero", () => {
    expect(Object.is(parseItalianAmount("-0,00"), 0)).toBe(true);
  });

  it.each(["", "1,000.50", "1.5", "12,345", "1.00", "abc", "1..000", "1.0000,00", "12,", ",50", "99999999999999999999,99"])(
    "rejects %j",
    (text) => {
      expect(parseItalianAmount(text)).toBeNull();
    },
  );
});

describe("parseUsAmount", () => {
  it.each([
    ["1,234.56", 123456],
    ["1,234", 123400],
    ["12.5", 1250],
    ["1.50", 150],
    ["-1,000.00", -100000],
  ])("reads %j as %i cents", (text, expected) => {
    expect(parseUsAmount(text)).toBe(expected);
  });

  it.each(["", "1.234", "1,00", "1.234,56", "abc"])("rejects %j", (text) => {
    expect(parseUsAmount(text)).toBeNull();
  });

  it("never overlaps with the Italian reading of the same text", () => {
    for (const text of ["1.234", "1,234", "12,50", "12.50", "1.50", "1,50"]) {
      const italian = parseItalianAmount(text);
      const us = parseUsAmount(text);
      expect(italian === null || us === null || italian === us).toBe(true);
    }
  });
});

describe("parseDecimalAsCents", () => {
  it.each([
    ["1234.5", 123450],
    ["1234.56", 123456],
    ["1234.560000000001", 123456],
    ["1234.559999999999", 123456],
    ["-12.5", -1250],
    ["0", 0],
  ])("reads %j as %i cents", (text, expected) => {
    expect(parseDecimalAsCents(text)).toBe(expected);
  });

  it.each(["", "0.015", "1e3", "12.", ".5", "1,5", "abc"])("rejects %j", (text) => {
    expect(parseDecimalAsCents(text)).toBeNull();
  });
});

describe("formatEuro", () => {
  it.each([
    [123456, "1.234,56 €"],
    [5, "0,05 €"],
    [-100000, "-1.000,00 €"],
    [0, "0,00 €"],
  ])("formats %i cents as %j", (value, expected) => {
    expect(formatEuro(cents(value))).toBe(expected);
  });

  it("round-trips through the Italian parser", () => {
    for (const value of [0, 1, 99, 100, 12345, 100000, 123456789, -1, -123456789]) {
      expect(parseItalianAmount(formatEuro(cents(value)))).toBe(value);
    }
  });
});

describe("formatSignedEuro", () => {
  it("shows a plus for gains, a minus for losses and no sign for zero", () => {
    expect(formatSignedEuro(cents(7000))).toBe("+70,00 €");
    expect(formatSignedEuro(cents(-5000))).toBe("-50,00 €");
    expect(formatSignedEuro(cents(0))).toBe("0,00 €");
  });
});
