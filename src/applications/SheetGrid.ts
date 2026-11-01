import type { RawCell, RawSheet } from "../core/RawSheet";

export type Emphasis = "header" | "strong" | null;

/** One cell of a tab FolioDash writes: the value, how it is shown, and whether it stands out. */
export interface GridCell {
  readonly value: string | number;
  /** A spreadsheet number format such as `dd/mm/yyyy`, or null for the default. */
  readonly format: string | null;
  readonly emphasis: Emphasis;
}

/** A finished tab: every row the same length, with the one-cell margin already around the data. */
export interface Grid {
  readonly cells: readonly (readonly GridCell[])[];
  /** Column widths in pixels. */
  readonly widths: readonly number[];
}

export const EMPTY_CELL: GridCell = { value: "", format: null, emphasis: null };
export const BUFFER_WIDTH = 28;
const DEFAULT_WIDTH = 108;

export function plainCell(value: string | number, emphasis: Emphasis = null): GridCell {
  return { value, format: null, emphasis };
}

/**
 * A bank cell as the file wrote it: text stays text, and a number is written as a
 * number only when that loses nothing. Used when no bank-specific reading applies.
 */
export function rawCell(cell: RawCell | undefined): GridCell {
  if (cell === undefined || cell.kind === "formula") return EMPTY_CELL;
  if (cell.kind === "text") return plainCell(cell.text);
  const value = Number(cell.text);
  return plainCell(Number.isFinite(value) && String(value) === cell.text ? value : cell.text);
}

export function rawGrid(sheet: RawSheet): Grid {
  return bufferedGrid(sheet.rows.map((row) => row.map(rawCell)));
}

const isEmpty = (cell: GridCell | undefined): boolean => cell === undefined || cell.value === "";

/**
 * Fits rows to their data and leaves exactly one empty row and column around it:
 * trailing empty rows and columns are dropped, an empty first row and first column
 * are added when the data touches the edge, and one more of each closes the far
 * sides. The buffer columns are narrow. Nothing else is kept, so tabs stay lean.
 */
export function bufferedGrid(rows: readonly (readonly (GridCell | undefined)[])[], widths: readonly number[] = []): Grid {
  let lastRow = -1;
  let lastColumn = -1;
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (isEmpty(cell)) return;
      lastRow = Math.max(lastRow, rowIndex);
      lastColumn = Math.max(lastColumn, columnIndex);
    });
  });
  const used = rows.slice(0, lastRow + 1);
  const topTouches = used[0]?.some((cell) => !isEmpty(cell)) ?? false;
  const leftTouches = used.some((row) => !isEmpty(row[0]));
  const shiftRows = topTouches ? 1 : 0;
  const shiftColumns = leftTouches ? 1 : 0;
  const rowCount = Math.max(lastRow + 1, 0) + shiftRows + 1;
  const columnCount = Math.max(lastColumn + 1, 0) + shiftColumns + 1;

  const cells = Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex): GridCell => {
      const cell = used[rowIndex - shiftRows]?.[columnIndex - shiftColumns];
      return isEmpty(cell) || cell === undefined ? EMPTY_CELL : cell;
    }),
  );
  const columnWidths = Array.from({ length: columnCount }, (_, columnIndex) => {
    if (columnIndex === 0 || columnIndex === columnCount - 1) return BUFFER_WIDTH;
    return widths[columnIndex - shiftColumns] ?? DEFAULT_WIDTH;
  });
  return { cells, widths: columnWidths };
}
