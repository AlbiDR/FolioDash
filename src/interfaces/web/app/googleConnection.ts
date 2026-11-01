import { type HttpClient, runScriptFunction, summariseCheck } from "../../../adapters/google/ScriptsRun";
import type { CallFailure, ConnectionPort, ConnectionResult } from "../features/connection/ConnectionModel";
import { type SignInResult, signIn } from "./googleIdentity";

/** Only spreadsheet access, the one scope the pushed script's manifest asks for. */
export const SPREADSHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/**
 * The composition root's connection port: sign in as the user, then call the
 * service's check operation. It reads, and writes nothing.
 */
export function createConnectionPort(deps: {
  readonly signIn: (clientId: string, scope: string) => Promise<SignInResult>;
  readonly http: HttpClient;
}): ConnectionPort {
  return async (config, onStep): Promise<ConnectionResult> => {
    onStep("signing-in");
    const signedIn = await deps.signIn(config.clientId, SPREADSHEETS_SCOPE);
    if (!signedIn.ok) return { status: "sign-in-failed", reason: signedIn.reason };

    onStep("calling-service");
    const outcome = await runScriptFunction(deps.http, {
      scriptId: config.scriptId,
      accessToken: signedIn.accessToken,
      functionName: "foliodashCheck",
      parameters: [config.workbookId],
    });
    if (outcome.status !== "ok") {
      const failure: CallFailure = outcome.status;
      return { status: "call-failed", failure, message: outcome.status === "script-error" ? outcome.message : null };
    }

    const summary = summariseCheck(outcome.result);
    switch (summary.kind) {
      case "ready":
        return { status: "connected", statements: summary.statements, ignoredTrailingRows: summary.ignoredTrailingRows };
      case "damaged":
        return { status: "ledger-damaged", message: summary.message };
      case "workbook-unavailable":
        return { status: "workbook-unavailable" };
      case "refused":
        return { status: "refused", message: summary.message };
      case "unrecognised":
        return { status: "unrecognised-answer" };
    }
  };
}

/** The real port, using the browser's sign-in and fetch. */
export const connectToGoogle: ConnectionPort = createConnectionPort({
  signIn,
  http: async (url, init) => {
    const response = await fetch(url, init);
    return { status: response.status, json: () => response.json() as Promise<unknown> };
  },
});
