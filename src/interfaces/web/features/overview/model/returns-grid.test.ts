import { describe, expect, it } from "vitest";
import { returnsGrid } from "./returns-grid";
import { statementLabels } from "../../../../../core/statements/statement-labels";
import { parseIsoDate, type IsoDate } from "../../../../../core/values/iso-date";

function day(text: string): IsoDate {
  const date = parseIsoDate(text);
  if (date === null) throw new Error("Invalid synthetic date");
  return date;
}

describe("returns grid", () => {
  const dates = [day("2025-11-15"), day("2025-12-15"), day("2026-01-15"), day("2026-02-15")];

  it("places each change under its calendar year and month without changing it", () => {
    const grid = returnsGrid(dates, statementLabels(dates), [null, 0.01, -0.02, 0.005]);
    expect(grid.rows.map((row) => row.year)).toEqual([2025, 2026]);
    expect(grid.rows[0]?.cells[10]).toBeNull();
    expect(grid.rows[0]?.cells[11]).toBe(0.01);
    expect(grid.rows[1]?.cells[0]).toBe(-0.02);
    expect(grid.rows[1]?.cells[1]).toBe(0.005);
    expect(grid.largest).toBe(0.02);
  });

  it("names a statement exported in the first days of a month after the month it closes", () => {
    const early = [day("2026-01-31"), day("2026-03-02")];
    const labels = statementLabels(early);
    const grid = returnsGrid(early, labels, [null, 0.03]);
    expect(labels[1]?.kind).toBe("closes-previous-month");
    expect(grid.rows[0]?.cells[1]).toBe(0.03);
    expect(grid.rows[0]?.cells[2]).toBeNull();
  });

  it("keeps a row for a year with no statements between the first and last", () => {
    const sparse = [day("2024-06-15"), day("2026-06-15")];
    const grid = returnsGrid(sparse, statementLabels(sparse), [null, 0.01]);
    expect(grid.rows.map((row) => row.year)).toEqual([2024, 2025, 2026]);
    expect(grid.rows[1]?.cells.every((cell) => cell === null)).toBe(true);
  });

  it("is empty with no statements", () => {
    expect(returnsGrid([], [], [])).toEqual({ rows: [], largest: 0 });
  });
});
