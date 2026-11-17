import type { FundCommand } from "../core/import-plan";
import type { IsoDate } from "../core/iso-date";
import type { StoredSheet } from "../core/raw-sheet";

/**
 * What is kept for one month beside the ledger: the exact bank statement and the
 * decisions made about it. With these the ledger can be rebuilt from scratch.
 */
export interface SourceRecord {
  readonly date: IsoDate;
  readonly commandId: string;
  readonly sheetName: string;
  readonly commands: readonly FundCommand[];
  readonly sheet: StoredSheet;
}
