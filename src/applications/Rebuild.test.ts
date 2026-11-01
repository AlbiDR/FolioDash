import { describe, expect, it } from "vitest";
import { interpretFideuramSheet } from "../adapters/fideuram/FideuramLayout";
import { RowLedgerStore, type LedgerRow, type RowSheet } from "../adapters/ledger/RowLedgerStore";
import { ISIN_A, ISIN_B, COL, ROW, number, syntheticSheet, text, withCell } from "../../tests/fixtures/SyntheticFideuramSheet";
import { type FundCommand, planImport } from "../core/ImportPlan";
import { type IsoDate, parseIsoDate } from "../core/IsoDate";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "../core/Money";
import type { RawSheet } from "../core/RawSheet";
import { type CommitRequest, type ServiceEnvironment, commitStatement } from "./LedgerService";
import { type InterpretStatement, rebuildLedger, verifyRebuild } from "./Rebuild";

const cents = (value: number): EuroCents => toEuroCents(Math.round(value * 100)) ?? ZERO_CENTS;
const date = (text: string): IsoDate => parseIsoDate(text) as IsoDate;

const interpret: InterpretStatement = (sheet) => {
  const result = interpretFideuramSheet(sheet);
  return result.ok
    ? { ok: true, statement: { funds: result.statement.funds.map((fund) => ({ isin: fund.isin, name: fund.name, marketValue: fund.marketValue })), fundsSubtotal: result.statement.fundsSubtotal } }
    : { ok: false, message: result.issues[0]?.message ?? "unreadable" };
};

class MemorySheet implements RowSheet {
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

/** Saves two months of the invented statement, the second with a changed price, through the real rules. */
function twoSavedMonths(withStatements = true) {
  const sheet = new MemorySheet();
  const store = new RowLedgerStore(sheet);
  let counter = 0;
  const environment: ServiceEnvironment = { store, withLock: (action) => action(), newRevision: () => `revision-${String(++counter).padStart(3, "0")}` };
  const january = syntheticSheet();
  // February: the euro fund's price rises to 13,000, so its value, its contract row, the funds subtotal and the total all move together.
  let february = syntheticSheet();
  february = withCell(february, ROW.productA, COL.H, text("13,000€ "));
  february = withCell(february, ROW.productA, COL.M, number("1300"));
  february = withCell(february, ROW.contractA, COL.M, number("1300"));
  february = withCell(february, ROW.fundsCategory, COL.M, number("2900"));
  february = withCell(february, ROW.total, COL.M, text("3.400,00  € "));
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
  const first = interpret(january);
  if (!first.ok) throw new Error("setup failed");
  const opening: FundCommand[] = [ISIN_A, ISIN_B].map((isin) => ({ isin, action: "Start", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, openingNetInvested: cents(1000), comment: "" }));
  send(january, "2026-01-31", "", "command-january", opening);
  const afterFirst = store.load();
  const revision = afterFirst.status === "ok" ? afterFirst.state.revision : "";
  const second = interpret(february);
  if (!second.ok) throw new Error("setup failed");
  const rows = planImport(afterFirst.status === "ok" ? afterFirst.state : { revision: "", funds: [], snapshots: [] }, second.statement);
  const keeps: FundCommand[] = rows.map((row) => ({ isin: row.isin, action: "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" }));
  send(february, "2026-02-28", revision, "command-february", keeps);
  const ledger = store.load();
  const sources = store.loadSources();
  if (ledger.status !== "ok" || sources.status !== "ok") throw new Error("setup failed");
  return { sheet, store, ledger: ledger.state, sources: sources.sources };
}

describe("verifyRebuild", () => {
  it("confirms every month rebuilds exactly from its stored statement and decisions", () => {
    const { ledger, sources } = twoSavedMonths();
    expect(verifyRebuild(ledger, sources, interpret)).toEqual({ months: 2, matching: 2, withoutStatement: 0, differing: [], unreadable: [] });
  });

  it("counts months saved before statements were kept, rather than calling them wrong", () => {
    const { ledger } = twoSavedMonths(false);
    expect(verifyRebuild(ledger, [], interpret)).toEqual({ months: 2, matching: 0, withoutStatement: 2, differing: [], unreadable: [] });
  });

  it("flags a month whose saved figures no longer match what its statement produces", () => {
    const { ledger, sources } = twoSavedMonths();
    const tampered = { ...ledger, snapshots: ledger.snapshots.map((snapshot, index) => (index === 1 ? { ...snapshot, fundsSubtotal: cents(1) } : snapshot)) };
    const report = verifyRebuild(tampered, sources, interpret);
    expect(report.differing).toEqual(["2026-02-28"]);
    expect(report.matching).toBe(1);
  });

  it("flags a stored statement that can no longer be read, without hiding the other months", () => {
    const { ledger, sources } = twoSavedMonths();
    const broken = sources.map((source, index) => (index === 0 ? { ...source, sheet: { date1904: false, rows: [] } } : source));
    const report = verifyRebuild(ledger, broken, interpret);
    expect(report.unreadable).toEqual(["2026-01-31"]);
    expect(report.matching).toBe(1);
  });

  it("checks one month even when an earlier month has no statement", () => {
    const { ledger, sources } = twoSavedMonths();
    const report = verifyRebuild(ledger, sources.slice(1), interpret);
    expect(report).toMatchObject({ months: 2, matching: 1, withoutStatement: 1 });
  });
});

describe("rebuildLedger: the sheet is complete", () => {
  it("re-creates the whole ledger from nothing but the stored statements and decisions", () => {
    const { ledger, sources } = twoSavedMonths();
    let counter = 0;
    const rebuilt = rebuildLedger(sources, interpret, () => `rebuild-${String(++counter)}`);
    expect(rebuilt.status).toBe("rebuilt");
    if (rebuilt.status !== "rebuilt") return;
    expect(rebuilt.ledger.snapshots).toEqual(ledger.snapshots);
    expect(rebuilt.ledger.funds.map((fund) => fund.isin)).toEqual(ledger.funds.map((fund) => fund.isin));
  });

  it("stops and names the month when a statement cannot be rebuilt", () => {
    const { sources } = twoSavedMonths();
    const broken = sources.map((source, index) => (index === 1 ? { ...source, sheet: { date1904: false, rows: [] } } : source));
    const result = rebuildLedger(broken, interpret, () => "r");
    expect(result).toMatchObject({ status: "failed", date: "2026-02-28" });
  });
});
