import { describe, expect, it } from "vitest";
import { RowLedgerStore, type LedgerRow } from "../ledger/RowLedgerStore";
import { type RangeLike, type SheetLike, type SpreadsheetLike, SheetsRowSheet } from "./SheetsRowSheet";

/**
 * A fake spreadsheet that behaves like Sheets in the way that matters here: a
 * cell not formatted as plain text is retyped (digits become numbers, ISO dates
 * become dates), and writing past the last row fails.
 */
class FakeSheet implements SheetLike {
  grid: unknown[][] = [];
  textFormatted = new Set<string>();
  maxRows = 3;
  hidden = false;

  getLastRow(): number {
    let last = 0;
    this.grid.forEach((row, index) => {
      if (row.some((cell) => cell !== "" && cell !== undefined)) last = index + 1;
    });
    return last;
  }

  getMaxRows(): number {
    return this.maxRows;
  }

  insertRowsAfter(afterPosition: number, howMany: number): void {
    expect(afterPosition).toBe(this.maxRows);
    this.maxRows += howMany;
  }

  hideSheet(): void {
    this.hidden = true;
  }

  getRange(row: number, column: number, rows: number, columns: number): RangeLike {
    return {
      getValues: () => Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => this.grid[row - 1 + r]?.[column - 1 + c] ?? "")),
      setNumberFormat: (format: string) => {
        for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
          const key = `${String(row + r)}:${String(column + c)}`;
          if (format === "@") this.textFormatted.add(key); else this.textFormatted.delete(key);
        }
      },
      setValues: (values: string[][]) => {
        if (row + rows - 1 > this.maxRows) throw new Error("range is out of bounds");
        values.forEach((line, r) => {
          line.forEach((value, c) => {
            const key = `${String(row + r)}:${String(column + c)}`;
            const target = (this.grid[row - 1 + r] ??= []);
            target[column - 1 + c] = this.textFormatted.has(key) ? value : /^\d+(\.\d+)?$/u.test(value) ? Number(value) : value;
          });
        });
      },
    };
  }
}

class FakeSpreadsheet implements SpreadsheetLike {
  sheets = new Map<string, FakeSheet>();
  getSheetByName(name: string): SheetLike | null {
    return this.sheets.get(name) ?? null;
  }
  insertSheet(name: string): SheetLike {
    const sheet = new FakeSheet();
    this.sheets.set(name, sheet);
    return sheet;
  }
}

function row(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return { revision: "rev", type: "META", payload: "{}", checksum: "abc", ...overrides };
}

describe("SheetsRowSheet", () => {
  it("creates a hidden ledger tab with a plain-text header", () => {
    const spreadsheet = new FakeSpreadsheet();
    new SheetsRowSheet(spreadsheet, () => undefined, "ledger");
    const tab = spreadsheet.sheets.get("ledger");
    expect(tab?.hidden).toBe(true);
    expect(tab?.grid[0]).toEqual(["revision", "type", "payload", "checksum"]);
    expect(tab?.textFormatted.has("1:1")).toBe(true);
  });

  it("returns exactly the text it was given, even when a value looks like a number", () => {
    const spreadsheet = new FakeSpreadsheet();
    const sheet = new SheetsRowSheet(spreadsheet, () => undefined, "ledger");
    const rows = [row({ revision: "20260101", checksum: "0123456789", payload: "2026-01-15" }), row({ type: "COMMIT", revision: "12345678" })];
    sheet.appendRows(rows);
    expect(sheet.readRows()).toEqual(rows);
  });

  it("grows the tab before writing past its last row", () => {
    const spreadsheet = new FakeSpreadsheet();
    const sheet = new SheetsRowSheet(spreadsheet, () => undefined, "ledger");
    sheet.appendRows(Array.from({ length: 10 }, (_, index) => row({ payload: String(index) })));
    expect(sheet.readRows()).toHaveLength(10);
    expect(spreadsheet.sheets.get("ledger")?.maxRows).toBeGreaterThanOrEqual(11);
  });

  it("refuses a tab with that name that is not a ledger, and leaves it alone", () => {
    const spreadsheet = new FakeSpreadsheet();
    const other = spreadsheet.insertSheet("ledger") as FakeSheet;
    other.grid = [["Date", "Amount"]];
    expect(() => new SheetsRowSheet(spreadsheet, () => undefined, "ledger")).toThrow();
    expect(other.grid).toEqual([["Date", "Amount"]]);
  });

  it("calls the flush it was given", () => {
    let flushed = 0;
    new SheetsRowSheet(
      new FakeSpreadsheet(),
      () => {
        flushed++;
      },
      "ledger",
    ).flush();
    expect(flushed).toBe(1);
  });

  it("lets the store report an unknown record type as damage instead of hiding it", () => {
    const spreadsheet = new FakeSpreadsheet();
    const sheet = new SheetsRowSheet(spreadsheet, () => undefined, "ledger");
    sheet.appendRows([row({ type: "BOGUS" as LedgerRow["type"] })]);
    expect(sheet.readRows()[0]?.type).toBe("UNKNOWN");
    expect(new RowLedgerStore(sheet).load().status).toBe("ok"); // no commit record yet: ignored as trailing
  });
});
