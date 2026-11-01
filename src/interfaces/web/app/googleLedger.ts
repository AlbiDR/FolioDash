import { commitRemote, readRemoteCommandOutcome, readRemoteLedger } from "../../../adapters/google/LedgerClient";
import type { ConnectionConfig } from "../features/connection/ConnectionModel";
import type { CheckResult, RecordResult, RemoteSave } from "../features/import/ImportModel";
import { type GoogleDeps, SPREADSHEETS_SCOPE, browserGoogleDeps } from "./googleConnection";
import type { SignInResult } from "./googleIdentity";

const SIGN_IN_TEXT: Readonly<Record<Extract<SignInResult, { ok: false }>["reason"], string>> = {
  denied: "Permission was declined, so nothing was saved.",
  closed: "The sign-in window was closed, so nothing was saved.",
  unavailable: "Google sign-in could not start, so nothing was saved.",
};

const NOT_SENT_TEXT = {
  unauthorised: "Google rejected the sign-in token, so nothing was saved. Try again.",
  forbidden: "Google refused the call, so nothing was saved. Check the Connection page.",
  "not-found": "The script was not found, so nothing was saved. Check the Connection page.",
} as const;

/**
 * The composition root's save port for one connected spreadsheet. Each action
 * signs in for a short-lived token, used for that action only. A save is
 * followed by a read of the spreadsheet, so what the screen shows is what the
 * spreadsheet holds, not what the browser assumed.
 */
export function createRemoteSave(
  deps: GoogleDeps,
  config: ConnectionConfig,
  newCommandId: () => string,
  now: () => number = Date.now,
): RemoteSave {
  // A token is reused only while Google says it is valid (with a margin), so a run of saves asks once. It lives in
  // this closure's memory and is never stored.
  let cached: { readonly accessToken: string; readonly validUntil: number } | null = null;
  async function signInOnce(): Promise<SignInResult> {
    if (cached !== null && now() < cached.validUntil) return { ok: true, accessToken: cached.accessToken };
    const result = await deps.signIn(config.clientId, SPREADSHEETS_SCOPE);
    cached = result.ok && result.expiresInSeconds !== undefined ? { accessToken: result.accessToken, validUntil: now() + (result.expiresInSeconds - 120) * 1000 } : null;
    return result;
  }
  const target = (accessToken: string) => ({ scriptId: config.scriptId, workbookId: config.workbookId, accessToken });

  return {
    newCommandId,

    async record(request, commandId, expectedRevision): Promise<RecordResult> {
      const signedIn = await signInOnce();
      if (!signedIn.ok) return { status: "not-saved", message: SIGN_IN_TEXT[signedIn.reason] };
      const commit = await commitRemote(deps.http, target(signedIn.accessToken), {
        commandId,
        expectedRevision,
        statement: request.statement,
        date: request.date,
        commands: request.commands,
      });
      switch (commit.status) {
        case "committed":
        case "already-committed": {
          const read = await readRemoteLedger(deps.http, target(signedIn.accessToken));
          return read.status === "ok" ? { status: "recorded", ledger: read.state } : { status: "saved-not-reloaded" };
        }
        case "stale":
          return { status: "stale" };
        case "rejected":
          return { status: "rejected", messages: commit.messages };
        case "damaged":
          return { status: "damaged", message: commit.message };
        case "not-committed":
          return { status: "not-saved", message: commit.message };
        case "not-sent":
          return { status: "not-saved", message: NOT_SENT_TEXT[commit.failure] };
        case "refused":
          return { status: "not-saved", message: commit.message };
        case "unknown":
          return { status: "unknown", message: commit.message };
      }
    },

    async check(commandId): Promise<CheckResult> {
      const signedIn = await signInOnce();
      if (!signedIn.ok) return { status: "cannot-tell", message: SIGN_IN_TEXT[signedIn.reason].replace(", so nothing was saved", "") };
      const outcome = await readRemoteCommandOutcome(deps.http, target(signedIn.accessToken), commandId);
      switch (outcome.status) {
        case "not-found":
          return { status: "not-recorded" };
        case "damaged":
          return { status: "cannot-tell", message: `${outcome.message} Do not record anything until it is restored.` };
        case "unreachable":
          return { status: "cannot-tell", message: "The spreadsheet could not be checked. Try again shortly." };
        case "committed": {
          const read = await readRemoteLedger(deps.http, target(signedIn.accessToken));
          return read.status === "ok" ? { status: "recorded", ledger: read.state } : { status: "saved-not-reloaded" };
        }
      }
    },
  };
}

export function browserRemoteSave(config: ConnectionConfig): RemoteSave {
  return createRemoteSave(browserGoogleDeps, config, () => crypto.randomUUID());
}
