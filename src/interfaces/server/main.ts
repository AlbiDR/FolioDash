// Apps Script entry. Only the four named operations below are exposed; the build
// adds one top-level function for each, because Apps Script finds callable
// functions by name. Nothing here is reachable until a deployment is made.

import { RowLedgerStore } from "../../adapters/ledger/RowLedgerStore";
import { type SpreadsheetLike, SheetsRowSheet } from "../../adapters/appsscript/SheetsRowSheet";
import type { ServiceEnvironment } from "../../applications/LedgerService";
import { createService } from "./service";

declare const SpreadsheetApp: { openById(id: string): SpreadsheetLike; flush(): void };
declare const LockService: { getScriptLock(): { waitLock(milliseconds: number): void; releaseLock(): void } };
declare const Utilities: { getUuid(): string };

const LOCK_WAIT_MILLISECONDS = 30_000;

/**
 * Uses a script-wide lock. It serialises every caller of this script, not one
 * workbook, so it can become a bottleneck with many users; see the Google-backed
 * architecture section 7. It is not claimed to cover manual edits to the sheet.
 */
function openEnvironment(workbookId: string): ServiceEnvironment {
  const spreadsheet = SpreadsheetApp.openById(workbookId);
  const sheet = new SheetsRowSheet(spreadsheet, () => {
    SpreadsheetApp.flush();
  });
  return {
    store: new RowLedgerStore(sheet),
    withLock: <T>(action: () => T): T => {
      const lock = LockService.getScriptLock();
      lock.waitLock(LOCK_WAIT_MILLISECONDS);
      try {
        return action();
      } finally {
        lock.releaseLock();
      }
    },
    newRevision: () => Utilities.getUuid(),
  };
}

const service = createService(openEnvironment);

export const foliodashCheck = (workbookId: unknown): unknown => service.check(workbookId);
export const foliodashRead = (workbookId: unknown): unknown => service.read(workbookId);
export const foliodashCommit = (workbookId: unknown, request: unknown): unknown => service.commit(workbookId, request);
export const foliodashOutcome = (workbookId: unknown, commandId: unknown): unknown => service.outcome(workbookId, commandId);
