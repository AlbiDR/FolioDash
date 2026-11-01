import type { LedgerState } from "../../../../core/Ledger";

export interface ConnectionConfig {
  /** The Google OAuth client ID of the web application. Public by design. */
  readonly clientId: string;
  /** The Apps Script project ID, or the ID of its API-executable deployment. */
  readonly scriptId: string;
  /** The spreadsheet that holds (or will hold) the ledger. */
  readonly workbookId: string;
}

export type ConnectionStep = "signing-in" | "calling-service";

export type CallFailure = "unauthorised" | "forbidden" | "not-found" | "unavailable" | "network" | "script-error" | "unexpected";

export type ConnectionResult =
  | { readonly status: "connected"; readonly statements: number; readonly ignoredTrailingRows: number; readonly ledger: LedgerState }
  | { readonly status: "ledger-damaged"; readonly message: string }
  | { readonly status: "workbook-unavailable" }
  | { readonly status: "sign-in-failed"; readonly reason: "denied" | "closed" | "unavailable" }
  | { readonly status: "call-failed"; readonly failure: CallFailure; readonly message: string | null }
  | { readonly status: "unrecognised-answer" }
  | { readonly status: "refused"; readonly message: string };

/** Signs in and calls the service's check operation. It returns the ledger it found and writes nothing. */
export type ConnectionPort = (config: ConnectionConfig, onStep: (step: ConnectionStep) => void) => Promise<ConnectionResult>;

/** Where the three IDs may be remembered on this device, if the user chooses. */
export interface ConnectionStorage {
  load(): ConnectionConfig | null;
  save(config: ConnectionConfig): void;
  clear(): void;
}
