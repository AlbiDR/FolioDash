import { type Grid, type GridCell, bufferedGrid, plainCell, rawCell } from "../../applications/SheetGrid";
import { type Decimal, decimalToNumber } from "../../core/Decimal";
import { toSpreadsheetSerial } from "../../core/IsoDate";
import type { RawCell, RawSheet } from "../../core/RawSheet";
import { type FundPosition, findHeader, interpretFideuramSheet } from "./FideuramLayout";
import { type Currency, type ReadResult, readDate, readMoney, readPrice, readQuantity, readRate, readRisk } from "./FideuramValues";

const DATE = "dd/mm/yyyy";
const QUANTITY = "#,##0.000";
const RATE = "0.0000";
const PERCENT = "0.00%";
const EURO = '#,##0.00" €"';

/** Column positions in the bank's holdings layout, zero-based (B = 1). */
const COLUMN = { C: 2, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12 } as const;

/** Bank column widths in pixels, from column A (an empty margin) to N (an empty margin). */
const WIDTHS = [28, 240, 91, 150, 105, 127, 59, 66, 56, 134, 103, 84, 106];

/** The one reading of a cell, or null when it has none or more than one, in which case the cell is shown as the file wrote it. */
function only<T>(result: ReadResult<T>): T | null {
  if (result.status !== "ok" || result.candidates.length !== 1) return null;
  return result.candidates[0]?.value ?? null;
}

function priceCell(value: Decimal, currency: Currency | null): GridCell {
  const symbol = currency === "EUR" ? ' "€"' : currency === "USD" ? ' "$"' : "";
  return { value: decimalToNumber(value), format: `#,##0.000${symbol}`, emphasis: null };
}

/**
 * One cell in its proper type. Where the statement as a whole was read successfully,
 * the quantity, price and rate shown for a fund are the ones that reading settled on,
 * so a month whose file stored a quantity as a time still shows the real quantity.
 */
function typed(cell: RawCell | undefined, column: number, date1904: boolean, position: FundPosition | undefined): GridCell | null {
  if (cell === undefined || cell.kind === "formula") return null;
  if (position !== undefined) {
    if (column === COLUMN.G && position.quantity !== null) return { value: decimalToNumber(position.quantity), format: QUANTITY, emphasis: null };
    if (column === COLUMN.H && position.price !== null) return priceCell(position.price, position.priceCurrency);
    if (column === COLUMN.I && position.exchangeRate !== null) return { value: decimalToNumber(position.exchangeRate), format: RATE, emphasis: null };
  }
  switch (column) {
    case COLUMN.F: {
      const date = only(readDate(cell, date1904));
      return date === null ? null : { value: toSpreadsheetSerial(date), format: DATE, emphasis: null };
    }
    case COLUMN.G: {
      const quantity = only(readQuantity(cell));
      return quantity === null ? null : { value: decimalToNumber(quantity), format: QUANTITY, emphasis: null };
    }
    case COLUMN.H:
    case COLUMN.J: {
      const price = only(readPrice(cell));
      // An average cost written without a symbol takes the currency of the fund's price.
      return price === null ? null : priceCell(price.value, price.currency ?? position?.priceCurrency ?? null);
    }
    case COLUMN.I:
    case COLUMN.K: {
      const rate = only(readRate(cell));
      return rate === null ? null : { value: decimalToNumber(rate), format: RATE, emphasis: null };
    }
    case COLUMN.L: {
      const risk = only(readRisk(cell));
      return risk === null ? null : { value: decimalToNumber(risk), format: PERCENT, emphasis: null };
    }
    case COLUMN.M: {
      const cents = only(readMoney(cell, false));
      return cents === null ? null : { value: cents / 100, format: EURO, emphasis: null };
    }
    default:
      return null;
  }
}

function isStrongRow(row: readonly (RawCell | undefined)[]): boolean {
  const category = row[COLUMN.C];
  if (category?.kind === "text" && category.text.trim() !== "") return true;
  return row.some((cell) => cell?.kind === "text" && cell.text.trim().toLowerCase() === "totale visualizzato");
}

/**
 * A Fideuram statement as a tidy tab: the same cells in the same places as the
 * bank file, but with every month typed alike (dates as dates, amounts, prices,
 * rates and risk as numbers with their own formats), the header and category rows
 * standing out, the bank's column widths, and one narrow empty margin around it.
 * A cell that cannot be read in exactly one way stays as the file wrote it. The
 * exact statement is kept in the ledger; this tab is a view of it.
 */
export function presentStatement(sheet: RawSheet): Grid {
  const header = findHeader(sheet);
  const read = interpretFideuramSheet(sheet);
  const positions = new Map((read.ok ? read.statement.funds : []).map((fund) => [fund.isin, fund] as const));
  const rows = sheet.rows.map((row, rowIndex) => {
    const strong = header !== null && rowIndex > header && isStrongRow(row);
    return row.map((cell, column): GridCell => {
      const plain = rawCell(cell);
      if (plain.value === "") return plain;
      const emphasis = header !== null && rowIndex === header ? "header" : strong ? "strong" : null;
      const isin = rawCell(row[COLUMN.E]).value;
      const position = typeof isin === "string" ? positions.get(isin.trim()) : undefined;
      const reading = header !== null && rowIndex > header ? typed(cell, column, sheet.date1904, position) : null;
      if (reading !== null) return { ...reading, emphasis };
      return emphasis === null ? plain : plainCell(plain.value, emphasis);
    });
  });
  return bufferedGrid(rows, WIDTHS);
}
