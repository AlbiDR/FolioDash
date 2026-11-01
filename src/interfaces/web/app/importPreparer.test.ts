import { describe, expect, it } from "vitest";
import { FORMULA, ROW, COL, number, syntheticSheet, text, withCell } from "../../../../tests/fixtures/SyntheticFideuramSheet";
import { buildXlsx } from "../../../../tests/fixtures/SyntheticXlsx";
import { type IsoDate, toIsoDate } from "../../../core/IsoDate";
import type { ImportFile } from "../features/import/ImportModel";
import { createImportPreparer } from "./importPreparer";

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
