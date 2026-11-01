import type { IsoDate } from "../../../../core/IsoDate";
import type { EuroCents } from "../../../../core/Money";
import type { DateCandidate } from "../../../../core/StatementDate";

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
  readonly outcome: SheetOutcome;
}

export type ImportReview =
  | { readonly status: "unreadable-file"; readonly message: string }
  /** `sheets` holds every sheet that looks like a bank holdings sheet; it may be empty. */
  | { readonly status: "reviewed"; readonly sheets: readonly ReviewedSheet[]; readonly dateCandidate: DateCandidate | null };

/** Reads and checks a file entirely in the browser. Nothing is saved or sent anywhere. */
export type ImportPreparer = (file: ImportFile) => Promise<ImportReview>;

export type { IsoDate };
