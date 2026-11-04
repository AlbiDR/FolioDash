import { describe, expect, it, vi } from "vitest";
import { dateInSheetName, EXCEL_HISTORY_LIMITS, planExcelHistory, prepareExcelHistory } from "./ExcelHistory";
import type { ImportFile, ImportPreparer, ImportReview } from "./ImportModel";
import { EMPTY_LEDGER } from "../core/Ledger";
import { date, twoSavedMonths } from "../../tests/fixtures/SavedMonths";
import { syntheticSheet } from "../../tests/fixtures/SyntheticFideuramSheet";
import { interpretFideuramSheet } from "../adapters/fideuram/FideuramLayout";

const interpreted = interpretFideuramSheet(syntheticSheet());
if (!interpreted.ok) throw new Error("Invalid synthetic fixture");
const sheet = { name: "Bank", raw: syntheticSheet(), outcome: { ok: true as const, statement: interpreted.statement } };
const file = (name: string): ImportFile => ({ name, size: 1, lastModified: null, read: () => Promise.resolve(new Uint8Array()) });
const review: ImportReview = { status: "reviewed", sheets: [sheet], dateCandidate: { date: date("2026-03-31"), source: "file-created" } };
const prepare: ImportPreparer = () => Promise.resolve(review);

describe("sheet dates", () => {
  it.each([
    ["Bank 2026-03-31", "2026-03-31"], ["31-03-2026", "2026-03-31"], ["31.03.2026", "2026-03-31"],
    ["2026-02-30", null], ["March 2026", null], ["2026-03", null],
    ["2026-03-31 to 2026-04-30", null], ["2026-03-31 and 31-03-2026", null],
  ])("proposes a date only for one unambiguous full date in %s", (name, expected) => {
    expect(dateInSheetName(name)).toBe(expected);
  });
});

describe("Excel history preparation", () => {
  it("keeps the original sheet and independent file dates for multiple bank exports", async () => {
    const result = await prepareExcelHistory([file("january.xlsx"), file("march.xlsx")], (input) => Promise.resolve({ ...review, dateCandidate: { date: date(input.name === "january.xlsx" ? "2026-01-31" : "2026-03-31"), source: "file-created" } }));
    expect(result.problems).toEqual([]);
    expect(result.entries.map((entry) => entry.date)).toEqual(["2026-01-31", "2026-03-31"]);
    expect(result.entries[0]?.sheet.raw).toBe(sheet.raw);
    expect(new Set(result.entries.map((entry) => entry.id)).size).toBe(2);
  });

  it("never dates combined sheets from the container metadata", async () => {
    const result = await prepareExcelHistory([file("history.xlsx")], () => Promise.resolve({ ...review, sheets: [{ ...sheet, name: "March", dateCandidate: date("2026-03-31") }, { ...sheet, name: "April" }] }));
    expect(result.entries.map((entry) => entry.date)).toEqual(["2026-03-31", ""]);
  });

  it("does not substitute the container date when other sheets are unrecognized", async () => {
    const result = await prepareExcelHistory([file("combined.xlsx")], () => Promise.resolve({ ...review, workbookSheetCount: 2, ignoredSheets: ["Unrecognized"] }));
    expect(result.entries[0]?.date).toBe("");
    expect(result.notices[0]).toContain("Unrecognized");
  });

  it("reports unreadable, unsupported and thrown file failures without hiding valid files", async () => {
    const result = await prepareExcelHistory([file("bad.xlsx"), file("notes.xlsx"), file("throws.xlsx"), file("good.xlsx")], (input) => {
      if (input.name === "bad.xlsx") return Promise.resolve({ status: "unreadable-file", message: "Invalid ZIP" });
      if (input.name === "notes.xlsx") return Promise.resolve({ ...review, sheets: [] });
      if (input.name === "throws.xlsx") throw new Error("private implementation detail");
      return Promise.resolve(review);
    });
    expect(result.entries).toHaveLength(1);
    expect(result.problems).toHaveLength(3);
    expect(result.problems.join(" ")).not.toContain("private implementation detail");
  });

  it("bounds files and total compressed bytes before parsing", async () => {
    const spy = vi.fn(prepare);
    expect((await prepareExcelHistory(Array.from({ length: 241 }, () => file("x.xlsx")), spy)).entries).toEqual([]);
    expect((await prepareExcelHistory([{ ...file("big.xlsx"), size: EXCEL_HISTORY_LIMITS.bytes + 1 }], spy)).problems).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects an oversized sheet selection as a whole", async () => {
    const result = await prepareExcelHistory([file("many.xlsx")], () => Promise.resolve({ ...review, sheets: Array.from({ length: 241 }, () => sheet) }));
    expect(result.entries).toEqual([]);
    expect(result.problems).toHaveLength(1);
  });

  it("bounds the total retained cells across multiple files", async () => {
    const huge = { ...sheet, raw: { ...sheet.raw, rows: Array.from({ length: 5001 }, () => Array.from({ length: 60 }, () => undefined)) } };
    const result = await prepareExcelHistory([file("large.xlsx")], () => Promise.resolve({ ...review, sheets: [huge] }));
    expect(result.entries).toEqual([]);
    expect(result.problems[0]).toContain("300,000 cells");
  });
});

describe("Excel history preflight", () => {
  it("orders statements by confirmed date, preserving gaps and source sheets", async () => {
    const result = await prepareExcelHistory([file("x.xlsx"), file("y.xlsx")], prepare);
    const entries = result.entries.map((entry, index) => ({ ...entry, date: index === 0 ? "2026-06-30" : "2026-03-31" }));
    const plan = planExcelHistory(entries, EMPTY_LEDGER);
    expect(plan.ok && plan.entries.map((entry) => entry.date)).toEqual(["2026-03-31", "2026-06-30"]);
  });

  it("blocks duplicates, missing dates, invalid sheets and dates already in the ledger", async () => {
    const { entries } = await prepareExcelHistory([file("x.xlsx"), file("y.xlsx")], prepare);
    expect(planExcelHistory(entries, EMPTY_LEDGER).ok).toBe(false);
    expect(planExcelHistory(entries.map((entry) => ({ ...entry, date: "" })), EMPTY_LEDGER).ok).toBe(false);
    const invalid = entries.map((entry) => ({ ...entry, sheet: { ...entry.sheet, outcome: { ok: false as const, issues: [{ code: "does-not-reconcile", cell: "M5", message: "Mismatch" }] } } }));
    expect(planExcelHistory(invalid.slice(0, 1), EMPTY_LEDGER).ok).toBe(false);
    expect(planExcelHistory(entries.slice(0, 1).map((entry) => ({ ...entry, date: "2026-02-28" })), twoSavedMonths().ledger).ok).toBe(false);
  });

  it("requires explicit exclusion and at least one selected statement", async () => {
    const { entries } = await prepareExcelHistory([file("x.xlsx"), file("duplicate.xlsx")], prepare);
    expect(planExcelHistory(entries.map((entry, index) => ({ ...entry, selected: index === 0 })), EMPTY_LEDGER).ok).toBe(true);
    expect(planExcelHistory(entries.map((entry) => ({ ...entry, selected: false })), EMPTY_LEDGER).ok).toBe(false);
  });

  it("applies the kernel's existing monthly rule before asking any cash questions", async () => {
    const { entries } = await prepareExcelHistory([file("x.xlsx"), file("y.xlsx")], prepare);
    const sameMonth = entries.map((entry, index) => ({ ...entry, date: index === 0 ? "2026-03-01" : "2026-03-31" }));
    expect(planExcelHistory(sameMonth, EMPTY_LEDGER).ok).toBe(false);
    const alreadyRecordedMonth = entries.slice(0, 1).map((entry) => ({ ...entry, date: "2026-02-28" }));
    expect(planExcelHistory(alreadyRecordedMonth, twoSavedMonths().ledger).ok).toBe(false);
  });
});
