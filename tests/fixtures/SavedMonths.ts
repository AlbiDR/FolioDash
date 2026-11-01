import { interpretFideuramSheet } from "../../src/adapters/fideuram/FideuramLayout";
import { type LedgerRow, type RowSheet, RowLedgerStore } from "../../src/adapters/ledger/RowLedgerStore";
import { type CommitRequest, type ServiceEnvironment, commitStatement } from "../../src/applications/LedgerService";
import type { InterpretStatement } from "../../src/applications/Rebuild";
import { type FundCommand, planImport } from "../../src/core/ImportPlan";
import { type IsoDate, parseIsoDate } from "../../src/core/IsoDate";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "../../src/core/Money";
import type { RawSheet } from "../../src/core/RawSheet";
import { COL, ISIN_A, ISIN_B, ROW, number, syntheticSheet, text, withCell } from "./SyntheticFideuramSheet";

export const cents = (value: number): EuroCents => toEuroCents(Math.round(value * 100)) ?? ZERO_CENTS;
export const date = (value: string): IsoDate => parseIsoDate(value) as IsoDate;

/** Today's bank-file reader, as the layers above it receive it. */
export const interpret: InterpretStatement = (sheet) => {
  const result = interpretFideuramSheet(sheet);
  return result.ok
    ? { ok: true, statement: { funds: result.statement.funds.map((fund) => ({ isin: fund.isin, name: fund.name, marketValue: fund.marketValue })), fundsSubtotal: result.statement.fundsSubtotal } }
    : { ok: false, message: result.issues[0]?.message ?? "unreadable" };
};

export class MemorySheet implements RowSheet {
  rows: LedgerRow[] = [];
  readRows(): readonly LedgerRow[] {
    return [...this.rows];
  }
  appendRows(rows: readonly LedgerRow[]): void {
    this.rows.push(...rows);
  }
  flush(): void {
    // Nothing to flush in memory.
  }
}

/** The invented January sheet, and February with the euro fund's price raised so every total moves with it. */
export function januarySheet(): RawSheet {
  return syntheticSheet();
}

export function februarySheet(): RawSheet {
  let sheet = syntheticSheet();
  sheet = withCell(sheet, ROW.productA, COL.H, text("13,000€ "));
  sheet = withCell(sheet, ROW.productA, COL.M, number("1300"));
  sheet = withCell(sheet, ROW.contractA, COL.M, number("1300"));
  sheet = withCell(sheet, ROW.fundsCategory, COL.M, number("2900"));
  return withCell(sheet, ROW.total, COL.M, text("3.400,00  € "));
}

export const OPENING: FundCommand[] = [ISIN_A, ISIN_B].map((isin) => ({ isin, action: "Start", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, openingNetInvested: cents(1000), comment: "" }));

/** Saves two months through the real rules, with their statements or, like older saves, without. */
export function twoSavedMonths(withStatements = true) {
  const sheet = new MemorySheet();
  const store = new RowLedgerStore(sheet);
  let counter = 0;
  const environment: ServiceEnvironment = { store, withLock: (action) => action(), newRevision: () => `revision-${String(++counter).padStart(3, "0")}` };
  const send = (raw: RawSheet, when: string, revision: string, id: string, commands: FundCommand[]) => {
    const read = interpret(raw);
    if (!read.ok) throw new Error("setup failed");
    const request: CommitRequest = {
      commandId: id,
      expectedRevision: revision,
      statement: read.statement,
      date: date(when),
      commands,
      ...(withStatements ? { source: { sheetName: "Il Mio Patrimonio", sheet: raw } } : {}),
    };
    return commitStatement(environment, request);
  };
  send(januarySheet(), "2026-01-31", "", "command-january", OPENING);
  const afterFirst = store.load();
  if (afterFirst.status !== "ok") throw new Error("setup failed");
  const second = interpret(februarySheet());
  if (!second.ok) throw new Error("setup failed");
  const keeps: FundCommand[] = planImport(afterFirst.state, second.statement).map((row) => ({ isin: row.isin, action: "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" }));
  send(februarySheet(), "2026-02-28", afterFirst.state.revision, "command-february", keeps);
  const ledger = store.load();
  const sources = store.loadSources();
  if (ledger.status !== "ok" || sources.status !== "ok") throw new Error("setup failed");
  return { sheet, store, environment, ledger: ledger.state, sources: sources.sources, keeps };
}
