import type { CommitRequest } from "../../applications/LedgerService";
import { type LedgerState, validateLedger } from "../../core/Ledger";
import { type HttpClient, type RunOutcome, runScriptFunction } from "./ScriptsRun";

/** Who is calling which script about which spreadsheet. The token is used for one call and never returned. */
export interface RemoteTarget {
  readonly scriptId: string;
  readonly workbookId: string;
  readonly accessToken: string;
}

type Failure = Exclude<RunOutcome["status"], "ok">;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function short(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.slice(0, 200) : fallback;
}

/**
 * A ledger that arrived over the network is untrusted input. It must have the
 * expected shape and pass the same validation that guards every write; anything
 * else is reported as damaged rather than shown.
 */
export function parseLedgerState(value: unknown): LedgerState | null {
  const state = record(value);
  if (state === null || typeof state["revision"] !== "string" || !Array.isArray(state["funds"]) || !Array.isArray(state["snapshots"])) return null;
  const candidate = state as unknown as LedgerState;
  return validateLedger(candidate).length === 0 ? candidate : null;
}

export type RemoteRead =
  | { readonly status: "ok"; readonly state: LedgerState; readonly ignoredTrailingRows: number }
  | { readonly status: "damaged"; readonly message: string }
  | { readonly status: "workbook-unavailable" }
  | { readonly status: "refused"; readonly message: string }
  | { readonly status: "call-failed"; readonly failure: Failure; readonly message: string | null }
  | { readonly status: "unrecognised" };

/** Interprets the service's answer to `check` or `read`. */
export function interpretRead(result: unknown): RemoteRead {
  const answer = record(result);
  if (answer === null) return { status: "unrecognised" };
  if (answer["ok"] === false) {
    return answer["error"] === "unavailable" ? { status: "workbook-unavailable" } : { status: "refused", message: short(answer["message"], "The request was refused.") };
  }
  const value = record(answer["value"]);
  if (answer["ok"] !== true || value === null) return { status: "unrecognised" };
  if (value["status"] === "damaged") return { status: "damaged", message: short(value["message"], "The ledger is damaged.") };
  if (value["status"] !== "ok") return { status: "unrecognised" };
  const state = parseLedgerState(value["state"]);
  if (state === null) return { status: "damaged", message: "The ledger in the spreadsheet did not pass validation." };
  const ignored = value["ignoredTrailingRows"];
  return { status: "ok", state, ignoredTrailingRows: typeof ignored === "number" ? ignored : 0 };
}

/** `foliodashCheck` and `foliodashRead` answer identically; the connection screen uses the first, the app the second. */
export async function readRemoteLedger(http: HttpClient, target: RemoteTarget, functionName: "foliodashCheck" | "foliodashRead" = "foliodashRead"): Promise<RemoteRead> {
  const outcome = await runScriptFunction(http, {
    scriptId: target.scriptId,
    accessToken: target.accessToken,
    functionName,
    parameters: [target.workbookId],
  });
  if (outcome.status !== "ok") return { status: "call-failed", failure: outcome.status, message: outcome.status === "script-error" ? outcome.message : null };
  return interpretRead(outcome.result);
}

export type RemoteCommit =
  | { readonly status: "committed" | "already-committed"; readonly revision: string }
  /** The reviewed revision is no longer the current one: someone else, or another tab, saved first. */
  | { readonly status: "stale" }
  | { readonly status: "rejected"; readonly messages: readonly string[] }
  | { readonly status: "damaged"; readonly message: string }
  /** Known not to have been written. Safe to try again with the same command id. */
  | { readonly status: "not-committed"; readonly message: string }
  /** The request was refused before the script ran (sign-in, access, or setup). Nothing was written. */
  | { readonly status: "not-sent"; readonly failure: "unauthorised" | "forbidden" | "not-found" }
  | { readonly status: "refused"; readonly message: string }
  /** The request may have reached the script. Check the outcome before trying again. */
  | { readonly status: "unknown"; readonly message: string };

const UNKNOWN_TEXT = "The save may or may not have been recorded. Check what happened before trying again.";

function interpretCommit(result: unknown): RemoteCommit {
  const answer = record(result);
  if (answer === null) return { status: "unknown", message: UNKNOWN_TEXT };
  if (answer["ok"] === false) {
    // An invalid request is refused before any work; an unavailable workbook is reported without detail and is
    // treated as unknown, because the script cannot say how far it got.
    return answer["error"] === "invalid-request"
      ? { status: "refused", message: short(answer["message"], "The request was refused.") }
      : { status: "unknown", message: UNKNOWN_TEXT };
  }
  const value = record(answer["value"]);
  if (answer["ok"] !== true || value === null) return { status: "unknown", message: UNKNOWN_TEXT };
  switch (value["status"]) {
    case "committed":
    case "already-committed":
      return typeof value["revision"] === "string"
        ? { status: value["status"], revision: value["revision"] }
        : { status: "unknown", message: UNKNOWN_TEXT };
    case "stale":
      return { status: "stale" };
    case "rejected": {
      const issues = Array.isArray(value["issues"]) ? (value["issues"] as unknown[]) : [];
      const messages = issues.map((issue) => short(record(issue)?.["message"], "A rule was not met.")).slice(0, 10);
      return { status: "rejected", messages: messages.length > 0 ? messages : ["A rule was not met."] };
    }
    case "damaged":
      return { status: "damaged", message: short(value["message"], "The ledger is damaged.") };
    case "not-committed":
      return { status: "not-committed", message: short(value["message"], "Nothing was recorded. It is safe to try again.") };
    default:
      return { status: "unknown", message: short(value["message"], UNKNOWN_TEXT) };
  }
}

/**
 * Sends one reviewed statement. A failure to reach the script is not proof that
 * nothing was written, so only refusals made before the script ran count as
 * "not sent"; everything else is unknown and must be resolved with
 * `readRemoteCommandOutcome` rather than retried blindly.
 */
export async function commitRemote(http: HttpClient, target: RemoteTarget, request: CommitRequest): Promise<RemoteCommit> {
  const outcome = await runScriptFunction(http, {
    scriptId: target.scriptId,
    accessToken: target.accessToken,
    functionName: "foliodashCommit",
    parameters: [target.workbookId, request],
  });
  if (outcome.status === "ok") return interpretCommit(outcome.result);
  if (outcome.status === "unauthorised" || outcome.status === "forbidden" || outcome.status === "not-found") {
    return { status: "not-sent", failure: outcome.status };
  }
  return { status: "unknown", message: UNKNOWN_TEXT };
}

export type RemoteOutcome =
  | { readonly status: "committed" }
  | { readonly status: "not-found" }
  | { readonly status: "damaged"; readonly message: string }
  /** The outcome itself could not be read. Nothing can be said about the save. */
  | { readonly status: "unreachable" };

export async function readRemoteCommandOutcome(http: HttpClient, target: RemoteTarget, commandId: string): Promise<RemoteOutcome> {
  const outcome = await runScriptFunction(http, {
    scriptId: target.scriptId,
    accessToken: target.accessToken,
    functionName: "foliodashOutcome",
    parameters: [target.workbookId, commandId],
  });
  if (outcome.status !== "ok") return { status: "unreachable" };
  const answer = record(outcome.result);
  const value = record(answer?.["value"]);
  if (answer?.["ok"] !== true || value === null) return { status: "unreachable" };
  if (value["status"] === "committed") return { status: "committed" };
  if (value["status"] === "not-found") return { status: "not-found" };
  if (value["status"] === "damaged") return { status: "damaged", message: short(value["message"], "The ledger is damaged.") };
  return { status: "unreachable" };
}
