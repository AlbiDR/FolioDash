/** The part of `fetch` the Google calls need, so everything built on it is testable without a network. */
export interface RestRequest {
  readonly method: "GET" | "POST" | "PUT" | "PATCH";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface RestResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

export type RestClient = (request: RestRequest) => Promise<RestResponse>;

export type RestFailure =
  /** The token is missing, expired or revoked. Nothing was done. */
  | "unauthorised"
  /** Google refused: the permission was not granted, or a quota was hit. Nothing was done. */
  | "forbidden"
  /** The spreadsheet does not exist or this app may not open it. */
  | "not-found"
  /** Google asked for a later retry. The request may or may not have been applied. */
  | "unavailable"
  /** No answer was received. The request may or may not have been applied. */
  | "network"
  | "unexpected";

export type RestResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: RestFailure };

/** Whether a failed call is known not to have changed anything. A lost answer is not such a failure. */
export function wroteNothing(failure: RestFailure): boolean {
  return failure === "unauthorised" || failure === "forbidden" || failure === "not-found" || failure === "unexpected";
}

/**
 * Sends one authorised request and sorts the answer into a typed result. The
 * token travels only in the Authorization header and is never returned, logged
 * or placed in an error.
 */
export async function callRest(
  rest: RestClient,
  accessToken: string,
  request: { readonly method: RestRequest["method"]; readonly url: string; readonly body?: unknown },
): Promise<RestResult<unknown>> {
  let response: RestResponse;
  try {
    response = await rest({
      method: request.method,
      url: request.url,
      headers: { Authorization: `Bearer ${accessToken}`, ...(request.body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
  } catch {
    return { ok: false, failure: "network" };
  }
  if (response.status === 401) return { ok: false, failure: "unauthorised" };
  if (response.status === 403) return { ok: false, failure: "forbidden" };
  if (response.status === 404) return { ok: false, failure: "not-found" };
  if (response.status === 429 || response.status >= 500) return { ok: false, failure: "unavailable" };
  if (response.status < 200 || response.status >= 300) return { ok: false, failure: "unexpected" };
  try {
    return { ok: true, value: await response.json() };
  } catch {
    // A success status with an unreadable body: the change may have been applied, so treat the answer as lost.
    return { ok: false, failure: "network" };
  }
}
