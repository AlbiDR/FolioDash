import { createGoogleSessionStore } from "../../../adapters/browser/GoogleSession";
import type { RestClient } from "../../../adapters/google/Rest";
import { browserLedgerCache, createLedgerCache } from "../../../adapters/browser/LedgerCache";
import { presentStatement } from "../../../adapters/fideuram/FideuramPresentation";
import { interpretStatement } from "./interpretStatement";
import { Session } from "./session";
import { revokeToken, signIn } from "../../../adapters/browser/GoogleIdentity";
import { createExpenseCache } from "../../../adapters/browser/ExpenseCache";

const GOOGLE_REQUEST_TIMEOUT_MILLISECONDS = 30_000;

/** The browser's own way to reach Google: its fetch, with no cookies or credentials of ours attached. */
const browserRest: RestClient = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body === undefined ? {} : { body: request.body }),
    credentials: "omit",
    signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MILLISECONDS),
    cache: "no-store",
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
    googleSession: createGoogleSessionStore(() => window.sessionStorage, __SYNTHETIC_ACCEPTANCE__ ? "foliodash.synthetic-acceptance.google-session.v1" : "foliodash.google-session.v1"),
    rest: browserRest,
    cache: __SYNTHETIC_ACCEPTANCE__ ? createLedgerCache(() => window.localStorage, "foliodash.synthetic-acceptance.ledger.v1") : browserLedgerCache,
    expenseCache: createExpenseCache(() => window.localStorage, __SYNTHETIC_ACCEPTANCE__ ? "foliodash.synthetic-acceptance.expenses.v1" : "foliodash.expenses.v1"),
    ...(__SYNTHETIC_ACCEPTANCE__ ? { workbookIdentity: { title: "FolioDash SYNTHETIC ACCEPTANCE", propertyKey: "foliodash-synthetic-acceptance", propertyValue: "ledger-v1" } } : {}),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  });
}
