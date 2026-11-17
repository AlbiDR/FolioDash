import { canonicalJson } from "../../../core/integrity/canonical-json";
import { sha256Hex } from "../../../core/integrity/sha256";
import type { ExpenseCommand } from "../../../core/expenses/work-expenses";
import { callRest, wroteNothing, type RestClient } from "../rest";
import { LEDGER_TAB } from "../sheets-layout";
import { SHEETS } from "../workbook/sheets-api";
import { ANCHOR, HEADER, KEY, ROLE, inspect } from "./expense-sheet";

/** Adds ownership, the durable enabled marker and the header in one atomic batch, only for explicit financial actions. */
export async function initializeExpenseLog(
  rest: RestClient,
  token: string,
  id: string,
  logTitle: string,
  commands: readonly ExpenseCommand[] = [],
): Promise<"confirmed" | "not-written" | "unknown"> {
  const found = await inspect(rest, token, id);
  if (found.status !== "ok") return "not-written";
  if (found.tabs.some((tab) => tab.markers.length > 0)) return "not-written";
  const ledger = found.tabs.find((tab) => tab.title === LEDGER_TAB);
  if (ledger === undefined) return "not-written";
  const sheetId = Math.max(...found.tabs.map((tab) => tab.id), 0) + 1;
  const names = new Set(found.tabs.map((tab) => tab.title));
  let title = logTitle;
  for (let suffix = 2; names.has(title); suffix++) title = `${logTitle} (${String(suffix)})`;
  const metadata = (sheet: number, role: string): unknown => ({
    createDeveloperMetadata: {
      developerMetadata: {
        metadataKey: KEY,
        metadataValue: role,
        location: { sheetId: sheet },
        visibility: "DOCUMENT",
      },
    },
  });
  const result = await callRest(rest, token, {
    method: "POST",
    url: `${SHEETS}/${encodeURIComponent(id)}:batchUpdate`,
    body: {
      requests: [
        {
          addSheet: {
            properties: {
              sheetId,
              title,
              hidden: true,
              gridProperties: { rowCount: Math.max(2, commands.length + 1), columnCount: 3, frozenRowCount: 1 },
            },
          },
        },
        metadata(sheetId, ROLE),
        metadata(ledger.id, ANCHOR),
        {
          updateCells: {
            start: { sheetId, rowIndex: 0, columnIndex: 0 },
            rows: [
              HEADER,
              ...commands.map((command) => {
                const text = canonicalJson(command);
                return ["1", text, sha256Hex(text)];
              }),
            ].map((row) => ({ values: row.map((text) => ({ userEnteredValue: { stringValue: text } })) })),
            fields: "userEnteredValue",
          },
        },
      ],
    },
  });
  return result.ok ? "confirmed" : wroteNothing(result.failure) ? "not-written" : "unknown";
}
