import { describe, expect, it } from "vitest";
import { toEuroCents } from "../../../../core/Money";
import { expenseDraftChanged, expenseDraftFor, parseExpenseDraft } from "./expenseDraft";

describe("expense entry boundary", () => {
  it("preserves missing versus an explicit zero", () => {
    expect(parseExpenseDraft(["", "0", "0,00", "", "12,34"]).amounts).toEqual([null, 0, 0, null, 1234]);
  });

  it("retains invalid field locations and never accepts negatives or foreign decimal guesses", () => {
    expect(parseExpenseDraft(["-2", "1.5", "1,000.50", "1,234", "word"]).invalid).toEqual([0, 1, 2, 3, 4]);
  });

  it("formats and edits Italian cents without creating false corrections", () => {
    const original = [toEuroCents(123456), toEuroCents(0), null, null, null] as const;
    expect(expenseDraftFor(original)).toEqual(["1.234,56", "0,00", "", "", ""]);
    expect(expenseDraftChanged(["1234,56", "0", "", "", ""], original)).toBe(false);
    expect(expenseDraftChanged(["1234,56", "", "", "", ""], original)).toBe(true);
  });
});
