import { describe, expect, it } from "vitest";
import { columnClass } from "./month-columns";
import { parseIsoDate, type IsoDate } from "../../../../../core/values/iso-date";

function day(text: string): IsoDate {
  const date = parseIsoDate(text);
  if (date === null) throw new Error("Invalid synthetic date");
  return date;
}

const dates = [day("2025-11-15"), day("2025-12-15"), day("2026-01-15"), day("2026-02-15")];

describe("statement column cues", () => {
  it("starts a rule only where the calendar year changes, never on the first column", () => {
    expect(dates.map((_, position) => columnClass(dates, position, -1).includes("matrix-year-start"))).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  it("tints exactly the chosen statement", () => {
    expect(dates.map((_, position) => columnClass(dates, position, 3).includes("matrix-selected"))).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(columnClass(dates, 2, 2)).toBe("matrix-year-start matrix-selected");
  });
});
