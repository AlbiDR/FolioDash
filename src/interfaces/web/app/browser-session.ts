import { createGoogleSessionStore } from "../../../adapters/browser/google-session";
import type { RestClient } from "../../../adapters/google/rest";
import { browserLedgerCache, createLedgerCache } from "../../../adapters/browser/ledger-cache";
import { presentStatement } from "../../../adapters/fideuram/fideuram-presentation";
import { interpretStatement } from "./interpret-statement";
import { Session } from "./session";
import { revokeToken, signIn } from "../../../adapters/browser/google-identity";
import { createExpenseCache } from "../../../adapters/browser/expense-cache";
import { createRevisionPendingStore } from "../../../adapters/browser/revision-pending";
import { createAccountHintStore } from "../../../adapters/browser/connection-memory";
import { createDurableStore } from "../../../adapters/browser/durable-store";
import { type SharedConnectionHandlers, createSharedConnection } from "../../../adapters/browser/tab-coordination";
import { createCheckpointLock, createCheckpointStore } from "../../../adapters/browser/checkpoint-store";

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

// The synthetic acceptance build keeps its own keys, so it can never read or wipe the normal connection.
const PREFIX = __SYNTHETIC_ACCEPTANCE__ ? "foliodash.synthetic-acceptance." : "foliodash.";
const KEYS = {
  access: `${PREFIX}google-session.v1`,
  hint: `${PREFIX}account-hint.v1`,
  claim: `${PREFIX}google-renewal-claim.v1`,
  forgotten: `${PREFIX}device-forgotten.v1`,
} as const;

/** Identifies this window to the others of the same browser. */
const WINDOW_ID = crypto.randomUUID();

/**
 * The connection is kept on the device for as long as the browser allows: local storage, so a
 * new tab, a restart or the installed app still finds it, then this tab's storage, then memory.
 */
const durable = createDurableStore([() => window.localStorage, () => window.sessionStorage]);

const shared = createSharedConnection({
  open: () => window.localStorage,
  keys: KEYS,
  windowId: WINDOW_ID,
  now: () => Date.now(),
  source: window,
});

export function createBrowserSession(clientId: string): Session {
  return new Session({
    clientId,
    interpret: interpretStatement,
    present: presentStatement,
    signIn,
    revoke: revokeToken,
    googleSession: createGoogleSessionStore(() => durable, KEYS.access),
    accountHint: createAccountHintStore(() => durable, KEYS.hint),
    coordination: shared,
    rest: browserRest,
    cache: __SYNTHETIC_ACCEPTANCE__
      ? createLedgerCache(() => window.localStorage, "foliodash.synthetic-acceptance.ledger.v1")
      : browserLedgerCache,
    revisionPending: createRevisionPendingStore(() => window.localStorage, `${PREFIX}revision-pending.v1.`),
    // Checkpoint copies, receipts and the cross-window lock all carry the build prefix, so the synthetic build never meets real ones.
    checkpointStore: createCheckpointStore(() => window.localStorage, PREFIX),
    checkpointLock: createCheckpointLock(
      `${PREFIX}checkpoints`,
      typeof navigator === "undefined" ? undefined : navigator.locks,
    ),
    expenseCache: createExpenseCache(
      () => window.localStorage,
      __SYNTHETIC_ACCEPTANCE__ ? "foliodash.synthetic-acceptance.expenses.v1" : "foliodash.expenses.v1",
    ),
    ...(__SYNTHETIC_ACCEPTANCE__
      ? {
          workbookIdentity: {
            title: "FolioDash SYNTHETIC ACCEPTANCE",
            propertyKey: "foliodash-synthetic-acceptance",
            propertyValue: "ledger-v1",
          },
        }
      : {}),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  });
}

/** Listens for the other windows of this browser: newer Google access to adopt, or a device that was forgotten. */
export function watchOtherWindows(handlers: SharedConnectionHandlers): () => void {
  return shared.watch(handlers);
}
