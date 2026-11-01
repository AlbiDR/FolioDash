import { describe, expect, it } from "vitest";
import { type CommitRequest, type ServiceEnvironment, type SourceRecord, commitStatement } from "../../applications/LedgerService";
import type { FundCommand, StatementInput } from "../../core/ImportPlan";
import { type IsoDate, parseIsoDate } from "../../core/IsoDate";
import { parseIsin } from "../../core/Isin";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "../../core/Money";
import { type RawSheet, toStoredSheet } from "../../core/RawSheet";
import { type LedgerRow, type RowSheet, RowLedgerStore } from "./RowLedgerStore";

const cents = (value: number): EuroCents => toEuroCents(Math.round(value * 100)) ?? ZERO_CENTS;
const date = (text: string): IsoDate => parseIsoDate(text) as IsoDate;
const ISIN = (() => {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XSFUNDA0000${String(digit)}`);
    if (candidate !== null) return candidate;
  }
  throw new Error("no check digit");
})();

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

function statement(value: number): StatementInput {
  return { funds: [{ isin: ISIN, name: "Synthetic Fund A", marketValue: cents(value) }], fundsSubtotal: cents(value) };
}
const start: FundCommand = { isin: ISIN, action: "Start", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, openingNetInvested: cents(1000), comment: "" };
const keep: FundCommand = { isin: ISIN, action: "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" };

function sheetOf(label: string, rows = 3): RawSheet {
  return {
    date1904: false,
    rows: Array.from({ length: rows }, (_, row) => [undefined, { kind: "text", text: `${label} ${String(row)}` }, { kind: "number", text: "1234.5678", format: null }]),
  };
}

function setup() {
  const sheet = new MemorySheet();
  const store = new RowLedgerStore(sheet);
  let counter = 0;
  const environment: ServiceEnvironment = { store, withLock: (action) => action(), newRevision: () => `revision-${String(++counter).padStart(3, "0")}` };
  const january = (source?: CommitRequest["source"]): CommitRequest => ({
    commandId: "command-january",
    expectedRevision: "",
    statement: statement(1000),
    date: date("2026-01-31"),
    commands: [start],
    ...(source === undefined ? {} : { source }),
  });
  const february = (revision: string, source?: CommitRequest["source"]): CommitRequest => ({
    commandId: "command-february",
    expectedRevision: revision,
    statement: statement(1100),
    date: date("2026-02-28"),
    commands: [keep],
    ...(source === undefined ? {} : { source }),
  });
  return { sheet, store, environment, january, february };
}

describe("several statements in one revision", () => {
  it("keeps a large statement and a small one apart, each exactly, when saved together", () => {
    const { store, environment, january } = setup();
    commitStatement(environment, january());
    const loaded = store.load();
    if (loaded.status !== "ok") throw new Error("setup failed");
    const record = (day: string, id: string, sheet: RawSheet): SourceRecord => ({ date: date(day), commandId: id, sheetName: "S", commands: [start], sheet: toStoredSheet(sheet) });
    store.publish({ ...loaded.state, revision: "revision-attach" }, { commandId: "attach-1", revision: "revision-attach", requestHash: "hash" }, [
      record("2026-01-31", "a", sheetOf("Large", 900)),
      record("2026-02-28", "b", sheetOf("Small", 2)),
      record("2026-03-31", "c", sheetOf("Large again", 900)),
    ]);
    const sources = store.loadSources();
    expect(sources.status).toBe("ok");
    if (sources.status !== "ok") return;
    expect(sources.sources.map((source) => [source.date, source.sheet.rows.length])).toEqual([
      ["2026-01-31", 900],
      ["2026-02-28", 2],
      ["2026-03-31", 900],
    ]);
    expect(sources.sources[1]?.sheet.rows[1]?.[1]).toEqual({ kind: "text", text: "Small 1" });
  });
});

describe("stored bank statements", () => {
  it("keeps the exact statement and the decisions with each month, and reads them back", () => {
    const { store, environment, january } = setup();
    const outcome = commitStatement(environment, january({ sheetName: "Il Mio Patrimonio", sheet: sheetOf("January") }));
    expect(outcome.status).toBe("committed");
    const loaded = store.loadSources();
    expect(loaded.status).toBe("ok");
    if (loaded.status !== "ok") return;
    expect(loaded.sources).toHaveLength(1);
    expect(loaded.sources[0]).toMatchObject({ date: "2026-01-31", commandId: "command-january", sheetName: "Il Mio Patrimonio" });
    expect(loaded.sources[0]?.commands).toEqual([start]);
    expect(loaded.sources[0]?.sheet.rows[1]?.[1]).toEqual({ kind: "text", text: "January 1" });
    expect(loaded.sources[0]?.sheet.rows[0]?.[0]).toBeNull();
  });

  it("keeps every earlier month's statement when a later month is added, without writing them again", () => {
    const { sheet, store, environment, january, february } = setup();
    commitStatement(environment, january({ sheetName: "S", sheet: sheetOf("January") }));
    const afterJanuary = sheet.rows.filter((row) => row.type === "SOURCE").length;
    const loaded = store.load();
    const revision = loaded.status === "ok" ? loaded.state.revision : "";
    commitStatement(environment, february(revision, { sheetName: "S", sheet: sheetOf("February") }));
    const sources = store.loadSources();
    expect(sources.status === "ok" && sources.sources.map((source) => source.date)).toEqual(["2026-01-31", "2026-02-28"]);
    expect(sheet.rows.filter((row) => row.type === "SOURCE").length).toBeGreaterThan(afterJanuary);
    expect(sheet.rows.filter((row) => row.type === "SOURCE" && row.payload.includes("January")).length).toBe(afterJanuary);
  });

  it("splits a large statement into pieces that each stay inside one cell, and reassembles it exactly", () => {
    const { sheet, store, environment, january } = setup();
    const big = sheetOf("Large", 900);
    commitStatement(environment, january({ sheetName: "S", sheet: big }));
    const pieces = sheet.rows.filter((row) => row.type === "SOURCE");
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((row) => row.payload.length < 45_000)).toBe(true);
    const loaded = store.loadSources();
    expect(loaded.status === "ok" && loaded.sources[0]?.sheet.rows).toHaveLength(900);
  });

  it("does not disturb the ledger itself: it still loads, with the same figures, with or without a statement", () => {
    const withSource = setup();
    commitStatement(withSource.environment, withSource.january({ sheetName: "S", sheet: sheetOf("January") }));
    const without = setup();
    commitStatement(without.environment, without.january());
    const a = withSource.store.load();
    const b = without.store.load();
    expect(a.status === "ok" && b.status === "ok" && a.state.snapshots).toEqual(b.status === "ok" ? b.state.snapshots : []);
    const none = without.store.loadSources();
    expect(none.status === "ok" && none.sources).toEqual([]);
  });

  it("reports an edited piece as damaged and returns no statement at all", () => {
    const { sheet, store, environment, january } = setup();
    commitStatement(environment, january({ sheetName: "S", sheet: sheetOf("January") }));
    const piece = sheet.rows.find((row) => row.type === "SOURCE");
    if (piece !== undefined) sheet.rows[sheet.rows.indexOf(piece)] = { ...piece, payload: piece.payload.replace("January", "Januarx") };
    const loaded = store.loadSources();
    expect(loaded.status).toBe("damaged");
    expect(store.load().status).toBe("damaged");
  });

  it("reports a missing piece as damaged", () => {
    const { sheet, store, environment, january } = setup();
    commitStatement(environment, january({ sheetName: "S", sheet: sheetOf("Large", 900) }));
    const first = sheet.rows.findIndex((row) => row.type === "SOURCE");
    sheet.rows.splice(first, 1);
    expect(store.loadSources().status).toBe("damaged");
  });

  it("ignores pieces from a save that never reached its commit record", () => {
    const { sheet, store, environment, january } = setup();
    commitStatement(environment, january({ sheetName: "S", sheet: sheetOf("January") }));
    sheet.rows.push({ revision: "interrupted", type: "SOURCE", payload: "{}", checksum: "x" });
    const loaded = store.loadSources();
    expect(loaded.status === "ok" && loaded.sources).toHaveLength(1);
  });

  it("treats the same command id with a different statement as a different request", () => {
    const { environment, january } = setup();
    expect(commitStatement(environment, january({ sheetName: "S", sheet: sheetOf("January") })).status).toBe("committed");
    expect(commitStatement(environment, january({ sheetName: "S", sheet: sheetOf("January") })).status).toBe("already-committed");
    expect(commitStatement(environment, january({ sheetName: "S", sheet: sheetOf("Different") })).status).toBe("rejected");
  });
});
