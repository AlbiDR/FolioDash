import type { FundCommand, StatementInput } from "../core/ImportPlan";
import type { IsoDate } from "../core/IsoDate";
import type { LedgerState } from "../core/Ledger";
import type { RawSheet } from "../core/RawSheet";
import type { AttachItem, StatementSource } from "./LedgerService";
import type { EuroCents } from "../core/Money";
import type { DateCandidate } from "../core/StatementDate";

/** A file the user chose, as the screen needs it. Wrapping the browser's File keeps the logic testable. */
export interface ImportFile {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number | null;
  read(): Promise<Uint8Array>;
}

export interface ReviewFund {
  readonly isin: string;
  readonly name: string;
  readonly marketValue: EuroCents;
}

export interface ReviewCategory {
  readonly label: string;
  readonly subtotal: EuroCents | null;
  readonly tracked: boolean;
}

export interface ReviewAdjustment {
  readonly cell: string | null;
  readonly message: string;
}

export interface ReviewIssue {
  readonly code: string;
  readonly cell: string | null;
  readonly message: string;
}

export interface ReviewStatement {
  readonly funds: readonly ReviewFund[];
  readonly fundsSubtotal: EuroCents;
  readonly categories: readonly ReviewCategory[];
  readonly total: EuroCents | null;
  readonly adjustments: readonly ReviewAdjustment[];
}

export type SheetOutcome =
  | { readonly ok: true; readonly statement: ReviewStatement }
  | { readonly ok: false; readonly issues: readonly ReviewIssue[] };

export interface ReviewedSheet {
  readonly name: string;
  /** A date proposed from this sheet's name; never the workbook's creation date. */
  readonly dateCandidate?: IsoDate | null;
  readonly outcome: SheetOutcome;
  /** The sheet exactly as read from the file, kept with the month it becomes. */
  readonly raw: RawSheet;
}

export type ImportReview =
  | { readonly status: "unreadable-file"; readonly message: string }
  /** `sheets` holds every sheet that looks like a bank holdings sheet; it may be empty. */
  | {
      readonly status: "reviewed";
      readonly sheets: readonly ReviewedSheet[];
      readonly dateCandidate: DateCandidate | null;
      readonly workbookSheetCount?: number;
      readonly ignoredSheets?: readonly string[];
    };

/** Reads and checks a file entirely in the browser. Nothing is saved or sent anywhere. */
export type ImportPreparer = (file: ImportFile) => Promise<ImportReview>;

export type { IsoDate };

/** What the user reviewed and confirmed, before it is saved. */
export interface RecordRequest {
  readonly date: IsoDate;
  readonly statement: StatementInput;
  readonly commands: readonly FundCommand[];
  /** The bank statement behind this month, saved beside it so the ledger can always be rebuilt. */
  readonly source?: StatementSource;
}

export type RecordResult =
  /** Saved to the spreadsheet and read back; `ledger` is what the spreadsheet now holds. */
  | { readonly status: "recorded"; readonly ledger: LedgerState }
  /** Saved, but the ledger could not be read back afterwards. */
  | { readonly status: "saved-not-reloaded" }
  /** Known not to have been saved, so trying again is safe. */
  | { readonly status: "not-saved"; readonly message: string }
  /** The reviewed ledger is no longer the current one. Nothing was saved. */
  | { readonly status: "stale" }
  | { readonly status: "rejected"; readonly messages: readonly string[] }
  | { readonly status: "damaged"; readonly message: string }
  /** The save may or may not have happened. Check before trying again. */
  | { readonly status: "unknown"; readonly message: string };

export type CheckResult =
  | { readonly status: "recorded"; readonly ledger: LedgerState }
  | { readonly status: "saved-not-reloaded" }
  /** The ledger shows this save did not happen, so trying again is safe. */
  | { readonly status: "not-recorded" }
  | { readonly status: "cannot-tell"; readonly message: string };

/** Saves to the user's own Google spreadsheet. Offered only once the user has connected. */
export interface RemoteSave {
  newCommandId(): string;
  record(request: RecordRequest, commandId: string, expectedRevision: string): Promise<RecordResult>;
  /** Resolves a save whose result was lost, without writing anything. */
  check(commandId: string): Promise<CheckResult>;
  /**
   * Adds bank statements to months that are already saved, in one request. Nothing
   * saved changes, and a statement that does not reproduce its month is refused.
   */
  attach(items: readonly AttachItem[], commandId: string, expectedRevision: string): Promise<RecordResult>;
  /** The months that already have a stored bank statement, or null when they could not be read. */
  statementDates(): Promise<ReadonlySet<IsoDate> | null>;
}
