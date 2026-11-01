import type { RawCell, RawSheet } from "../../src/core/RawSheet";
import { crc32 } from "../../src/adapters/xlsx/Zip";

/** Builds invented .xlsx files (and deliberately broken ones) for tests. Nothing here is real data. */

const encoder = new TextEncoder();

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  void writer.write(new Uint8Array(data)).then(() => writer.close());
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) chunks.push(value);
  }
  return concat(chunks);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export interface ZipEntryInput {
  readonly name: string;
  readonly data: Uint8Array;
  readonly deflate?: boolean;
  readonly flags?: number;
  readonly crc?: number;
  readonly declaredSize?: number;
}

export interface ZipOptions {
  /** Writes the zip64 marker into the end-of-directory record. */
  readonly zip64Marker?: boolean;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

export async function buildZip(entries: readonly ZipEntryInput[], options: ZipOptions = {}): Promise<Uint8Array> {
  const body: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const stored = entry.deflate === true ? await deflateRaw(entry.data) : entry.data;
    const method = entry.deflate === true ? 8 : 0;
    const crc = entry.crc ?? crc32(entry.data);
    const size = entry.declaredSize ?? entry.data.length;
    const flags = entry.flags ?? 0;
    body.push(
      u32(0x04034b50), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(stored.length), u32(size),
      u16(name.length), u16(0), name, stored,
    );
    directory.push(
      u32(0x02014b50), u16(20), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(stored.length), u32(size),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    );
    offset += 30 + name.length + stored.length;
  }
  const directoryBytes = concat(directory);
  const count = options.zip64Marker === true ? 0xffff : entries.length;
  return concat([
    ...body,
    directoryBytes,
    u32(0x06054b50), u16(0), u16(0), u16(count), u16(count), u32(directoryBytes.length), u32(offset), u16(0),
  ]);
}

function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function columnLetters(index: number): string {
  return String.fromCharCode(65 + index);
}

export interface SheetInput {
  readonly name: string;
  readonly sheet: RawSheet;
  readonly hidden?: boolean;
}

export interface XlsxOptions {
  readonly deflate?: boolean;
  readonly date1904?: boolean;
  /** Creation time to write into docProps/core.xml, as the bank file does. */
  readonly created?: string;
  /** Replaces a generated part's text, for building malformed files. */
  readonly overrides?: Readonly<Record<string, string>>;
  readonly extraEntries?: readonly ZipEntryInput[];
}

export async function buildXlsx(sheets: readonly SheetInput[], options: XlsxOptions = {}): Promise<Uint8Array> {
  const strings: string[] = [];
  const formats: string[] = [];
  const stringIndex = (text: string): number => {
    const existing = strings.indexOf(text);
    if (existing !== -1) return existing;
    strings.push(text);
    return strings.length - 1;
  };
  const styleIndex = (format: string): number => {
    const existing = formats.indexOf(format);
    if (existing !== -1) return existing + 1;
    formats.push(format);
    return formats.length;
  };

  const sheetXml = sheets.map(({ sheet }) => {
    const rows = sheet.rows.map((cells, rowIndex) => {
      const rendered = cells.flatMap((cell: RawCell | undefined, column) => {
        if (cell === undefined) return [];
        const ref = `${columnLetters(column)}${String(rowIndex + 1)}`;
        if (cell.kind === "formula") return [`<c r="${ref}"><f>1+1</f><v>0</v></c>`];
        if (cell.kind === "text") return [`<c r="${ref}" t="s"><v>${String(stringIndex(cell.text))}</v></c>`];
        const style = cell.format === null ? "" : ` s="${String(styleIndex(cell.format))}"`;
        return [`<c r="${ref}"${style}><v>${cell.text}</v></c>`];
      });
      return rendered.length === 0 ? "" : `<row r="${String(rowIndex + 1)}">${rendered.join("")}</row>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`;
  });

  const parts: Record<string, string> = {
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr${options.date1904 === true ? ' date1904="1"' : ""}/><sheets>${sheets
      .map(
        (entry, index) =>
          `<sheet name="${escapeXml(entry.name)}" sheetId="${String(index + 1)}"${entry.hidden === true ? ' state="hidden"' : ""} r:id="rId${String(index + 1)}"/>`,
      )
      .join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_entry, index) =>
          `<Relationship Id="rId${String(index + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(index + 1)}.xml"/>`,
      )
      .join("")}</Relationships>`,
  };
  sheetXml.forEach((xml, index) => {
    parts[`xl/worksheets/sheet${String(index + 1)}.xml`] = xml;
  });
  parts["xl/sharedStrings.xml"] =
    `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings
      .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
      .join("")}</sst>`;
  parts["xl/styles.xml"] =
    `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts>${formats
      .map((format, index) => `<numFmt numFmtId="${String(164 + index)}" formatCode="${escapeXml(format)}"/>`)
      .join("")}</numFmts><cellXfs><xf numFmtId="0"/>${formats
      .map((_format, index) => `<xf numFmtId="${String(164 + index)}"/>`)
      .join("")}</cellXfs></styleSheet>`;

  if (options.created !== undefined) {
    parts["docProps/core.xml"] =
      `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dcterms="http://purl.org/dc/terms/"><dcterms:created>${escapeXml(options.created)}</dcterms:created></cp:coreProperties>`;
  }

  for (const [name, text] of Object.entries(options.overrides ?? {})) parts[name] = text;
  const entries: ZipEntryInput[] = Object.entries(parts).map(([name, text]) => ({
    name,
    data: encoder.encode(text),
    deflate: options.deflate === true,
  }));
  return buildZip([...entries, ...(options.extraEntries ?? [])]);
}
