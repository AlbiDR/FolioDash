/**
 * One cell exactly as stored in the file, before any interpretation.
 * `number` keeps the file's own decimal text, never a binary float, and the
 * cell's display format code (needed to recognise a time-formatted quantity).
 */
export type RawCell =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "number"; readonly text: string; readonly format: string | null }
  | { readonly kind: "formula" };

/** Rows and columns are zero-based: `rows[0][0]` is cell A1. */
export interface RawSheet {
  readonly rows: readonly (readonly (RawCell | undefined)[])[];
  readonly date1904: boolean;
}

export function columnLetter(column: number): string {
  return String.fromCharCode(65 + column);
}

/** A1-style reference for a zero-based row and column. */
export function cellRef(row: number, column: number): string {
  return `${columnLetter(column)}${String(row + 1)}`;
}

export function cellAt(sheet: RawSheet, row: number, column: number): RawCell | undefined {
  return sheet.rows[row]?.[column];
}

/** A sheet as written to storage: JSON has no "undefined", so an empty cell is `null`. */
export interface StoredSheet {
  readonly rows: readonly (readonly (RawCell | null)[])[];
  readonly date1904: boolean;
}

const MAX_ROWS = 2000;
const MAX_COLUMNS = 64;
const MAX_TEXT = 5000;

/** Turns a sheet into plain JSON data, with `null` for an empty cell, so it can be stored and checksummed. */
export function toStoredSheet(sheet: RawSheet): StoredSheet {
  return { rows: sheet.rows.map((row) => row.map((cell) => cell ?? null)), date1904: sheet.date1904 };
}

function parseCell(value: unknown): RawCell | undefined | "invalid" {
  if (value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";
  const cell = value as Record<string, unknown>;
  if (cell["kind"] === "formula") return { kind: "formula" };
  if (cell["kind"] === "text" && typeof cell["text"] === "string" && cell["text"].length <= MAX_TEXT) return { kind: "text", text: cell["text"] };
  if (
    cell["kind"] === "number" &&
    typeof cell["text"] === "string" &&
    cell["text"].length <= MAX_TEXT &&
    (cell["format"] === null || (typeof cell["format"] === "string" && cell["format"].length <= MAX_TEXT))
  ) {
    return { kind: "number", text: cell["text"], format: cell["format"] };
  }
  return "invalid";
}

/**
 * Reads a stored sheet back. Anything stored or sent from outside is untrusted:
 * the shape, the sizes and every cell are checked, and anything else is refused.
 */
export function parseStoredSheet(value: unknown): RawSheet | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  if (typeof stored["date1904"] !== "boolean" || !Array.isArray(stored["rows"]) || stored["rows"].length > MAX_ROWS) return null;
  const rows: (RawCell | undefined)[][] = [];
  for (const line of stored["rows"] as unknown[]) {
    if (!Array.isArray(line) || line.length > MAX_COLUMNS) return null;
    const row: (RawCell | undefined)[] = [];
    for (const entry of line as unknown[]) {
      const cell = parseCell(entry);
      if (cell === "invalid") return null;
      row.push(cell);
    }
    rows.push(row);
  }
  return { rows, date1904: stored["date1904"] };
}
