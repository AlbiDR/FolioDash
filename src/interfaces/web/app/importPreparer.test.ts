import { describe, expect, it } from "vitest";
import { FORMULA, ROW, COL, number, syntheticSheet, text, withCell } from "../../../../tests/fixtures/SyntheticFideuramSheet";
import { buildXlsx } from "../../../../tests/fixtures/SyntheticXlsx";
import { type IsoDate, toIsoDate } from "../../../core/IsoDate";
import type { ImportFile } from "../../../applications/ImportModel";
import { createImportPreparer } from "./importPreparer";
import { planExcelHistory, prepareExcelHistory } from "../../../applications/ExcelHistory";
import { EMPTY_LEDGER } from "../../../core/Ledger";

// A fixed UTC clock, so the tests do not depend on the machine's time zone.
function utcDate(milliseconds: number): IsoDate | null {
  const moment = new Date(milliseconds);
  return toIsoDate(moment.getUTCFullYear(), moment.getUTCMonth() + 1, moment.getUTCDate());
}

const prepare = createImportPreparer(utcDate);

function file(bytes: Uint8Array, overrides: Partial<ImportFile> = {}): ImportFile {
  return {
    name: "estrazione_prodotti_patrimonio.xlsx",
    size: bytes.length,
    lastModified: null,
    read: () => Promise.resolve(bytes),
    ...overrides,
  };
}

describe("createImportPreparer", () => {
  it("reviews a clean file and proposes the date from its creation time", async () => {
    const bytes = await buildXlsx([{ name: "Il Mio Patrimonio", sheet: syntheticSheet() }], {
      created: "2026-11-01T10:48:57Z",
    });
    const review = await prepare(file(bytes));
    expect(review.status).toBe("reviewed");
    if (review.status !== "reviewed") return;
    expect(review.dateCandidate).toEqual({ date: "2026-11-01", source: "file-created" });
    expect(review.sheets).toHaveLength(1);
    const outcome = review.sheets[0]?.outcome;
    expect(outcome?.ok).toBe(true);
    if (outcome?.ok) {
      expect(outcome.statement.funds).toHaveLength(2);
      expect(outcome.statement.adjustments).toEqual([]);
    }
  });

  it("falls back to a date in the file name when the file records no creation time", async () => {
    const bytes = await buildXlsx([{ name: "S", sheet: syntheticSheet() }]);
    const review = await prepare(file(bytes, { name: "2026-03-15.xlsx" }));
    expect(review.status === "reviewed" && review.dateCandidate).toEqual({ date: "2026-03-15", source: "file-name" });
  });

  it("lists only the sheets that look like a holdings sheet", async () => {
    const bytes = await buildXlsx([
      { name: "Notes", sheet: { rows: [[text("just notes")]], date1904: false } },
      { name: "April", sheet: syntheticSheet() },
      { name: "May", sheet: syntheticSheet() },
    ]);
    const review = await prepare(file(bytes));
    expect(review.status === "reviewed" && review.sheets.map((entry) => entry.name)).toEqual(["April", "May"]);
  });

  it("prepares an actual multi-sheet workbook using independent sheet dates, ignoring notes and container dates", async () => {
    const bytes = await buildXlsx([
      { name: "Bank 2026-03-31", sheet: syntheticSheet() },
      { name: "Notes", sheet: { rows: [[text("synthetic notes")]], date1904: false } },
      { name: "31-01-2026", sheet: syntheticSheet() },
      { name: "February", sheet: syntheticSheet() },
    ], { created: "2026-11-04T12:00:00Z" });
    const batch = await prepareExcelHistory([file(bytes)], prepare);
    expect(batch.problems).toEqual([]);
    expect(batch.notices).toHaveLength(1);
    expect(batch.notices[0]).toContain("Notes");
    expect(batch.entries.map((entry) => [entry.sheet.name, entry.date])).toEqual([
      ["Bank 2026-03-31", "2026-03-31"], ["31-01-2026", "2026-01-31"], ["February", ""],
    ]);
    expect(planExcelHistory(batch.entries, EMPTY_LEDGER).ok).toBe(false);
    const confirmed = batch.entries.map((entry) => entry.date === "" ? { ...entry, date: "2026-02-28" } : entry);
    const plan = planExcelHistory(confirmed, EMPTY_LEDGER);
    expect(plan.ok && plan.entries.map((entry) => entry.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("checks every sheet and keeps a malformed statement visible instead of silently omitting it", async () => {
    const broken = withCell(syntheticSheet(), ROW.productA, COL.H, FORMULA);
    const bytes = await buildXlsx([
      { name: "2026-01-31", sheet: syntheticSheet() },
      { name: "2026-02-28", sheet: broken },
    ]);
    const batch = await prepareExcelHistory([file(bytes)], prepare);
    expect(batch.entries).toHaveLength(2);
    expect(planExcelHistory(batch.entries, EMPTY_LEDGER).ok).toBe(false);
    const excluded = batch.entries.map((entry) => ({ ...entry, selected: entry.sheet.outcome.ok }));
    expect(planExcelHistory(excluded, EMPTY_LEDGER).ok).toBe(true);
  });

  it("reports a holdings sheet that fails its checks, with the cell", async () => {
    const broken = withCell(syntheticSheet(), ROW.productA, COL.G, number("105"));
    const review = await prepare(file(await buildXlsx([{ name: "S", sheet: broken }])));
    const outcome = review.status === "reviewed" ? review.sheets[0]?.outcome : undefined;
    expect(outcome?.ok).toBe(false);
    if (outcome && !outcome.ok) expect(outcome.issues.map((issue) => [issue.code, issue.cell])).toEqual([["does-not-reconcile", "M5"]]);
  });

  it("reports a formula cell as an issue and never evaluates it", async () => {
    const withFormula = withCell(syntheticSheet(), ROW.productA, COL.H, FORMULA);
    const review = await prepare(file(await buildXlsx([{ name: "S", sheet: withFormula }])));
    const outcome = review.status === "reviewed" ? review.sheets[0]?.outcome : undefined;
    expect(outcome && !outcome.ok && outcome.issues.map((issue) => issue.code)).toContain("formula-cell");
  });

  it("returns an empty sheet list for a spreadsheet that is not a holdings export", async () => {
    const bytes = await buildXlsx([{ name: "Budget", sheet: { rows: [[text("a"), text("b")]], date1904: false } }]);
    const review = await prepare(file(bytes));
    expect(review.status === "reviewed" && review.sheets).toEqual([]);
  });

  it("turns an unreadable file into a plain message", async () => {
    const review = await prepare(file(new TextEncoder().encode("not a spreadsheet at all")));
    expect(review.status).toBe("unreadable-file");
  });

  it("refuses an oversized file before reading it", async () => {
    let read = false;
    const review = await prepare({
      name: "big.xlsx",
      size: 100 * 1024 * 1024,
      lastModified: null,
      read: () => {
        read = true;
        return Promise.resolve(new Uint8Array());
      },
    });
    expect(review.status).toBe("unreadable-file");
    expect(read).toBe(false);
  });
});
