import type { HttpClient } from "../../../adapters/google/ScriptsRun";
import { readRemoteLedger } from "../../../adapters/google/LedgerClient";
import type { ConnectionPort, ConnectionResult } from "../features/connection/ConnectionModel";
import { type SignInResult, signIn } from "./googleIdentity";

/** Only spreadsheet access, the one scope the pushed script's manifest asks for. */
export const SPREADSHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export type GoogleDeps = {
  readonly signIn: (clientId: string, scope: string) => Promise<SignInResult>;
  readonly http: HttpClient;
};

/** The real dependencies, using the browser's sign-in and fetch. */
export const browserGoogleDeps: GoogleDeps = {
  signIn,
  http: async (url, init) => {
    const response = await fetch(url, init);
    return { status: response.status, json: () => response.json() as Promise<unknown> };
  },
};

/**
 * The composition root's connection port: sign in as the user, then call the
 * service's check operation. It reads and returns the ledger it found, and
 * writes nothing.
 */
export function createConnectionPort(deps: GoogleDeps): ConnectionPort {
  return async (config, onStep): Promise<ConnectionResult> => {
    onStep("signing-in");
    const signedIn = await deps.signIn(config.clientId, SPREADSHEETS_SCOPE);
    if (!signedIn.ok) return { status: "sign-in-failed", reason: signedIn.reason };

    onStep("calling-service");
    const read = await readRemoteLedger(
      deps.http,
      { scriptId: config.scriptId, workbookId: config.workbookId, accessToken: signedIn.accessToken },
      "foliodashCheck",
    );
    switch (read.status) {
      case "ok":
        return { status: "connected", statements: read.state.snapshots.length, ignoredTrailingRows: read.ignoredTrailingRows, ledger: read.state };
      case "damaged":
        return { status: "ledger-damaged", message: read.message };
      case "workbook-unavailable":
        return { status: "workbook-unavailable" };
      case "refused":
        return { status: "refused", message: read.message };
      case "call-failed":
        return { status: "call-failed", failure: read.failure, message: read.message };
      case "unrecognised":
        return { status: "unrecognised-answer" };
    }
  };
}

/** The real port. */
export const connectToGoogle: ConnectionPort = createConnectionPort(browserGoogleDeps);
