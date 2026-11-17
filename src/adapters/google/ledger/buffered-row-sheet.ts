import { type LedgerRow, type RowSheet, RowLedgerStore } from "../../ledger/row-ledger-store";

/**
 * A sheet held in memory: the rows already stored, plus whatever the ledger rules
 * add during one save. Nothing leaves memory until the save is complete, and then
 * it goes out as one request, so a save is recorded whole or not at all.
 */
export class BufferedRowSheet implements RowSheet {
  private readonly stored: readonly LedgerRow[];
  private readonly added: LedgerRow[] = [];

  constructor(stored: readonly LedgerRow[]) {
    this.stored = stored;
  }

  readRows(): readonly LedgerRow[] {
    return [...this.stored, ...this.added];
  }

  appendRows(rows: readonly LedgerRow[]): void {
    this.added.push(...rows);
  }

  flush(): void {
    // Nothing is durable until the whole save is sent; see commitDirect.
  }

  get pending(): readonly LedgerRow[] {
    return this.added;
  }
}

export function storeOf(rows: readonly LedgerRow[]): {
  readonly sheet: BufferedRowSheet;
  readonly store: RowLedgerStore;
} {
  const sheet = new BufferedRowSheet(rows);
  return { sheet, store: new RowLedgerStore(sheet) };
}
