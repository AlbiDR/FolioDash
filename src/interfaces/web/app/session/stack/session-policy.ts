import type {
  AccountHintStore,
  GoogleSessionStore,
  RenewalCoordination,
  SheetStatus,
  SignInOptions,
  SignInResult,
} from "../../../../../applications/session/session-model";
import type { PresentStatement } from "../../../../../adapters/google/direct-ledger";
import type { RestClient } from "../../../../../adapters/google/rest";
import type { WorkbookIdentity } from "../../../../../adapters/google/google-workbook";
import type { InterpretStatement } from "../../../../../applications/import/rebuild";
import type { LedgerCache } from "../../../../../adapters/browser/storage/ledger-cache";
import type { ExpenseCache } from "../../../../../adapters/browser/storage/expense-cache";
import type { RevisionPendingStore } from "../../../../../adapters/browser/storage/revision-pending";
import type { CheckpointLock, CheckpointStore } from "../../../../../adapters/browser/storage/checkpoint-store";

/** The narrow permission: only files this app creates or the person opens with it. */
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export interface SessionDeps {
  readonly clientId: string;
  readonly googleSession?: GoogleSessionStore;
  /** Which Google account owns the workbook, so quiet renewal can name it. */
  readonly accountHint?: AccountHintStore;
  /** Keeps several windows of one browser from opening competing Google windows. */
  readonly coordination?: RenewalCoordination;
  readonly workbookIdentity?: WorkbookIdentity;
  /** Re-reads a stored bank statement with today's reader, to prove the ledger can be rebuilt from them. */
  readonly interpret: InterpretStatement;
  /** How a statement is shown in its tab of the person's spreadsheet. */
  readonly present: PresentStatement;
  readonly signIn: (clientId: string, scope: string, options?: SignInOptions) => Promise<SignInResult>;
  readonly revoke?: (accessToken: string) => void;
  readonly rest: RestClient;
  readonly cache: LedgerCache;
  readonly expenseCache?: ExpenseCache;
  /** Where this build keeps its value-only checkpoint copies and unsent commands. Without it they live only in memory. */
  readonly checkpointStore?: CheckpointStore;
  /** Keeps two windows from saving a checkpoint at once. Without it checkpoints can be read but not saved. */
  readonly checkpointLock?: CheckpointLock;
  readonly revisionPending?: RevisionPendingStore;
  readonly now: () => number;
  readonly newId: () => string;
  /** How long to wait for quiet before writing the readable tabs, so a run of saves writes them once. */
  readonly quietMilliseconds?: number;
}

/**
 * A save reads, appends and reads back. It needs this much left so Google's expiry cannot fall
 * between those requests and leave an outcome unknown. Reads need no more than a valid token.
 */
export const WRITE_MINIMUM_MILLISECONDS = 8 * 60_000;

export const NEEDS: Readonly<Record<Exclude<SheetStatus, "unchecked" | "ok">, string>> = {
  missing:
    "Your Google Sheet can no longer be opened. It may have been deleted or moved to the bin. This device still has your saved copy.",
  emptied: "Your Google Sheet holds no statements, but this device still has your saved copy.",
  damaged:
    "Your Google Sheet's records failed their checks, so they were not used. This device still has your saved copy. Nothing was changed.",
  "not-a-ledger": "The spreadsheet found is not a FolioDash ledger, so it was not changed.",
};

export const SIGN_IN_TEXT: Readonly<Record<Extract<SignInResult, { ok: false }>["reason"], string>> = {
  blocked: "The Google window was blocked. Allow pop-ups for this site and try again; nothing was saved.",
  timeout: "Google sign-in took too long. Close the old Google window and try again; nothing was saved.",
  denied: "Permission was declined, so nothing was saved.",
  closed: "The sign-in window was closed, so nothing was saved.",
  unavailable: "Google sign-in could not start, so nothing was saved.",
};

export const NOT_SENT_TEXT = {
  unauthorised: "Google rejected the sign-in, so nothing was saved. Try again.",
  forbidden:
    "Google refused the request, so nothing was saved. Check that you allowed FolioDash to create and manage its own spreadsheet.",
  "not-found": "The spreadsheet could not be opened, so nothing was saved. Open Your data to check it.",
} as const;
