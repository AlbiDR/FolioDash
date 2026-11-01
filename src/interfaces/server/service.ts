import {
  type CommandOutcome,
  type CommitOutcome,
  type LoadResult,
  type ServiceEnvironment,
  commitStatement,
  readCommandOutcome,
  readLedger,
} from "../../applications/LedgerService";
import { parseCommitRequest } from "../../applications/CommitRequestParser";

/** Opens the caller's workbook as a service environment. Access is enforced by Google, not by this code. */
export type EnvironmentOpener = (workbookId: string) => ServiceEnvironment;

export type ServiceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: "invalid-request" | "unavailable"; readonly message: string };

function guard<T>(workbookId: unknown, open: EnvironmentOpener, action: (environment: ServiceEnvironment) => T): ServiceResult<T> {
  if (typeof workbookId !== "string" || workbookId.length < 10 || workbookId.length > 100) {
    return { ok: false, error: "invalid-request", message: "The workbook id is missing or malformed." };
  }
  try {
    return { ok: true, value: action(open(workbookId)) };
  } catch {
    // No detail is returned: errors from the spreadsheet service can echo identifiers or content.
    return { ok: false, error: "unavailable", message: "The workbook could not be opened or read with your access." };
  }
}

/**
 * The service's named operations. Each takes plain JSON, validates it, and
 * returns plain JSON. None accepts a cell range, a sheet name or a function name.
 */
export function createService(open: EnvironmentOpener) {
  return {
    /** Confirms the caller can reach the workbook and that its ledger is intact. */
    check: (workbookId: unknown): ServiceResult<LoadResult> => guard(workbookId, open, (environment) => readLedger(environment)),

    read: (workbookId: unknown): ServiceResult<LoadResult> => guard(workbookId, open, (environment) => readLedger(environment)),

    commit: (workbookId: unknown, request: unknown): ServiceResult<CommitOutcome> => {
      const parsed = parseCommitRequest(request);
      if (!parsed.ok) return { ok: false, error: "invalid-request", message: parsed.message };
      return guard(workbookId, open, (environment) => commitStatement(environment, parsed.request));
    },

    outcome: (workbookId: unknown, commandId: unknown): ServiceResult<CommandOutcome> => {
      if (typeof commandId !== "string" || commandId.length < 8 || commandId.length > 100) {
        return { ok: false, error: "invalid-request", message: "The command id is missing or malformed." };
      }
      return guard(workbookId, open, (environment) => readCommandOutcome(environment, commandId));
    },
  };
}
