import { describe, expect, it } from "vitest";
import { formatPercent } from "./Percent";

describe("formatPercent", () => {
  it("formats in Italian notation with two decimals", () => {
    expect(formatPercent(0.1111)).toBe("11,11 %");
    expect(formatPercent(0.05)).toBe("5,00 %");
    expect(formatPercent(12.3456)).toBe("1.234,56 %");
  });

  it("marks the sign only when asked, and never shows a negative zero", () => {
    expect(formatPercent(0.0452, { signed: true })).toBe("+4,52 %");
    expect(formatPercent(-0.05)).toBe("-5,00 %");
    expect(formatPercent(-0.05, { signed: true })).toBe("-5,00 %");
    expect(formatPercent(0, { signed: true })).toBe("0,00 %");
    expect(formatPercent(-0.00001)).toBe("0,00 %");
  });

  it("shows a dash when the figure is unavailable, not zero", () => {
    expect(formatPercent(null)).toBe("-");
    expect(formatPercent(Number.NaN)).toBe("-");
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("-");
  });
});
