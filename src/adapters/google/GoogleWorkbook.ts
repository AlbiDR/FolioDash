import { canonicalJson } from "../../core/CanonicalJson";
import { sha256Hex } from "../../core/Sha256";
import type { Workbook } from "../../applications/SessionModel";
import type { Grid, GridCell } from "../../applications/SheetGrid";
import type { LedgerRow } from "../ledger/RowLedgerStore";
import { type RestClient, type RestResult, callRest } from "./Rest";
import {
  APP_PROPERTY_KEY,
  APP_PROPERTY_VALUE,
  EXPENSE_VIEW_TITLE,
  EXPENSE_METADATA_KEY,
  EXPENSE_RECORD_ROLE,
  LEDGER_COLUMNS,
  LEDGER_HEADER,
  LEDGER_TAB,
  VIEW_TAB,
  VIEW_METADATA_KEY,
  WORKBOOK_TITLE,
} from "./SheetsLayout";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const TYPES = new Set<string>(["META", "SNAPSHOT", "TIMELINE", "SOURCE", "COMMIT"]);

/** Explicit discovery identity keeps local synthetic acceptance separate from the real portfolio. */
export interface WorkbookIdentity {
  readonly title: string;
  readonly propertyKey: string;
  readonly propertyValue: string;
}
const DEFAULT_IDENTITY: WorkbookIdentity = { title: WORKBOOK_TITLE, propertyKey: APP_PROPERTY_KEY, propertyValue: APP_PROPERTY_VALUE };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function fail<T>(failure: Extract<RestResult<T>, { ok: false }>["failure"]): RestResult<T> {
  return { ok: false, failure };
}

function openUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
}

/**
 * Finds the person's FolioDash spreadsheet again: first by the tag the app put on
 * it, then, in case tagging did not complete, by its name. The newest match wins.
 */
export async function findWorkbook(rest: RestClient, accessToken: string, identity: WorkbookIdentity = DEFAULT_IDENTITY): Promise<RestResult<Workbook | null>> {
  const queries = [
    `appProperties has { key='${identity.propertyKey}' and value='${identity.propertyValue}' } and trashed=false`,
    `name='${identity.title}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
  ];
  for (const query of queries) {
    const url = `${DRIVE}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent("files(id)")}&orderBy=${encodeURIComponent("createdTime desc")}&pageSize=1&spaces=drive`;
    const answer = await callRest(rest, accessToken, { method: "GET", url });
    if (!answer.ok) return answer;
    const files = record(answer.value)?.["files"];
    const first = Array.isArray(files) ? record(files[0]) : null;
    if (typeof first?.["id"] === "string") return { ok: true, value: { id: first["id"], url: openUrl(first["id"]) } };
  }
  return { ok: true, value: null };
}

/**
 * Creates the spreadsheet: a readable tab for the person and a hidden ledger tab
 * with its header in the same creation request, then tags the file. A tagging
 * failure is not fatal, because the name search finds the file anyway; it is
 * reported so it can be mentioned.
 */
export async function createWorkbook(rest: RestClient, accessToken: string, identity: WorkbookIdentity = DEFAULT_IDENTITY): Promise<RestResult<Workbook & { readonly tagged: boolean }>> {
  const created = await callRest(rest, accessToken, {
    method: "POST",
    url: SHEETS,
    body: {
      properties: { title: identity.title },
      sheets: [
        { properties: { sheetId: 0, title: VIEW_TAB, index: 0 }, developerMetadata: [viewMetadata(0, VIEW_TAB)] },
        {
          properties: { sheetId: 1, title: LEDGER_TAB, index: 1, hidden: true, gridProperties: { rowCount: 2, columnCount: LEDGER_COLUMNS, frozenRowCount: 1 } },
          data: [{ startRow: 0, startColumn: 0, rowData: [{ values: LEDGER_HEADER.map((text) => ({ userEnteredValue: { stringValue: text } })) }] }],
        },
      ],
    },
  });
  if (!created.ok) return created;
  const id = record(created.value)?.["spreadsheetId"];
  if (typeof id !== "string") return fail("unexpected");

  const header = await readLedgerRows(rest, accessToken, id);
  if (!header.ok) return header;
  if ("notALedger" in header.value) return fail("unexpected");

  await tidyLedgerTab(rest, accessToken, id);

  const tag = await callRest(rest, accessToken, {
    method: "PATCH",
    url: `${DRIVE}/${encodeURIComponent(id)}?fields=id`,
    body: { appProperties: { [identity.propertyKey]: identity.propertyValue } },
  });
  return { ok: true, value: { id, url: openUrl(id), tagged: tag.ok } };
}

export type LedgerTab = { readonly rows: readonly LedgerRow[] } | { readonly notALedger: true };

/** Reads every ledger row as text. A tab without the expected header is reported, never trusted. */
export async function readLedgerRows(rest: RestClient, accessToken: string, workbookId: string): Promise<RestResult<LedgerTab>> {
  const answer = await callRest(rest, accessToken, {
    method: "GET",
    url: `${SHEETS}/${encodeURIComponent(workbookId)}/values/${encodeURIComponent(`${LEDGER_TAB}!A1:D`)}?valueRenderOption=UNFORMATTED_VALUE`,
  });
  if (!answer.ok) {
    // Google answers 400 when the tab does not exist, which is the same as "not a ledger".
    return answer.failure === "unexpected" ? { ok: true, value: { notALedger: true } } : answer;
  }
  const values = record(answer.value)?.["values"];
  const lines = Array.isArray(values) ? (values as unknown[]) : [];
  const header = Array.isArray(lines[0]) ? (lines[0] as unknown[]).map(String).join("|") : "";
  if (header !== LEDGER_HEADER.join("|")) return { ok: true, value: { notALedger: true } };
  const rows = lines.slice(1).map((line): LedgerRow => {
    const cells = (Array.isArray(line) ? (line as unknown[]) : []).map((cell) => (typeof cell === "string" ? cell : String(cell)));
    const [revision, type, payload, checksum] = cells;
    return {
      revision: revision ?? "",
      // An unknown type is kept as is so the store reports the ledger as damaged instead of hiding it.
      type: (TYPES.has(type ?? "") ? type : "UNKNOWN") as LedgerRow["type"],
      payload: payload ?? "",
      checksum: checksum ?? "",
    };
  });
  return { ok: true, value: { rows } };
}

/** Claims a predecessor and appends typed rows atomically. Never retry this request blindly. */
export async function appendLedgerRows(rest: RestClient, accessToken: string, workbookId: string, rows: readonly LedgerRow[], predecessor?: readonly LedgerRow[]): Promise<RestResult<number>> {
  const tabs = await listTabs(rest, accessToken, workbookId);
  if (!tabs.ok) return tabs;
  const ledger = tabs.value.find((tab) => tab.title === LEDGER_TAB);
  if (ledger === undefined) return fail("not-found");
  const marker = `FolioDash_${predecessor === undefined ? "restore" : "commit"}_${sha256Hex(canonicalJson(predecessor ?? []))}`;
  const answer = await callRest(rest, accessToken, {
    method: "POST",
    url: `${SHEETS}/${encodeURIComponent(workbookId)}:batchUpdate`,
    body: { requests: [
      { addNamedRange: { namedRange: { namedRangeId: marker, name: marker, range: { sheetId: ledger.id, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 } } } },
      { appendCells: { sheetId: ledger.id, rows: rows.map((row) => ({ values: [row.revision, row.type, row.payload, row.checksum].map((value) => ({ userEnteredValue: { stringValue: value } })) })), fields: "userEnteredValue" } },
    ] },
  });
  if (!answer.ok) return answer;
  // The caller reads back and checks complete committed content, not a response row count.
  return { ok: true, value: rows.length };
}

interface TabInfo {
  readonly id: number;
  readonly title: string;
  readonly hidden: boolean;
  readonly columns: number;
  readonly viewRoles: readonly string[];
  readonly financialRecords: boolean;
  readonly expenseRecords: boolean;
}

function viewMetadata(sheetId: number, role: string): Record<string, unknown> {
  return { metadataKey: VIEW_METADATA_KEY, metadataValue: role, location: { sheetId }, visibility: "DOCUMENT" };
}

async function listTabs(rest: RestClient, accessToken: string, workbookId: string): Promise<RestResult<readonly TabInfo[]>> {
  const answer = await callRest(rest, accessToken, {
    method: "GET",
    url: `${SHEETS}/${encodeURIComponent(workbookId)}?fields=${encodeURIComponent("sheets(properties(sheetId,title,hidden,gridProperties(columnCount)),developerMetadata)")}`,
  });
  if (!answer.ok) return answer;
  const sheets = record(answer.value)?.["sheets"];
  const tabs = (Array.isArray(sheets) ? (sheets as unknown[]) : []).flatMap((entry): TabInfo[] => {
    const properties = record(record(entry)?.["properties"]);
    const columns = record(properties?.["gridProperties"])?.["columnCount"];
    const metadata = record(entry)?.["developerMetadata"];
    const financialRecords = (Array.isArray(metadata) ? metadata : []).some((item: unknown) => {
      const value = record(item);
      const location = record(value?.["location"]);
      return value?.["metadataKey"] === EXPENSE_METADATA_KEY && location?.["sheetId"] === properties?.["sheetId"];
    });
    const expenseRecords = (Array.isArray(metadata) ? metadata : []).some((item: unknown) => {
      const value = record(item);
      return value?.["metadataKey"] === EXPENSE_METADATA_KEY && value["metadataValue"] === EXPENSE_RECORD_ROLE && record(value["location"])?.["sheetId"] === properties?.["sheetId"];
    });
    const viewRoles = (Array.isArray(metadata) ? metadata : []).flatMap((item: unknown): string[] => {
      const value = record(item);
      const location = record(value?.["location"]);
      return value?.["metadataKey"] === VIEW_METADATA_KEY && typeof value["metadataValue"] === "string" && location?.["sheetId"] === properties?.["sheetId"] && location?.["dimensionRange"] === undefined
        ? [value["metadataValue"]] : [];
    });
    return typeof properties?.["sheetId"] === "number" && typeof properties["title"] === "string"
      ? [{ id: properties["sheetId"], title: properties["title"], hidden: properties["hidden"] === true, columns: typeof columns === "number" ? columns : 0, viewRoles, financialRecords, expenseRecords }]
      : [];
  });
  return { ok: true, value: tabs };
}

/**
 * Hides the ledger tab, which holds the checked records and should not be edited by
 * hand, and deletes any columns beyond the four it uses. Cosmetic and best effort:
 * Google does not always honour "hidden" when a tab is created, so it is done
 * afterwards too. Rows are never deleted here, because another device may be
 * appending to the ledger at that moment and a delete could take its rows.
 */
export async function tidyLedgerTab(rest: RestClient, accessToken: string, workbookId: string): Promise<boolean> {
  const tabs = await listTabs(rest, accessToken, workbookId);
  if (!tabs.ok) return false;
  const ledger = tabs.value.find((tab) => tab.title === LEDGER_TAB);
  if (ledger === undefined) return false;
  const requests: unknown[] = [];
  if (!ledger.hidden) requests.push({ updateSheetProperties: { properties: { sheetId: ledger.id, hidden: true }, fields: "hidden" } });
  if (ledger.columns > LEDGER_COLUMNS) {
    requests.push({ deleteDimension: { range: { sheetId: ledger.id, dimension: "COLUMNS", startIndex: LEDGER_COLUMNS, endIndex: ledger.columns } } });
  }
  if (requests.length === 0) return true;
  const done = await callRest(rest, accessToken, { method: "POST", url: `${SHEETS}/${encodeURIComponent(workbookId)}:batchUpdate`, body: { requests } });
  return done.ok;
}

export interface GridTab {
  readonly title: string;
  readonly grid: Grid;
}

const NAVY = { red: 0.12, green: 0.20, blue: 0.34 };
const BLUE = { red: 0.24, green: 0.46, blue: 0.72 };
const TEAL = { red: 0.12, green: 0.49, blue: 0.47 };
const SLATE = { red: 0.47, green: 0.52, blue: 0.60 };
const WHITE = { red: 1, green: 1, blue: 1 };
const PALE = { red: 0.95, green: 0.97, blue: 0.99 };

function roleOrder(role: string): string {
  return role === VIEW_TAB ? "0" : role === EXPENSE_VIEW_TITLE ? "1" : role.startsWith("Bank ") ? `2${role}` : `3${role}`;
}

/** Move managed views to the front, preserving personal tabs' relative order. */
function organizationRequests(tabs: readonly TabInfo[]): unknown[] {
  const views = tabs.filter((tab) => tab.viewRoles.length === 1 && !tab.financialRecords && tab.title !== LEDGER_TAB)
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
  const requests: unknown[] = [...ordered].reverse().map((tab) => ({ updateSheetProperties: { properties: { sheetId: tab.id, index: 0 }, fields: "index" } }));
  for (const tab of [...views, ...technical]) {
    const role = tab.viewRoles[0];
    const color = technical.includes(tab) ? SLATE : role === VIEW_TAB ? NAVY : role === EXPENSE_VIEW_TITLE ? TEAL : BLUE;
    requests.push({ updateSheetProperties: { properties: { sheetId: tab.id, hidden: technical.includes(tab), tabColorStyle: { rgbColor: color } }, fields: "hidden,tabColorStyle" } });
  }
  return requests;
}

function technicalRequests(tabs: readonly TabInfo[]): unknown[] {
  return tabs.filter((tab) => tab.title === LEDGER_TAB || tab.expenseRecords).flatMap((tab) => [
    { updateSheetProperties: { properties: { sheetId: tab.id, gridProperties: { frozenRowCount: 1, hideGridlines: true } }, fields: "gridProperties(frozenRowCount,hideGridlines)" } },
    { repeatCell: { range: { sheetId: tab.id }, cell: { userEnteredFormat: { textFormat: { fontFamily: "Arial", fontSize: 10 }, verticalAlignment: "TOP", wrapStrategy: "CLIP", numberFormat: { type: "TEXT" } } }, fields: "userEnteredFormat" } },
    { repeatCell: { range: { sheetId: tab.id, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { fontFamily: "Arial", fontSize: 10, bold: true, foregroundColor: WHITE } } }, fields: "userEnteredFormat" } },
    ...widthRequests(tab.id, tab.expenseRecords ? [90, 600, 260] : [90, 120, 600, 260]),
  ]);
}

function numberFormatOf(pattern: string): { type: string; pattern: string } {
  if (pattern.includes("/")) return { type: "DATE", pattern };
  return { type: pattern.endsWith("%") ? "PERCENT" : "NUMBER", pattern };
}

function cellData(cell: GridCell, row: number): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (cell.value !== "") data["userEnteredValue"] = typeof cell.value === "number" ? { numberValue: cell.value } : { stringValue: cell.value };
  const format: Record<string, unknown> = {
    textFormat: { fontFamily: "Arial", fontSize: row === 1 && cell.emphasis === "strong" ? 18 : 10, foregroundColor: NAVY, bold: cell.emphasis !== null },
    verticalAlignment: "MIDDLE", wrapStrategy: "WRAP",
    backgroundColor: row % 2 === 0 ? PALE : WHITE,
    horizontalAlignment: typeof cell.value === "number" ? "RIGHT" : "LEFT",
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
function widthRequests(sheetId: number, widths: readonly number[]): unknown[] {
  const requests: unknown[] = [];
  let start = 0;
  for (let column = 1; column <= widths.length; column++) {
    if (column < widths.length && widths[column] === widths[start]) continue;
    requests.push({
      updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: start, endIndex: column }, properties: { pixelSize: widths[start] }, fields: "pixelSize" },
    });
    start = column;
  }
  return requests;
}

/**
 * Writes tabs from finished grids, any number of them: list the
 * tabs, then one batch that adds the missing owned views, fits every grid to exactly its
 * data plus the one-cell margin (so surplus rows and columns are deleted), resets
 * what was there, and writes values, formats and widths. Text goes in as text and
 * numbers as numbers, with no guessing by Google. A batch is applied whole or not
 * at all. Unmarked legacy tabs require an additional exact-content read before adoption.
 * These tabs are views of the ledger that can be rewritten at any time, so
 * a failure here never affects the saved records.
 */
export async function writeGridTabs(rest: RestClient, accessToken: string, workbookId: string, tabs: readonly GridTab[]): Promise<RestResult<true> & { readonly message?: string }> {
  if (tabs.length === 0) return { ok: true, value: true };
  // Never let a view operation target the financial log or repeat a role in one batch.
  if (tabs.some((tab) => tab.title === LEDGER_TAB) || new Set(tabs.map((tab) => tab.title)).size !== tabs.length) return fail("unexpected");
  const existing = await listTabs(rest, accessToken, workbookId);
  if (!existing.ok) return existing;
  const organized = [...existing.value];
  let nextId = existing.value.reduce((highest, tab) => Math.max(highest, tab.id), 0) + 1;

  const requests: unknown[] = [];
  for (const tab of tabs) {
    const rows = tab.grid.cells.length;
    const columns = tab.grid.widths.length;
    const owned = existing.value.filter((candidate) => candidate.viewRoles.includes(tab.title));
    // Ambiguous markers must not decide which tab to erase. The ledger is never a view.
    if (owned.length > 1 || owned.some((candidate) => candidate.title === LEDGER_TAB || candidate.financialRecords || candidate.viewRoles.length !== 1)) return { ok: false, failure: "unexpected", message: `The ownership of “${tab.title}” is ambiguous. No organization batch was submitted. Preserve these tabs and review their ownership before continuing.` };
    let knownId = owned[0]?.id;
    // Older versions did not mark generated tabs. Only adopt an exact value
    // match; a familiar title alone is never authority to erase someone's work.
    if (knownId === undefined) {
      const legacy = existing.value.find((candidate) => candidate.title === tab.title);
      if (legacy !== undefined) {
        if (legacy.financialRecords || legacy.viewRoles.length > 0) return fail("unexpected");
        const answer = await callRest(rest, accessToken, { method: "GET", url: `${SHEETS}/${encodeURIComponent(workbookId)}/values/${encodeURIComponent(`'${legacy.title.replaceAll("'", "''")}'`)}?valueRenderOption=FORMULA` });
        if (!answer.ok) return answer;
        const trim = (value: unknown): string => {
          if (!Array.isArray(value)) return "invalid";
          const rows = value.map((row: unknown) => {
            if (!Array.isArray(row)) return ["invalid"];
            const cells: unknown[] = [...(row as unknown[])];
            while (cells.length > 0 && (cells.at(-1) === "" || cells.at(-1) === null)) cells.pop();
            return cells;
          });
          while (rows.length > 0 && rows.at(-1)?.length === 0) rows.pop();
          return canonicalJson(rows);
        };
        if (trim(record(answer.value)?.["values"] ?? []) !== trim(tab.grid.cells.map((row) => row.map((cell) => cell.value)))) return { ok: false, failure: "unexpected", message: `“${legacy.title}” is unmarked and differs from the saved view. No organization batch was submitted. Rename that tab in Google Sheets to keep it, then organize again; FolioDash will create its own view without overwriting it.` };
        knownId = legacy.id;
        organized[organized.findIndex((candidate) => candidate.id === legacy.id)] = { ...legacy, viewRoles: [tab.title] };
        requests.push({ createDeveloperMetadata: { developerMetadata: viewMetadata(legacy.id, tab.title) } });
      }
    }
    const sheetId = knownId ?? nextId++;
    if (knownId === undefined) {
      const title = tab.title;
      organized.push({ id: sheetId, title, hidden: false, columns, viewRoles: [title], financialRecords: false, expenseRecords: false });
      requests.push({ addSheet: { properties: { sheetId, title, gridProperties: { rowCount: rows, columnCount: columns } } } });
      requests.push({ createDeveloperMetadata: { developerMetadata: viewMetadata(sheetId, tab.title) } });
    }
    requests.push({ clearBasicFilter: { sheetId } });
    requests.push({ unmergeCells: { range: { sheetId } } });
    if (knownId !== undefined) {
      requests.push({
        updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: rows, columnCount: columns, frozenRowCount: 0, frozenColumnCount: 0 } }, fields: "gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount)" },
      });
    }
    const header = tab.grid.cells.findIndex((row) => row.filter((cell) => cell.emphasis === "header").length > 1);
    requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: header < 0 ? 0 : header < 5 ? header + 1 : 2, frozenColumnCount: 0, hideGridlines: true } }, fields: "gridProperties(frozenRowCount,frozenColumnCount,hideGridlines)" } });
    requests.push({ repeatCell: { range: { sheetId }, cell: {}, fields: "userEnteredValue,userEnteredFormat" } });
    requests.push(...widthRequests(sheetId, tab.grid.widths));
    requests.push({
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: tab.grid.cells.map((row, rowIndex) => ({ values: row.map((cell) => cellData(cell, rowIndex)) })),
        fields: "userEnteredValue,userEnteredFormat",
      },
    });
    requests.push({ autoResizeDimensions: { dimensions: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: rows } } });
    // Holdings and daily expenses are contiguous, filterable tables. Bank tabs
    // retain their source sections rather than filtering category subtotals.
    if ((tab.title === VIEW_TAB || tab.title === EXPENSE_VIEW_TITLE) && header >= 0) {
      const next = tab.grid.cells.findIndex((row, index) => index > header && (row.every((cell) => cell.value === "") || row.some((cell) => cell.emphasis === "header")));
      const end = next < 0 ? rows - 1 : next;
      if (end > header + 1) requests.push({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: header, endRowIndex: end, startColumnIndex: 1, endColumnIndex: columns - 1 } } } });
    }
    // Notices span the readable report; bank evidence keeps its original positions.
    if (tab.title === VIEW_TAB || tab.title === EXPENSE_VIEW_TITLE) {
      tab.grid.cells.forEach((row, index) => {
        const nonempty = row.filter((cell) => cell.value !== "");
        if (nonempty.length === 1 && typeof nonempty[0]?.value === "string" && nonempty[0].value.length > 70 && columns > 3) {
          requests.push({ mergeCells: { range: { sheetId, startRowIndex: index, endRowIndex: index + 1, startColumnIndex: 1, endColumnIndex: columns - 1 }, mergeType: "MERGE_ALL" } });
          requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: index, endIndex: index + 1 }, properties: { pixelSize: 64 }, fields: "pixelSize" } });
        }
      });
    }
  }
  requests.push(...technicalRequests(organized), ...organizationRequests(organized));
  const written = await callRest(rest, accessToken, { method: "POST", url: `${SHEETS}/${encodeURIComponent(workbookId)}:batchUpdate`, body: { requests } });
  return written.ok ? { ok: true, value: true } : written;
}
