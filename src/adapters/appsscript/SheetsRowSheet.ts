import type { LedgerRow, RowSheet } from "../ledger/RowLedgerStore";

/** The slice of the Apps Script spreadsheet API this adapter uses, so it can be tested without Google. */
export interface RangeLike {
  getValues(): unknown[][];
  setValues(values: string[][]): unknown;
  setNumberFormat(format: string): unknown;
}

export interface SheetLike {
  getLastRow(): number;
  getMaxRows(): number;
  insertRowsAfter(afterPosition: number, howMany: number): unknown;
  getRange(row: number, column: number, rows: number, columns: number): RangeLike;
  hideSheet(): unknown;
}

export interface SpreadsheetLike {
  getSheetByName(name: string): SheetLike | null;
  insertSheet(name: string): SheetLike;
}

export const LEDGER_TAB = "_FolioDash ledger";
const HEADER: readonly string[] = ["revision", "type", "payload", "checksum"];
const COLUMNS = HEADER.length;
const TYPES = new Set<string>(["META", "SNAPSHOT", "TIMELINE", "COMMIT"]);

/**
 * Stores ledger rows in a hidden tab of a Google spreadsheet. Every cell is
 * written as plain text (format `@`) before its value, so Sheets cannot turn a
 * date-looking or number-looking record into something else.
 */
export class SheetsRowSheet implements RowSheet {
  private readonly sheet: SheetLike;
  private readonly flushAll: () => void;

  constructor(spreadsheet: SpreadsheetLike, flushAll: () => void, tabName: string = LEDGER_TAB) {
    this.flushAll = flushAll;
    const existing = spreadsheet.getSheetByName(tabName);
    if (existing === null) {
      const created = spreadsheet.insertSheet(tabName);
      const header = created.getRange(1, 1, 1, COLUMNS);
      header.setNumberFormat("@");
      header.setValues([[...HEADER]]);
      created.hideSheet();
      this.sheet = created;
    } else {
      this.sheet = existing;
      const header = existing.getRange(1, 1, 1, COLUMNS).getValues()[0] ?? [];
      if (header.map(String).join("|") !== HEADER.join("|")) {
        throw new Error(`The tab ${tabName} exists but is not a FolioDash ledger. It was not changed.`);
      }
    }
  }

  readRows(): readonly LedgerRow[] {
    const last = this.sheet.getLastRow();
    if (last <= 1) return [];
    return this.sheet
      .getRange(2, 1, last - 1, COLUMNS)
      .getValues()
      .map((cells) => {
        const [revision, type, payload, checksum] = cells.map((cell) => (typeof cell === "string" ? cell : String(cell)));
        return {
          revision: revision ?? "",
          // An unknown type is kept as is so the store reports the ledger as damaged instead of hiding it.
          type: (TYPES.has(type ?? "") ? type : "UNKNOWN") as LedgerRow["type"],
          payload: payload ?? "",
          checksum: checksum ?? "",
        };
      });
  }

  appendRows(rows: readonly LedgerRow[]): void {
    if (rows.length === 0) return;
    const start = this.sheet.getLastRow() + 1;
    const needed = start + rows.length - 1;
    const capacity = this.sheet.getMaxRows();
    if (needed > capacity) this.sheet.insertRowsAfter(capacity, needed - capacity);
    const range = this.sheet.getRange(start, 1, rows.length, COLUMNS);
    range.setNumberFormat("@");
    range.setValues(rows.map((row) => [row.revision, row.type, row.payload, row.checksum]));
  }

  flush(): void {
    this.flushAll();
  }
}
