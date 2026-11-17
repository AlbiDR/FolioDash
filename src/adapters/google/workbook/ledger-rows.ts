import { canonicalJson } from "../../../core/integrity/canonical-json";
import { sha256Hex } from "../../../core/integrity/sha256";
import type { LedgerRow } from "../../ledger/row-ledger-store";
import { type RestClient, type RestResult, callRest } from "../rest";
import { LEDGER_COLUMNS, LEDGER_HEADER, LEDGER_TAB } from "../sheets-layout";
import { SHEETS, fail, record } from "./sheets-api";
import { listTabs } from "./tabs";

const TYPES = new Set<string>(["META", "SNAPSHOT", "TIMELINE", "SOURCE", "COMMIT"]);

export type LedgerTab = { readonly rows: readonly LedgerRow[] } | { readonly notALedger: true };

/** Reads every ledger row as text. A tab without the expected header is reported, never trusted. */
export async function readLedgerRows(
  rest: RestClient,
  accessToken: string,
  workbookId: string,
): Promise<RestResult<LedgerTab>> {
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
    const cells = (Array.isArray(line) ? (line as unknown[]) : []).map((cell) =>
      typeof cell === "string" ? cell : String(cell),
    );
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
export async function appendLedgerRows(
  rest: RestClient,
  accessToken: string,
  workbookId: string,
  rows: readonly LedgerRow[],
  predecessor?: readonly LedgerRow[],
): Promise<RestResult<number>> {
  const tabs = await listTabs(rest, accessToken, workbookId);
  if (!tabs.ok) return tabs;
  const ledger = tabs.value.find((tab) => tab.title === LEDGER_TAB);
  if (ledger === undefined) return fail("not-found");
  const marker = `FolioDash_${predecessor === undefined ? "restore" : "commit"}_${sha256Hex(canonicalJson(predecessor ?? []))}`;
  const answer = await callRest(rest, accessToken, {
    method: "POST",
    url: `${SHEETS}/${encodeURIComponent(workbookId)}:batchUpdate`,
    body: {
      requests: [
        {
          addNamedRange: {
            namedRange: {
              namedRangeId: marker,
              name: marker,
              range: { sheetId: ledger.id, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
            },
          },
        },
        {
          appendCells: {
            sheetId: ledger.id,
            rows: rows.map((row) => ({
              values: [row.revision, row.type, row.payload, row.checksum].map((value) => ({
                userEnteredValue: { stringValue: value },
              })),
            })),
            fields: "userEnteredValue",
          },
        },
      ],
    },
  });
  if (!answer.ok) return answer;
  // The caller reads back and checks complete committed content, not a response row count.
  return { ok: true, value: rows.length };
}

/** Atomically fence a pending predecessor and advance the current ledger without changing its figures. */
export async function fenceLedgerWrite(
  rest: RestClient,
  accessToken: string,
  workbookId: string,
  predecessorHash: string,
  current: readonly LedgerRow[],
  rows: readonly LedgerRow[],
): Promise<RestResult<boolean>> {
  if (!/^[0-9a-f]{64}$/u.test(predecessorHash)) return fail("unexpected");
  const tabs = await listTabs(rest, accessToken, workbookId);
  if (!tabs.ok) return tabs;
  const ledger = tabs.value.find((tab) => tab.title === LEDGER_TAB);
  if (ledger === undefined) return fail("not-found");
  const hashes = [...new Set([predecessorHash, sha256Hex(canonicalJson(current))])];
  const markers = hashes.map((hash) => {
    const marker = `FolioDash_commit_${hash}`;
    return {
      addNamedRange: {
        namedRange: {
          namedRangeId: marker,
          name: marker,
          range: { sheetId: ledger.id, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
        },
      },
    };
  });
  const result = await callRest(rest, accessToken, {
    method: "POST",
    url: `${SHEETS}/${encodeURIComponent(workbookId)}:batchUpdate`,
    body: {
      requests: [
        ...markers,
        {
          appendCells: {
            sheetId: ledger.id,
            rows: rows.map((row) => ({
              values: [row.revision, row.type, row.payload, row.checksum].map((value) => ({
                userEnteredValue: { stringValue: value },
              })),
            })),
            fields: "userEnteredValue",
          },
        },
      ],
    },
  });
  return result.ok ? { ok: true, value: true } : result;
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
  if (!ledger.hidden)
    requests.push({ updateSheetProperties: { properties: { sheetId: ledger.id, hidden: true }, fields: "hidden" } });
  if (ledger.columns > LEDGER_COLUMNS) {
    requests.push({
      deleteDimension: {
        range: { sheetId: ledger.id, dimension: "COLUMNS", startIndex: LEDGER_COLUMNS, endIndex: ledger.columns },
      },
    });
  }
  if (requests.length === 0) return true;
  const done = await callRest(rest, accessToken, {
    method: "POST",
    url: `${SHEETS}/${encodeURIComponent(workbookId)}:batchUpdate`,
    body: { requests },
  });
  return done.ok;
}
