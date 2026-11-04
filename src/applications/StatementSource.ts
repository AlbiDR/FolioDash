import type { FundCommand } from "../core/ImportPlan";
import type { IsoDate } from "../core/IsoDate";
import type { StoredSheet } from "../core/RawSheet";

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
