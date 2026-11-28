import type { Grid, GridCell } from "../../../applications/ledger/sheet-grid";
import { EXPENSE_VIEW_TITLE, LEDGER_TAB, VIEW_TAB } from "../sheets-layout";
import type { TabInfo } from "./tabs";

const NAVY = { red: 0.12, green: 0.2, blue: 0.34 };
const BLUE = { red: 0.24, green: 0.46, blue: 0.72 };
const TEAL = { red: 0.12, green: 0.49, blue: 0.47 };
const SLATE = { red: 0.47, green: 0.52, blue: 0.6 };
const WHITE = { red: 1, green: 1, blue: 1 };
const PALE = { red: 0.95, green: 0.97, blue: 0.99 };

function roleOrder(role: string): string {
  return role === VIEW_TAB
    ? "0"
    : role === EXPENSE_VIEW_TITLE
      ? "1"
      : role.startsWith("Bank ")
        ? `2${role}`
        : `3${role}`;
}

/** Move managed views to the front, preserving personal tabs' relative order. */
export function organizationRequests(tabs: readonly TabInfo[]): unknown[] {
  const views = tabs
    .filter((tab) => tab.viewRoles.length === 1 && !tab.financialRecords && tab.title !== LEDGER_TAB)
    .sort((a, b) => {
      const left = roleOrder(a.viewRoles[0] ?? "");
      const right = roleOrder(b.viewRoles[0] ?? "");
      return left.startsWith("2") && right.startsWith("2") ? right.localeCompare(left) : left.localeCompare(right);
    });
  const technical = tabs.filter((tab) => tab.title === LEDGER_TAB || tab.expenseRecords);
  const managed = new Set([...views, ...technical].map((tab) => tab.id));
  const ordered = [...views, ...tabs.filter((tab) => !managed.has(tab.id)), ...technical];
  // Bringing each desired tab to index zero in reverse order avoids Google's
  // before-the-move index convention, including its no-op at current index + 1.
  const requests: unknown[] = ordered
    .toReversed()
    .map((tab) => ({ updateSheetProperties: { properties: { sheetId: tab.id, index: 0 }, fields: "index" } }));
  for (const tab of [...views, ...technical]) {
    const role = tab.viewRoles[0];
    const color = technical.includes(tab)
      ? SLATE
      : role === VIEW_TAB
        ? NAVY
        : role === EXPENSE_VIEW_TITLE
          ? TEAL
          : BLUE;
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: tab.id, hidden: technical.includes(tab), tabColorStyle: { rgbColor: color } },
        fields: "hidden,tabColorStyle",
      },
    });
  }
  return requests;
}

export function technicalRequests(tabs: readonly TabInfo[]): unknown[] {
  return tabs
    .filter((tab) => tab.title === LEDGER_TAB || tab.expenseRecords)
    .flatMap((tab) => [
      {
        updateSheetProperties: {
          properties: { sheetId: tab.id, gridProperties: { frozenRowCount: 1, hideGridlines: true } },
          fields: "gridProperties(frozenRowCount,hideGridlines)",
        },
      },
      {
        repeatCell: {
          range: { sheetId: tab.id },
          cell: {
            userEnteredFormat: {
              textFormat: { fontFamily: "Arial", fontSize: 10 },
              verticalAlignment: "TOP",
              wrapStrategy: "CLIP",
              numberFormat: { type: "TEXT" },
            },
          },
          fields: "userEnteredFormat",
        },
      },
      {
        repeatCell: {
          range: { sheetId: tab.id, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: NAVY,
              textFormat: { fontFamily: "Arial", fontSize: 10, bold: true, foregroundColor: WHITE },
            },
          },
          fields: "userEnteredFormat",
        },
      },
      ...widthRequests(tab.id, tab.expenseRecords ? [90, 600, 260] : [90, 120, 600, 260]),
    ]);
}

function numberFormatOf(pattern: string): { type: string; pattern: string } {
  if (pattern.includes("/")) return { type: "DATE", pattern };
  return { type: pattern.endsWith("%") ? "PERCENT" : "NUMBER", pattern };
}

export function cellData(cell: GridCell, row: number): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (cell.value !== "")
    data["userEnteredValue"] =
      typeof cell.value === "number" ? { numberValue: cell.value } : { stringValue: cell.value };
  const format: Record<string, unknown> = {
    textFormat: {
      fontFamily: "Arial",
      fontSize: row === 1 && cell.emphasis === "strong" ? 18 : 10,
      foregroundColor: NAVY,
      bold: cell.emphasis !== null,
    },
    verticalAlignment: "MIDDLE",
    wrapStrategy: "WRAP",
    backgroundColor: row % 2 === 0 ? PALE : WHITE,
    horizontalAlignment: cell.alignment ?? (typeof cell.value === "number" ? "RIGHT" : "LEFT"),
  };
  if (cell.format !== null) format["numberFormat"] = numberFormatOf(cell.format);
  if (cell.emphasis === "header") {
    format["backgroundColor"] = NAVY;
    format["textFormat"] = { fontFamily: "Arial", fontSize: 10, bold: true, foregroundColor: WHITE };
  }
  if (Object.keys(format).length > 0) data["userEnteredFormat"] = format;
  return data;
}

/** Equal neighbouring widths become one request. */
export function widthRequests(sheetId: number, widths: readonly number[]): unknown[] {
  const requests: unknown[] = [];
  let start = 0;
  for (let column = 1; column <= widths.length; column++) {
    if (column < widths.length && widths[column] === widths[start]) continue;
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: start, endIndex: column },
        properties: { pixelSize: widths[start] },
        fields: "pixelSize",
      },
    });
    start = column;
  }
  return requests;
}

/** The requests that fit and format one view tab once its sheet ID is known. */
export function viewRequests(
  tab: { readonly title: string; readonly grid: Grid },
  sheetId: number,
  knownId: number | undefined,
  rows: number,
  columns: number,
): unknown[] {
  const requests: unknown[] = [];
  requests.push({ clearBasicFilter: { sheetId } });
  requests.push({ unmergeCells: { range: { sheetId } } });
  if (knownId !== undefined) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { rowCount: rows, columnCount: columns, frozenRowCount: 0, frozenColumnCount: 0 },
        },
        fields: "gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount)",
      },
    });
  }
  const header = tab.grid.cells.findIndex((row) => row.filter((cell) => cell.emphasis === "header").length > 1);
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: {
          frozenRowCount: header < 0 ? 0 : header < 5 ? header + 1 : 2,
          frozenColumnCount: 0,
          hideGridlines: true,
        },
      },
      fields: "gridProperties(frozenRowCount,frozenColumnCount,hideGridlines)",
    },
  });
  requests.push({ repeatCell: { range: { sheetId }, cell: {}, fields: "userEnteredValue,userEnteredFormat" } });
  requests.push(...widthRequests(sheetId, tab.grid.widths));
  requests.push({
    updateCells: {
      start: { sheetId, rowIndex: 0, columnIndex: 0 },
      rows: tab.grid.cells.map((row, rowIndex) => ({ values: row.map((cell) => cellData(cell, rowIndex)) })),
      fields: "userEnteredValue,userEnteredFormat",
    },
  });
  if (header >= 0)
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: header,
          endRowIndex: header + 1,
          startColumnIndex: 1,
          endColumnIndex: columns - 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: NAVY,
            textFormat: { fontFamily: "Arial", fontSize: 10, bold: true, foregroundColor: WHITE },
          },
        },
        fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat",
      },
    });
  requests.push({
    autoResizeDimensions: { dimensions: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: rows } },
  });
  // Holdings and daily expenses are contiguous, filterable tables. Bank tabs
  // retain their source sections rather than filtering category subtotals.
  if ((tab.title === VIEW_TAB || tab.title === EXPENSE_VIEW_TITLE) && header >= 0) {
    const next = tab.grid.cells.findIndex(
      (row, index) =>
        index > header && (row.every((cell) => cell.value === "") || row.some((cell) => cell.emphasis === "header")),
    );
    const end = next < 0 ? rows - 1 : next;
    if (end > header + 1)
      requests.push({
        setBasicFilter: {
          filter: {
            range: {
              sheetId,
              startRowIndex: header,
              endRowIndex: end,
              startColumnIndex: 1,
              endColumnIndex: columns - 1,
            },
          },
        },
      });
  }
  // Notices span the readable report; bank evidence keeps its original positions.
  if (tab.title === VIEW_TAB || tab.title === EXPENSE_VIEW_TITLE) {
    tab.grid.cells.forEach((row, index) => {
      const nonempty = row.filter((cell) => cell.value !== "");
      if (
        nonempty.length === 1 &&
        typeof nonempty[0]?.value === "string" &&
        nonempty[0].value.length > 70 &&
        columns > 3
      ) {
        requests.push({
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: index,
              endRowIndex: index + 1,
              startColumnIndex: 1,
              endColumnIndex: columns - 1,
            },
            mergeType: "MERGE_ALL",
          },
        });
        requests.push({
          updateDimensionProperties: {
            range: { sheetId, dimension: "ROWS", startIndex: index, endIndex: index + 1 },
            properties: { pixelSize: 64 },
            fields: "pixelSize",
          },
        });
      }
    });
  }
  return requests;
}
