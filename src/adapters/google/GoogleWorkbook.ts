import type { LedgerRow } from "../ledger/RowLedgerStore";
import { type RestClient, type RestResult, callRest } from "./Rest";
import {
  APP_PROPERTY_KEY,
  APP_PROPERTY_VALUE,
  LEDGER_COLUMNS,
  LEDGER_HEADER,
  LEDGER_TAB,
  VIEW_TAB,
  WORKBOOK_TITLE,
} from "./SheetsLayout";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const TYPES = new Set<string>(["META", "SNAPSHOT", "TIMELINE", "COMMIT"]);

export interface Workbook {
  readonly id: string;
  readonly url: string;
}

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
export async function findWorkbook(rest: RestClient, accessToken: string): Promise<RestResult<Workbook | null>> {
  const queries = [
    `appProperties has { key='${APP_PROPERTY_KEY}' and value='${APP_PROPERTY_VALUE}' } and trashed=false`,
    `name='${WORKBOOK_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
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
 * with its header, then tags the file. A tagging failure is not fatal, because the
 * name search finds the file anyway; it is reported so it can be mentioned.
 */
export async function createWorkbook(rest: RestClient, accessToken: string): Promise<RestResult<Workbook & { readonly tagged: boolean }>> {
  const created = await callRest(rest, accessToken, {
    method: "POST",
    url: SHEETS,
    body: {
      properties: { title: WORKBOOK_TITLE },
      sheets: [
        { properties: { title: VIEW_TAB, index: 0 } },
        { properties: { title: LEDGER_TAB, index: 1, hidden: true, gridProperties: { rowCount: 50, columnCount: LEDGER_COLUMNS, frozenRowCount: 1 } } },
      ],
    },
  });
  if (!created.ok) return created;
  const id = record(created.value)?.["spreadsheetId"];
  if (typeof id !== "string") return fail("unexpected");

  const header = await callRest(rest, accessToken, {
    method: "PUT",
    url: `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(`${LEDGER_TAB}!A1:D1`)}?valueInputOption=RAW`,
    body: { values: [[...LEDGER_HEADER]] },
  });
  if (!header.ok) return header;

  const tag = await callRest(rest, accessToken, {
    method: "PATCH",
    url: `${DRIVE}/${encodeURIComponent(id)}?fields=id`,
    body: { appProperties: { [APP_PROPERTY_KEY]: APP_PROPERTY_VALUE } },
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

/** Appends rows in one request, as text, so the change is applied whole or not at all. */
export async function appendLedgerRows(rest: RestClient, accessToken: string, workbookId: string, rows: readonly LedgerRow[]): Promise<RestResult<number>> {
  const answer = await callRest(rest, accessToken, {
    method: "POST",
    url: `${SHEETS}/${encodeURIComponent(workbookId)}/values/${encodeURIComponent(`${LEDGER_TAB}!A:D`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    body: { values: rows.map((row) => [row.revision, row.type, row.payload, row.checksum]) },
  });
  if (!answer.ok) return answer;
  const updated = record(record(answer.value)?.["updates"])?.["updatedRows"];
  // A different count than was sent is not a success we can describe, so say the answer was lost.
  return typeof updated === "number" && updated === rows.length ? { ok: true, value: updated } : fail("network");
}

export type ViewCell = string | number;

/** Replaces the readable tab. It is rebuilt from the ledger on every save and is not a record. */
export async function writeReadableView(rest: RestClient, accessToken: string, workbookId: string, lines: readonly (readonly ViewCell[])[]): Promise<RestResult<true>> {
  const range = encodeURIComponent(`${VIEW_TAB}!A1:Z500`);
  const cleared = await callRest(rest, accessToken, { method: "POST", url: `${SHEETS}/${encodeURIComponent(workbookId)}/values/${range}:clear`, body: {} });
  if (!cleared.ok) return cleared;
  const written = await callRest(rest, accessToken, {
    method: "PUT",
    url: `${SHEETS}/${encodeURIComponent(workbookId)}/values/${encodeURIComponent(`${VIEW_TAB}!A1`)}?valueInputOption=RAW`,
    body: { values: lines.map((line) => [...line]) },
  });
  return written.ok ? { ok: true, value: true } : written;
}
