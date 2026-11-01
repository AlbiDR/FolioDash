import type { RawCell, RawSheet } from "../../core/RawSheet";
import { type XlsxLimits, XLSX_LIMITS, XlsxError, type XlsxErrorCode } from "./XlsxError";
import { type XmlElement, childElements, firstChild, parseXml, textOf } from "./Xml";
import { type ZipArchive, openZip } from "./Zip";

export interface XlsxSheet {
  readonly name: string;
  readonly hidden: boolean;
  readonly sheet: RawSheet;
}

export type ReadXlsxResult =
  | { readonly ok: true; readonly sheets: readonly XlsxSheet[] }
  | { readonly ok: false; readonly code: XlsxErrorCode; readonly message: string };

const WORKBOOK = "xl/workbook.xml";
const WORKBOOK_RELATIONSHIPS = "xl/_rels/workbook.xml.rels";
const SHARED_STRINGS = "xl/sharedStrings.xml";
const STYLES = "xl/styles.xml";
const MACRO_PART = "xl/vbaProject.bin";

// Display formats the file may reference by number without defining them.
const BUILTIN_FORMATS: Readonly<Record<number, string>> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mm:ss.0",
};

async function readText(archive: ZipArchive, name: string): Promise<string> {
  return new TextDecoder("utf-8").decode(await archive.read(name));
}

async function readXml(archive: ZipArchive, name: string, limits: XlsxLimits): Promise<XmlElement> {
  return parseXml(await readText(archive, name), limits);
}

function resolveTarget(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = ["xl"];
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== "." && segment !== "") parts.push(segment);
  }
  return parts.join("/");
}

/** All visible text of a shared-string item, joining rich-text runs and skipping phonetic hints. */
function stringItemText(item: XmlElement): string {
  let text = "";
  for (const child of childElements(item)) {
    if (child.name === "t") text += textOf(child);
    else if (child.name === "r") {
      for (const run of childElements(child, "t")) text += textOf(run);
    }
  }
  return text;
}

async function readSharedStrings(archive: ZipArchive, limits: XlsxLimits): Promise<string[]> {
  if (!archive.names.includes(SHARED_STRINGS)) return [];
  const root = await readXml(archive, SHARED_STRINGS, limits);
  return childElements(root, "si").map(stringItemText);
}

async function readCellFormats(archive: ZipArchive, limits: XlsxLimits): Promise<(string | null)[]> {
  if (!archive.names.includes(STYLES)) return [];
  const root = await readXml(archive, STYLES, limits);
  const custom = new Map<number, string>();
  const numFmts = firstChild(root, "numFmts");
  for (const entry of numFmts ? childElements(numFmts, "numFmt") : []) {
    custom.set(Number(entry.attrs["numFmtId"]), entry.attrs["formatCode"] ?? "");
  }
  const cellXfs = firstChild(root, "cellXfs");
  return (cellXfs ? childElements(cellXfs, "xf") : []).map((xf) => {
    const id = Number(xf.attrs["numFmtId"] ?? "0");
    return custom.get(id) ?? BUILTIN_FORMATS[id] ?? null;
  });
}

function columnIndex(letters: string): number {
  let index = 0;
  for (const character of letters) index = index * 26 + (character.charCodeAt(0) - 64);
  return index - 1;
}

function parseSheet(
  root: XmlElement,
  strings: readonly string[],
  formats: readonly (string | null)[],
  date1904: boolean,
  limits: XlsxLimits,
): RawSheet {
  const sheetData = firstChild(root, "sheetData");
  const cells = new Map<number, Map<number, RawCell>>();
  let count = 0;
  let maxRow = -1;
  let maxColumn = -1;
  let rowIndex = -1;
  for (const row of sheetData ? childElements(sheetData, "row") : []) {
    rowIndex = row.attrs["r"] !== undefined ? Number(row.attrs["r"]) - 1 : rowIndex + 1;
    if (!Number.isInteger(rowIndex) || rowIndex < 0) throw new XlsxError("corrupt", "A sheet has an invalid row number.");
    if (rowIndex >= limits.maxRows) throw new XlsxError("limit-exceeded", "A sheet has more rows than supported.");
    let columnCursor = -1;
    for (const cell of childElements(row, "c")) {
      const reference = /^([A-Z]+)(\d+)$/u.exec(cell.attrs["r"] ?? "");
      const column = reference ? columnIndex(reference[1] ?? "") : columnCursor + 1;
      columnCursor = column;
      if (column < 0 || column >= limits.maxColumns) {
        throw new XlsxError("limit-exceeded", "A sheet has more columns than supported.");
      }
      const parsed = parseCell(cell, strings, formats);
      if (parsed === undefined) continue;
      count++;
      if (count > limits.maxCells) throw new XlsxError("limit-exceeded", "A sheet has more cells than supported.");
      let rowCells = cells.get(rowIndex);
      if (rowCells === undefined) {
        rowCells = new Map();
        cells.set(rowIndex, rowCells);
      }
      rowCells.set(column, parsed);
      maxRow = Math.max(maxRow, rowIndex);
      maxColumn = Math.max(maxColumn, column);
    }
  }
  const rows: (RawCell | undefined)[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const line: (RawCell | undefined)[] = Array.from({ length: maxColumn + 1 }, () => undefined);
    for (const [column, cell] of cells.get(r) ?? []) line[column] = cell;
    rows.push(line);
  }
  return { rows, date1904 };
}

function parseCell(
  cell: XmlElement,
  strings: readonly string[],
  formats: readonly (string | null)[],
): RawCell | undefined {
  if (firstChild(cell, "f") !== undefined) return { kind: "formula" };
  const type = cell.attrs["t"] ?? "n";
  if (type === "inlineStr") {
    const inline = firstChild(cell, "is");
    return { kind: "text", text: inline ? stringItemText(inline) : "" };
  }
  const valueElement = firstChild(cell, "v");
  if (valueElement === undefined) return undefined;
  const value = textOf(valueElement);
  switch (type) {
    case "s": {
      const text = strings[Number(value)];
      if (text === undefined) throw new XlsxError("corrupt", "A cell refers to a text entry that does not exist.");
      return { kind: "text", text };
    }
    case "str":
    case "d":
    case "e":
      return { kind: "text", text: value };
    case "b":
      return { kind: "text", text: value === "1" ? "TRUE" : "FALSE" };
    default: {
      const style = cell.attrs["s"];
      const format = style === undefined ? null : (formats[Number(style)] ?? null);
      return { kind: "number", text: value.trim(), format: format === "General" ? null : format };
    }
  }
}

/**
 * Reads every sheet of an .xlsx file held in memory. Nothing is executed:
 * formulas are reported as formula cells and never evaluated, macros make the
 * file unsupported, and size, depth and cell counts are bounded.
 */
export async function readXlsx(bytes: Uint8Array, limits: XlsxLimits = XLSX_LIMITS): Promise<ReadXlsxResult> {
  try {
    const archive = openZip(bytes, limits);
    if (archive.names.includes(MACRO_PART)) {
      throw new XlsxError("unsupported-content", "Files containing macros are not supported.");
    }
    if (!archive.names.includes(WORKBOOK) || !archive.names.includes(WORKBOOK_RELATIONSHIPS)) {
      throw new XlsxError("missing-part", "The file is not a spreadsheet workbook.");
    }
    const workbook = await readXml(archive, WORKBOOK, limits);
    const relationships = await readXml(archive, WORKBOOK_RELATIONSHIPS, limits);
    const targets = new Map(
      childElements(relationships, "Relationship").map((entry) => [entry.attrs["Id"] ?? "", entry.attrs["Target"] ?? ""]),
    );
    const properties = firstChild(workbook, "workbookPr");
    const date1904 = ["1", "true"].includes(properties?.attrs["date1904"] ?? "");
    const strings = await readSharedStrings(archive, limits);
    const formats = await readCellFormats(archive, limits);

    const sheets: XlsxSheet[] = [];
    const sheetList = firstChild(workbook, "sheets");
    for (const entry of sheetList ? childElements(sheetList, "sheet") : []) {
      const target = targets.get(entry.attrs["id"] ?? "");
      if (target === undefined) throw new XlsxError("missing-part", "A sheet has no matching part in the file.");
      const root = await readXml(archive, resolveTarget(target), limits);
      sheets.push({
        name: entry.attrs["name"] ?? "",
        hidden: (entry.attrs["state"] ?? "visible") !== "visible",
        sheet: parseSheet(root, strings, formats, date1904, limits),
      });
    }
    return { ok: true, sheets };
  } catch (error) {
    if (error instanceof XlsxError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}
