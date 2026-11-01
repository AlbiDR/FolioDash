import type { RestClient } from "../../../adapters/google/Rest";
import { browserLedgerCache } from "./ledgerCache";
import { interpretStatement } from "./interpretStatement";
import { Session } from "./session";
import { revokeToken, signIn } from "./googleIdentity";

/** The browser's own way to reach Google: its fetch, with no cookies or credentials of ours attached. */
const browserRest: RestClient = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body === undefined ? {} : { body: request.body }),
    credentials: "omit",
  });
  return { status: response.status, json: () => response.json() as Promise<unknown> };
};

export function createBrowserSession(clientId: string): Session {
  return new Session({
    clientId,
    interpret: interpretStatement,
    signIn,
    revoke: revokeToken,
    rest: browserRest,
    cache: browserLedgerCache,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  });
}
