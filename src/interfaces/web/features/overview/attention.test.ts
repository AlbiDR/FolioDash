import { describe, expect, it } from "vitest";
import { STATEMENT_DUE_AFTER_DAYS, daysBetween, portfolioAttention } from "./attention";
import { parseIsoDate, type IsoDate } from "../../../../core/iso-date";

function day(text: string): IsoDate {
  const date = parseIsoDate(text);
  if (date === null) throw new Error("Invalid synthetic date");
  return date;
}

describe("portfolio attention", () => {
  it("counts whole calendar days across month and year ends", () => {
    expect(daysBetween(day("2026-01-31"), day("2026-02-28"))).toBe(28);
    expect(daysBetween(day("2025-12-31"), day("2026-01-01"))).toBe(1);
    expect(daysBetween(day("2026-03-01"), day("2026-03-01"))).toBe(0);
  });

  it("asks for the next statement only after the due threshold", () => {
    const last = day("2026-01-15");
    const onTheLine = portfolioAttention({
      source: "recorded",
      lastStatement: last,
      today: day("2026-02-19"),
      pendingChange: false,
    });
    expect(daysBetween(last, day("2026-02-19"))).toBe(STATEMENT_DUE_AFTER_DAYS);
    expect(onTheLine).toEqual([]);
    const late = portfolioAttention({
      source: "recorded",
      lastStatement: last,
      today: day("2026-02-20"),
      pendingChange: false,
    });
    expect(late).toHaveLength(1);
    expect(late[0]?.id).toBe("statement-due");
    expect(late[0]?.message).toContain("36 days old");
  });

  it("puts an unconfirmed history change before the reminder", () => {
    const items = portfolioAttention({
      source: "recorded",
      lastStatement: day("2026-01-15"),
      today: day("2026-06-01"),
      pendingChange: true,
    });
    expect(items.map((item) => item.id)).toEqual(["pending-change", "statement-due"]);
  });

  it("asks for nothing on demonstration data, with no statements, or with a statement dated in the future", () => {
    expect(
      portfolioAttention({
        source: "demo",
        lastStatement: day("2020-01-01"),
        today: day("2026-01-01"),
        pendingChange: true,
      }),
    ).toEqual([]);
    expect(
      portfolioAttention({
        source: "recorded",
        lastStatement: undefined,
        today: day("2026-01-01"),
        pendingChange: false,
      }),
    ).toEqual([]);
    expect(
      portfolioAttention({
        source: "recorded",
        lastStatement: day("2026-03-01"),
        today: day("2026-01-01"),
        pendingChange: false,
      }),
    ).toEqual([]);
  });
});
