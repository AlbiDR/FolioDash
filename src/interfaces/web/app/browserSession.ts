import type { RestClient } from "../../../adapters/google/Rest";
import { browserLedgerCache, createLedgerCache } from "../../../adapters/browser/LedgerCache";
import { presentStatement } from "../../../adapters/fideuram/FideuramPresentation";
import { interpretStatement } from "./interpretStatement";
import { Session } from "./session";
import { revokeToken, signIn } from "../../../adapters/browser/GoogleIdentity";

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
    present: presentStatement,
    signIn,
    revoke: revokeToken,
    rest: browserRest,
    cache: __SYNTHETIC_ACCEPTANCE__ ? createLedgerCache(() => window.localStorage, "foliodash.synthetic-acceptance.ledger.v1") : browserLedgerCache,
    ...(__SYNTHETIC_ACCEPTANCE__ ? { workbookIdentity: { title: "FolioDash SYNTHETIC ACCEPTANCE", propertyKey: "foliodash-synthetic-acceptance", propertyValue: "ledger-v1" } } : {}),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  });
}
