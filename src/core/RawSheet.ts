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
