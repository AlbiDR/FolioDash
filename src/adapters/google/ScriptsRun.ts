/** The part of `fetch` this client needs, so it can be tested without a network. */
export interface HttpResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

export type HttpClient = (
  url: string,
  init: { readonly method: "POST"; readonly headers: Readonly<Record<string, string>>; readonly body: string },
) => Promise<HttpResponse>;

export type RunOutcome =
  | { readonly status: "ok"; readonly result: unknown }
  /** The script ran and raised an error. Google's error text is the script's own message. */
  | { readonly status: "script-error"; readonly message: string }
  /** The token is missing, expired or lacks a scope the script needs. */
  | { readonly status: "unauthorised" }
  /** The signed-in account may not run this script, or the API is not enabled for the project. */
  | { readonly status: "forbidden" }
  /** No such script or deployment, or it is not deployed as an API executable. */
  | { readonly status: "not-found" }
  | { readonly status: "unavailable" }
  | { readonly status: "network" }
  | { readonly status: "unexpected" };

const SCRIPTS_RUN = "https://script.googleapis.com/v1/scripts";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function scriptErrorMessage(error: Record<string, unknown>): string {
  const details = Array.isArray(error["details"]) ? (error["details"] as unknown[]) : [];
  const first = record(details[0]);
  const message = first?.["errorMessage"];
  return typeof message === "string" ? message.slice(0, 300) : "The script reported an error.";
}

/**
 * Calls one function of an Apps Script API executable as the signed-in user. The
 * token travels only in the Authorization header and is never returned, logged or
 * placed in an error. Only plain JSON values go in and out.
 */
export async function runScriptFunction(
  http: HttpClient,
  request: {
    /** The script ID, or a deployment ID. */
    readonly scriptId: string;
    readonly accessToken: string;
    readonly functionName: string;
    readonly parameters: readonly unknown[];
  },
): Promise<RunOutcome> {
  let response: HttpResponse;
  try {
    response = await http(`${SCRIPTS_RUN}/${encodeURIComponent(request.scriptId)}:run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${request.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ function: request.functionName, parameters: request.parameters, devMode: false }),
    });
  } catch {
    return { status: "network" };
  }

  if (response.status === 401) return { status: "unauthorised" };
  if (response.status === 403) return { status: "forbidden" };
  if (response.status === 404) return { status: "not-found" };
  if (response.status === 429 || response.status >= 500) return { status: "unavailable" };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "unexpected" };
  }
  const operation = record(body);
  if (operation === null) return { status: "unexpected" };

  if (response.status === 200 || response.status === 201) {
    const error = record(operation["error"]);
    if (error !== null) return { status: "script-error", message: scriptErrorMessage(error) };
    const payload = record(operation["response"]);
    if (payload !== null && "result" in payload) return { status: "ok", result: payload["result"] };
    return { status: "unexpected" };
  }
  // Other client errors (for example a bad request) carry no useful, safe detail.
  return { status: "unexpected" };
}

export type CheckSummary =
  | { readonly kind: "ready"; readonly statements: number; readonly revision: string; readonly ignoredTrailingRows: number }
  | { readonly kind: "damaged"; readonly message: string }
  | { readonly kind: "workbook-unavailable" }
  | { readonly kind: "refused"; readonly message: string }
  | { readonly kind: "unrecognised" };

/**
 * Reads the service's answer to the check operation. The answer is untrusted input
 * like any other: only the fields used are read, and anything unexpected is
 * reported as unrecognised rather than guessed at.
 */
export function summariseCheck(result: unknown): CheckSummary {
  const answer = record(result);
  if (answer === null) return { kind: "unrecognised" };
  if (answer["ok"] === false) {
    return answer["error"] === "unavailable"
      ? { kind: "workbook-unavailable" }
      : { kind: "refused", message: typeof answer["message"] === "string" ? answer["message"].slice(0, 200) : "The request was refused." };
  }
  const value = record(answer["value"]);
  if (answer["ok"] !== true || value === null) return { kind: "unrecognised" };
  if (value["status"] === "damaged") {
    return { kind: "damaged", message: typeof value["message"] === "string" ? value["message"].slice(0, 200) : "The ledger is damaged." };
  }
  const state = record(value["state"]);
  if (value["status"] !== "ok" || state === null || !Array.isArray(state["snapshots"]) || typeof state["revision"] !== "string") {
    return { kind: "unrecognised" };
  }
  const ignored = value["ignoredTrailingRows"];
  return {
    kind: "ready",
    statements: (state["snapshots"] as unknown[]).length,
    revision: state["revision"],
    ignoredTrailingRows: typeof ignored === "number" ? ignored : 0,
  };
}
