import { describe, expect, it } from "vitest";
import { type LedgerRow, type RowSheet, RowLedgerStore } from "../adapters/ledger/RowLedgerStore";
import { canonicalJson } from "../core/CanonicalJson";
import type { FundCommand, StatementInput } from "../core/ImportPlan";
import { type IsoDate, parseIsoDate } from "../core/IsoDate";
import { parseIsin } from "../core/Isin";
import { EMPTY_LEDGER } from "../core/Ledger";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "../core/Money";
import {
  type CommitRequest,
  type ServiceEnvironment,
  commitStatement,
  readCommandOutcome,
  readLedger,
} from "./LedgerService";

function euros(value: number): EuroCents {
  const result = toEuroCents(Math.round(value * 100));
  if (result === null) throw new Error("bad amount");
  return result;
}

function date(text: string): IsoDate {
  const result = parseIsoDate(text);
  if (result === null) throw new Error("bad date");
  return result;
}

function isin(code: string): string {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XS${code.padEnd(9, "0")}${String(digit)}`);
    if (candidate !== null) return candidate;
  }
  throw new Error("no check digit");
}

const A = isin("FUNDA");
const B = isin("FUNDB");

function statement(funds: readonly [string, number][]): StatementInput {
  const listed = funds.map(([code, value]) => ({ isin: code, name: `Fund ${code.slice(2, 7)}`, marketValue: euros(value) }));
  const subtotal = toEuroCents(listed.reduce((sum, fund) => sum + fund.marketValue, 0));
  if (subtotal === null) throw new Error("bad subtotal");
  return { funds: listed, fundsSubtotal: subtotal };
}

function command(code: string, action: FundCommand["action"], extra: Partial<FundCommand> = {}): FundCommand {
  return { isin: code, action, moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "", ...extra };
}

/** An in-memory sheet that can be told to fail at chosen moments. */
class FakeSheet implements RowSheet {
  rows: LedgerRow[] = [];
  appendCalls = 0;
  flushCalls = 0;
  failAppendOnCall: number | null = null;
  failFlushOnCall: number | null = null;
  failReads = false;

  readRows(): readonly LedgerRow[] {
    if (this.failReads) throw new Error("sheet unavailable");
    return [...this.rows];
  }

  appendRows(rows: readonly LedgerRow[]): void {
    this.appendCalls++;
    if (this.failAppendOnCall === this.appendCalls) throw new Error("append failed");
    this.rows.push(...rows);
  }

  flush(): void {
    this.flushCalls++;
    if (this.failFlushOnCall === this.flushCalls) throw new Error("flush failed");
  }
}

function setup() {
  const sheet = new FakeSheet();
  let counter = 0;
  let locks = 0;
  const environment: ServiceEnvironment = {
    store: new RowLedgerStore(sheet),
    withLock: (action) => {
      locks++;
      return action();
    },
    newRevision: () => `rev-${String(++counter)}`,
  };
  return { sheet, environment, locks: () => locks };
}

function january(commandId = "cmd-1"): CommitRequest {
  return {
    commandId,
    expectedRevision: EMPTY_LEDGER.revision,
    statement: statement([[A, 1000], [B, 500]]),
    date: date("2026-01-15"),
    commands: [command(A, "Start", { openingNetInvested: euros(900) }), command(B, "Start", { openingNetInvested: euros(450) })],
  };
}

function february(expectedRevision: string, commandId = "cmd-2"): CommitRequest {
  return {
    commandId,
    expectedRevision,
    statement: statement([[A, 1100], [B, 520]]),
    date: date("2026-02-10"),
    commands: [command(A, "Keep", { moneyIn: euros(100) }), command(B, "Keep")],
  };
}

describe("committing a statement", () => {
  it("records the first statement and reads it back whole, under the lock", () => {
    const { environment, locks } = setup();
    expect(commitStatement(environment, january())).toEqual({ status: "committed", revision: "rev-1" });
    const loaded = readLedger(environment);
    expect(loaded.status === "ok" && loaded.state.revision).toBe("rev-1");
    expect(loaded.status === "ok" && loaded.state.snapshots).toHaveLength(1);
    expect(loaded.status === "ok" && loaded.ignoredTrailingRows).toBe(0);
    expect(locks()).toBe(1);
  });

  it("adds only the new snapshot record on the next revision, and the whole history still reads back", () => {
    const { sheet, environment } = setup();
    commitStatement(environment, january());
    commitStatement(environment, february("rev-1"));
    expect(sheet.rows.filter((row) => row.type === "SNAPSHOT")).toHaveLength(2);
    expect(sheet.rows.filter((row) => row.type === "COMMIT")).toHaveLength(2);
    const loaded = readLedger(environment);
    expect(loaded.status === "ok" && loaded.state.snapshots.map((snapshot) => snapshot.date)).toEqual(["2026-01-15", "2026-02-10"]);
    expect(loaded.status === "ok" && loaded.state.revision).toBe("rev-2");
  });

  it("is idempotent: repeating a command writes nothing more", () => {
    const { sheet, environment } = setup();
    commitStatement(environment, january());
    const rowsBefore = sheet.rows.length;
    expect(commitStatement(environment, january())).toEqual({ status: "already-committed", revision: "rev-1" });
    expect(sheet.rows).toHaveLength(rowsBefore);
  });

  it("rejects a reused command id with different content", () => {
    const { sheet, environment } = setup();
    commitStatement(environment, january());
    const rowsBefore = sheet.rows.length;
    const different: CommitRequest = { ...february("rev-1"), commandId: "cmd-1" };
    const outcome = commitStatement(environment, different);
    expect(outcome.status).toBe("rejected");
    expect(sheet.rows).toHaveLength(rowsBefore);
  });

  it("reports a stale review without writing", () => {
    const { sheet, environment } = setup();
    commitStatement(environment, january());
    const rowsBefore = sheet.rows.length;
    expect(commitStatement(environment, february("rev-0"))).toEqual({ status: "stale", currentRevision: "rev-1" });
    expect(sheet.rows).toHaveLength(rowsBefore);
  });

  it("rejects a statement that breaks the ledger rules without writing", () => {
    const { sheet, environment } = setup();
    commitStatement(environment, january());
    const rowsBefore = sheet.rows.length;
    const sameMonth: CommitRequest = { ...february("rev-1"), date: date("2026-01-28"), commandId: "cmd-x" };
    const outcome = commitStatement(environment, sameMonth);
    expect(outcome.status === "rejected" && outcome.issues.map((issue) => issue.code)).toContain("date-not-later");
    expect(sheet.rows).toHaveLength(rowsBefore);
  });
});

describe("interrupted and uncertain writes", () => {
  it("an interruption before the commit record leaves the old ledger intact, and a retry then succeeds", () => {
    const { sheet, environment } = setup();
    commitStatement(environment, january());
    sheet.failAppendOnCall = sheet.appendCalls + 2; // the commit-record append of the next write
    const outcome = commitStatement(environment, february("rev-1"));
    expect(outcome.status).toBe("not-committed");

    const loaded = readLedger(environment);
    expect(loaded.status === "ok" && loaded.state.revision).toBe("rev-1");
    expect(loaded.status === "ok" && loaded.ignoredTrailingRows).toBeGreaterThan(0);

    sheet.failAppendOnCall = null;
    expect(commitStatement(environment, february("rev-1"))).toMatchObject({ status: "committed" });
    const reloaded = readLedger(environment);
    expect(reloaded.status === "ok" && reloaded.state.snapshots).toHaveLength(2);
  });

  it("a failure before anything is written is a known not-committed", () => {
    const { sheet, environment } = setup();
    sheet.failAppendOnCall = 1;
    expect(commitStatement(environment, january()).status).toBe("not-committed");
    expect(sheet.rows).toHaveLength(0);
  });

  it("a lost acknowledgement after the commit record is resolved as committed, not retried", () => {
    const { sheet, environment } = setup();
    sheet.failFlushOnCall = 2; // the flush after the commit record
    expect(commitStatement(environment, january())).toEqual({ status: "committed", revision: "rev-1" });
    expect(sheet.rows.filter((row) => row.type === "COMMIT")).toHaveLength(1);
  });

  it("says unknown, never failed, when the store cannot be read after a failure", () => {
    const { sheet, environment } = setup();
    sheet.failAppendOnCall = 1;
    const original = sheet.appendRows.bind(sheet);
    sheet.appendRows = (rows) => {
      sheet.failReads = true;
      original(rows);
    };
    expect(commitStatement(environment, january()).status).toBe("unknown");
  });

  it("resolves a command whose result was lost", () => {
    const { environment } = setup();
    expect(readCommandOutcome(environment, "cmd-1")).toEqual({ status: "not-found" });
    commitStatement(environment, january());
    const outcome = readCommandOutcome(environment, "cmd-1");
    expect(outcome.status === "committed" && outcome.receipt.revision).toBe("rev-1");
  });
});

describe("a damaged ledger", () => {
  function committedTwice() {
    const harness = setup();
    commitStatement(harness.environment, january());
    commitStatement(harness.environment, february("rev-1"));
    return harness;
  }

  function tamper(sheet: FakeSheet, predicate: (row: LedgerRow) => boolean, change: (row: LedgerRow) => LedgerRow): void {
    sheet.rows = sheet.rows.map((row) => (predicate(row) ? change(row) : row));
  }

  it("is detected when a snapshot record was edited, and refuses further writes", () => {
    const { sheet, environment } = committedTwice();
    tamper(sheet, (row) => row.type === "SNAPSHOT" && row.revision === "rev-1", (row) => ({ ...row, payload: row.payload.replace("2026-01-15", "2026-01-16") }));
    expect(readLedger(environment).status).toBe("damaged");
    const rowsBefore = sheet.rows.length;
    expect(commitStatement(environment, { ...february("rev-2", "cmd-3"), date: date("2026-03-10") }).status).toBe("damaged");
    expect(sheet.rows).toHaveLength(rowsBefore);
  });

  it("is detected when the commit record no longer matches its revision", () => {
    const { sheet, environment } = committedTwice();
    tamper(sheet, (row) => row.type === "COMMIT" && row.revision === "rev-2", (row) => ({ ...row, checksum: "0".repeat(64) }));
    expect(readLedger(environment).status).toBe("damaged");
  });

  it("is detected when the header record was edited", () => {
    const { sheet, environment } = committedTwice();
    tamper(sheet, (row) => row.type === "META" && row.revision === "rev-2", (row) => ({ ...row, payload: row.payload.replace("Fund FUNDA", "Fund FUNDX") }));
    expect(readLedger(environment).status).toBe("damaged");
  });

  it("is detected when a timeline reference is redirected", () => {
    const { sheet, environment } = committedTwice();
    tamper(sheet, (row) => row.type === "TIMELINE" && row.revision === "rev-2", (row) => {
      const refs = JSON.parse(row.payload) as [number, string][];
      const [first, second] = refs;
      if (first === undefined || second === undefined) return row;
      const payload = canonicalJson([second, first]);
      return { ...row, payload, checksum: row.checksum };
    });
    expect(readLedger(environment).status).toBe("damaged");
  });

  it("never reinitialises itself from current data", () => {
    const { sheet, environment } = committedTwice();
    tamper(sheet, (row) => row.type === "SNAPSHOT", (row) => ({ ...row, payload: "{}" }));
    expect(readLedger(environment).status).toBe("damaged");
    expect(sheet.rows.length).toBeGreaterThan(0);
  });
});

describe("an empty sheet", () => {
  it("reads as the empty ledger", () => {
    const { environment } = setup();
    const loaded = readLedger(environment);
    expect(loaded.status === "ok" && loaded.state).toEqual(EMPTY_LEDGER);
  });
});
