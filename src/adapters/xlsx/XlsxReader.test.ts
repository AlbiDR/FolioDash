import { describe, expect, it } from "vitest";
import {
  FORMULA,
  syntheticSheet,
  text,
  number,
} from "../../../tests/fixtures/SyntheticFideuramSheet";
import { type SheetInput, buildXlsx, buildZip } from "../../../tests/fixtures/SyntheticXlsx";
import { interpretFideuramSheet } from "../fideuram/FideuramLayout";
import { readXlsx } from "./XlsxReader";
import { XLSX_LIMITS } from "./XlsxError";

const encoder = new TextEncoder();
const SHEET_NAME = "Il Mio Patrimonio";

async function readOk(bytes: Uint8Array) {
  const result = await readXlsx(bytes);
  if (!result.ok) throw new Error(`expected success, got ${result.code}: ${result.message}`);
  return result.sheets;
}

async function readFailure(bytes: Uint8Array, limits = XLSX_LIMITS) {
  const result = await readXlsx(bytes, limits);
  if (result.ok) throw new Error("expected failure");
  return result;
}

const baseline: SheetInput = { name: SHEET_NAME, sheet: syntheticSheet() };

describe("reading a well-formed file", () => {
  it("returns the cells exactly as stored, including trailing spaces and number formats", async () => {
    const [sheet] = await readOk(await buildXlsx([baseline]));
    expect(sheet?.name).toBe(SHEET_NAME);
    expect(sheet?.hidden).toBe(false);
    expect(sheet?.sheet).toEqual(syntheticSheet());
  });

  it("feeds the interpreter end to end", async () => {
    const [sheet] = await readOk(await buildXlsx([baseline]));
    const result = interpretFideuramSheet(sheet?.sheet ?? { rows: [], date1904: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.statement.funds).toHaveLength(2);
      expect(result.statement.adjustments).toEqual([]);
    }
  });

  it("reads compressed parts the same as stored ones", async () => {
    const [sheet] = await readOk(await buildXlsx([baseline], { deflate: true }));
    expect(sheet?.sheet).toEqual(syntheticSheet());
  });

  it("reports hidden sheets and the 1904 date system", async () => {
    const sheets = await readOk(
      await buildXlsx(
        [baseline, { name: "Notes", sheet: { rows: [[text("hello")]], date1904: false }, hidden: true }],
        { date1904: true },
      ),
    );
    expect(sheets.map((entry) => [entry.name, entry.hidden, entry.sheet.date1904])).toEqual([
      [SHEET_NAME, false, true],
      ["Notes", true, true],
    ]);
  });

  it("flags formula cells without evaluating them", async () => {
    const sheet = { rows: [[text("a"), FORMULA, number("5", "0.00")]], date1904: false };
    const [read] = await readOk(await buildXlsx([{ name: "S", sheet }]));
    expect(read?.sheet.rows[0]).toEqual([text("a"), FORMULA, number("5", "0.00")]);
  });

  it("decodes entities, inline strings and rich-text runs", async () => {
    const sheetXml = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>R&amp;D &#65;</t></is></c><c r="B1" t="s"><v>0</v></c></row></sheetData></worksheet>`;
    const sharedStrings = `<sst><si><r><t>Rich </t></r><r><t xml:space="preserve">text </t></r><rPh><t>ignored</t></rPh></si></sst>`;
    const [read] = await readOk(
      await buildXlsx([baseline], { overrides: { "xl/worksheets/sheet1.xml": sheetXml, "xl/sharedStrings.xml": sharedStrings } }),
    );
    expect(read?.sheet.rows[0]).toEqual([text("R&D A"), text("Rich text ")]);
  });
});

describe("the file's creation time", () => {
  it("is returned as written when the file has one", async () => {
    const result = await readXlsx(await buildXlsx([baseline], { created: "2026-11-01T10:48:57Z" }));
    expect(result.ok && result.created).toBe("2026-11-01T10:48:57Z");
  });

  it("is null when the file has none, or when that part is damaged", async () => {
    const plain = await readXlsx(await buildXlsx([baseline]));
    expect(plain.ok && plain.created).toBeNull();
    const damaged = await readXlsx(
      await buildXlsx([baseline], { overrides: { "docProps/core.xml": "<a><b></a>" }, extraEntries: [] }),
    );
    expect(damaged.ok && damaged.created).toBeNull();
  });
});

describe("files that must be rejected", () => {
  it("rejects bytes that are not a zip", async () => {
    expect((await readFailure(encoder.encode("this is not a spreadsheet at all"))).code).toBe("not-a-zip");
  });

  it("rejects a truncated file", async () => {
    const bytes = await buildXlsx([baseline]);
    const result = await readFailure(bytes.slice(0, bytes.length - 40));
    expect(["not-a-zip", "corrupt"]).toContain(result.code);
  });

  it("rejects a zip that is not a workbook", async () => {
    const bytes = await buildZip([{ name: "readme.txt", data: encoder.encode("hi") }]);
    expect((await readFailure(bytes)).code).toBe("missing-part");
  });

  it("rejects macro-enabled files", async () => {
    const bytes = await buildXlsx([baseline], {
      extraEntries: [{ name: "xl/vbaProject.bin", data: encoder.encode("macro") }],
    });
    expect((await readFailure(bytes)).code).toBe("unsupported-content");
  });

  it("rejects encrypted entries", async () => {
    const bytes = await buildZip([{ name: "xl/workbook.xml", data: encoder.encode("x"), flags: 1 }]);
    expect((await readFailure(bytes)).code).toBe("unsupported-zip");
  });

  it("rejects zip64 archives", async () => {
    const bytes = await buildZip([{ name: "a", data: encoder.encode("x") }], { zip64Marker: true });
    expect((await readFailure(bytes)).code).toBe("unsupported-zip");
  });

  it("rejects duplicate part names", async () => {
    const bytes = await buildZip([
      { name: "a", data: encoder.encode("x") },
      { name: "a", data: encoder.encode("y") },
    ]);
    expect((await readFailure(bytes)).code).toBe("corrupt");
  });

  it("rejects a part whose content fails its checksum", async () => {
    const good = await buildXlsx([baseline]);
    const bad = await buildZip([
      { name: "xl/workbook.xml", data: encoder.encode("<workbook/>"), crc: 12345 },
      { name: "xl/_rels/workbook.xml.rels", data: encoder.encode("<Relationships/>") },
    ]);
    expect(good.length).toBeGreaterThan(0);
    expect((await readFailure(bad)).code).toBe("corrupt");
  });

  it("stops a zip bomb that expands past its declared size", async () => {
    const bomb = await buildZip([
      { name: "xl/workbook.xml", data: new Uint8Array(2_000_000), deflate: true, declaredSize: 100 },
      { name: "xl/_rels/workbook.xml.rels", data: encoder.encode("<Relationships/>") },
    ]);
    expect((await readFailure(bomb)).code).toBe("limit-exceeded");
  });

  it("enforces the part-count, part-size and file-size limits", async () => {
    const bytes = await buildXlsx([baseline]);
    expect((await readFailure(bytes, { ...XLSX_LIMITS, maxEntries: 2 })).code).toBe("limit-exceeded");
    expect((await readFailure(bytes, { ...XLSX_LIMITS, maxEntryBytes: 50 })).code).toBe("limit-exceeded");
    expect((await readFailure(bytes, { ...XLSX_LIMITS, maxFileBytes: 50 })).code).toBe("limit-exceeded");
  });

  it("rejects a document type declaration, so entity-expansion attacks cannot start", async () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;">]><workbook>&b;</workbook>`;
    const bytes = await buildXlsx([baseline], { overrides: { "xl/workbook.xml": bomb } });
    expect((await readFailure(bytes)).code).toBe("malformed-xml");
  });

  it("rejects undefined entities and bare ampersands", async () => {
    for (const body of ["&foo;", "a & b"]) {
      const sheetXml = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${body}</t></is></c></row></sheetData></worksheet>`;
      const bytes = await buildXlsx([baseline], { overrides: { "xl/worksheets/sheet1.xml": sheetXml } });
      expect((await readFailure(bytes)).code).toBe("malformed-xml");
    }
  });

  it("rejects XML that is nested too deeply", async () => {
    const deep = `${"<a>".repeat(100)}${"</a>".repeat(100)}`;
    const bytes = await buildXlsx([baseline], { overrides: { "xl/worksheets/sheet1.xml": deep } });
    expect((await readFailure(bytes)).code).toBe("limit-exceeded");
  });

  it("rejects mismatched tags", async () => {
    const bytes = await buildXlsx([baseline], { overrides: { "xl/worksheets/sheet1.xml": "<a><b></a></b>" } });
    expect((await readFailure(bytes)).code).toBe("malformed-xml");
  });

  it("rejects a cell that points at a missing text entry", async () => {
    const sheetXml = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>99</v></c></row></sheetData></worksheet>`;
    const bytes = await buildXlsx([baseline], { overrides: { "xl/worksheets/sheet1.xml": sheetXml } });
    expect((await readFailure(bytes)).code).toBe("corrupt");
  });

  it("enforces the row, column and cell limits", async () => {
    const bytes = await buildXlsx([baseline]);
    expect((await readFailure(bytes, { ...XLSX_LIMITS, maxRows: 5 })).code).toBe("limit-exceeded");
    expect((await readFailure(bytes, { ...XLSX_LIMITS, maxColumns: 5 })).code).toBe("limit-exceeded");
    expect((await readFailure(bytes, { ...XLSX_LIMITS, maxCells: 10 })).code).toBe("limit-exceeded");
  });
});
