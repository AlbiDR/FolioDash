import type { LedgerState } from "../core/Ledger";
import type { RebuildReport } from "./Rebuild";

export interface Workbook {
  readonly id: string;
  readonly url: string;
}

/** Why a call failed before or instead of an answer. A subset applies to any one route. */
export type CallFailure = "unauthorised" | "forbidden" | "not-found" | "unavailable" | "network" | "unexpected" | "script-error";

/** "" lets Google reuse an existing grant and session; "select_account" always shows its account chooser. */
export type SignInPrompt = "" | "select_account";

export interface SignInOptions {
  readonly prompt?: SignInPrompt;
  /** The remembered account (an email address), so Google can skip its account chooser. */
  readonly loginHint?: string;
}

export type SignInFailure = "denied" | "closed" | "blocked" | "timeout" | "unavailable";

export type SignInResult =
  | { readonly ok: true; readonly accessToken: string; /** How long Google says the token lasts, when it said. */ readonly expiresInSeconds?: number }
  | { readonly ok: false; readonly reason: SignInFailure };

/** Short-lived Google access kept on this device, bound to the connected workbook. */
export interface GoogleSession {
  readonly clientId: string;
  readonly workbookId: string;
  readonly scope: string;
  readonly accessToken: string;
  readonly validUntil: number;
}

export interface GoogleSessionStore {
  load(clientId: string, workbookId: string, now: number): GoogleSession | null;
  save(value: GoogleSession): void;
  /** Removes whatever is kept. */
  clear(): void;
  /** Removes the kept access only if it is this one, so a newer one renewed by another window survives. */
  discard(accessToken: string): void;
}

/** The Google account that owns the person's workbook, so Google can skip its account chooser. Not a credential. */
export interface AccountHintStore {
  load(clientId: string): string | null;
  save(clientId: string, hint: string): void;
  clear(): void;
}

/** How windows of the same browser avoid opening competing Google pop-ups. */
export interface RenewalCoordination {
  /** Another window is renewing Google access right now. */
  heldElsewhere(): boolean;
  claim(): void;
  release(): void;
  /** Tells other windows this device was forgotten, so none of them writes a credential back. */
  announceForgotten(): void;
}

/** Where the person's data stands on this device. */
export type Mode =
  /** Nothing is stored here and nobody is signed in. */
  | "signed-out"
  /** A saved copy is on this device, not yet confirmed against the spreadsheet in this visit. */
  | "device-copy"
  /** Signed in during this visit and in step with the spreadsheet. */
  | "online";

/** What the last look at the spreadsheet showed. The device copy is never overwritten by a bad answer. */
export type SheetStatus =
  | "unchecked"
  | "ok"
  /** The spreadsheet cannot be opened: deleted, trashed or no longer shared with this app. */
  | "missing"
  /** The spreadsheet is reachable but holds no statements while this device has some. */
  | "emptied"
  | "damaged"
  | "not-a-ledger";

export interface SessionState {
  readonly mode: Mode;
  /**
   * checking: a read of the spreadsheet is in flight. connected: the last read succeeded.
   * waiting: no usable Google access, and the next click renews it quietly.
   * renewing: Google's window is open. reconnect: quiet renewal gave up, so the person is asked.
   */
  readonly connection?: "checking" | "connected" | "waiting" | "renewing" | "reconnect" | "offline";
  readonly ledger: LedgerState;
  readonly workbook: Workbook | null;
  /** When the ledger was last confirmed against the spreadsheet, in milliseconds since 1970. */
  readonly syncedAt: number | null;
  readonly sheet: SheetStatus;
  /** Rows after the last commit: an interrupted write, ignored and harmless. */
  readonly trailingRows: number;
}

export type ConnectOutcome =
  /** A newer check or account transition replaced this read; no authentication rejection is implied. */
  | { readonly status: "superseded" }
  | { readonly status: "connected"; readonly created: boolean; readonly statements: number; readonly changed: boolean }
  | { readonly status: "sign-in-failed"; readonly reason: Extract<SignInResult, { ok: false }>["reason"] }
  | { readonly status: "call-failed"; readonly failure: CallFailure }
  /** The sheet needs the person's attention; the device copy was left exactly as it was. */
  | { readonly status: "needs-attention"; readonly sheet: Exclude<SheetStatus, "unchecked" | "ok">; readonly message: string };

export type RestoreOutcome =
  | { readonly status: "restored"; readonly workbook: Workbook }
  | { readonly status: "sign-in-failed"; readonly reason: Extract<SignInResult, { ok: false }>["reason"] }
  | { readonly status: "nothing-to-restore" }
  | { readonly status: "not-needed" }
  | { readonly status: "failed"; readonly message: string };

export type VerifyOutcome =
  | { readonly status: "checked"; readonly report: RebuildReport }
  | { readonly status: "sign-in-failed"; readonly reason: Extract<SignInResult, { ok: false }>["reason"] }
  | { readonly status: "needs-attention"; readonly message: string }
  | { readonly status: "failed"; readonly message: string };

export type TidyOutcome =
  | { readonly status: "tidied"; readonly months: number; readonly withoutStatement: number }
  | { readonly status: "sign-in-failed"; readonly reason: Extract<SignInResult, { ok: false }>["reason"] }
  | { readonly status: "needs-attention"; readonly message: string }
  | { readonly status: "failed"; readonly message: string };
