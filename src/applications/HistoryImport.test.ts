import { describe, expect, it } from "vitest";
import { parseIsin } from "../core/Isin";
import { type FundCommand, applyImport } from "../core/ImportPlan";
import { EMPTY_LEDGER, type LedgerState } from "../core/Ledger";
import { parseIsoDate } from "../core/IsoDate";
import type { EuroCents } from "../core/Money";
import { type HistoryStatement, parseHistory, planAttach, planHistory, runHistory } from "./HistoryImport";

const date = (text: string) => parseIsoDate(text) as never;
const ISIN_A = parseIsin("US0378331005") as string;
const cents = (value: number): EuroCents => value as EuroCents;

function statement(commandId: string, date: string, value: number, first: boolean): HistoryStatement {
  const command: FundCommand = first
    ? { isin: ISIN_A, action: "Start", moneyIn: cents(0), moneyOut: cents(0), openingNetInvested: cents(1000), comment: "" }
    : { isin: ISIN_A, action: "Keep", moneyIn: cents(0), moneyOut: cents(0), comment: "" };
  return {
    commandId,
    date: parseIsoDate(date) as never,
    statement: { funds: [{ isin: ISIN_A, name: "Synthetic Fund", marketValue: cents(value) }], fundsSubtotal: cents(value) },
    commands: [command],
  };
}

const three = [statement("history-2026-01", "2026-01-31", 1000, true), statement("history-2026-02", "2026-02-28", 1100, false), statement("history-2026-03", "2026-03-31", 1200, false)];

function ledgerAfter(count: number): LedgerState {
  let state = EMPTY_LEDGER;
  three.slice(0, count).forEach((s, index) => {
    const applied = applyImport(state, s.statement, s.date, s.commands, `rev-${String(index)}`);
    if (!applied.ok) throw new Error("fixture");
    state = applied.state;
  });
  return state;
}

describe("parseHistory", () => {
  const file = (statements: unknown) => JSON.stringify({ kind: "foliodash-history", version: 1, statements });

  it("accepts a file whose statements pass the same validation as a single save", () => {
    const parsed = parseHistory(file(three));
    expect(parsed.ok && parsed.statements.map((s) => s.commandId)).toEqual(["history-2026-01", "history-2026-02", "history-2026-03"]);
  });

  it.each([
    ["not json", "{"],
    ["wrong kind", JSON.stringify({ kind: "other", version: 1, statements: [] })],
    ["wrong version", JSON.stringify({ kind: "foliodash-history", version: 2, statements: three })],
    ["no statements", file([])],
    ["an invalid statement", file([{ ...three[0], date: "31/01/2026" }])],
    ["a repeated command id", file([three[0], { ...three[1], commandId: "history-2026-01" }])],
  ])("refuses %s as a whole", (_name, text) => {
    expect(parseHistory(text).ok).toBe(false);
  });
});

describe("parseHistory: bank statements", () => {
  const stored = { sheetName: "Bank 2026-01-31", sheet: { date1904: false, rows: [[null, { kind: "text", text: "Fondi" }]] } };
  const file = (statements: unknown) => JSON.stringify({ kind: "foliodash-history", version: 1, statements });

  it("keeps each month's bank statement, so a history import saves it and the ledger stays rebuildable", () => {
    const parsed = parseHistory(file([{ ...three[0], source: stored }, { ...three[1], source: stored, commandId: "history-2026-02" }]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.statements.map((statement) => statement.source?.sheetName)).toEqual(["Bank 2026-01-31", "Bank 2026-01-31"]);
    expect(parsed.statements[0]?.source?.sheet.rows[0]).toEqual([undefined, { kind: "text", text: "Fondi" }]);
  });

  it("still accepts a month with no statement, and refuses a statement that is not readable", () => {
    const parsed = parseHistory(file([three[0]]));
    expect(parsed.ok && parsed.statements[0]?.source).toBeUndefined();
    expect(parseHistory(file([{ ...three[0], source: { sheetName: "x", sheet: { rows: [[{ kind: "image" }]], date1904: false } } }])).ok).toBe(false);
  });
});

describe("planHistory", () => {
  it("plans every statement for an empty ledger", () => {
    const plan = planHistory(EMPTY_LEDGER, three);
    expect(plan.ok && [plan.alreadyRecorded, plan.toSave.length]).toEqual([0, 3]);
  });

  it("resumes after the statements the ledger already holds", () => {
    const plan = planHistory(ledgerAfter(2), three);
    expect(plan.ok && [plan.alreadyRecorded, plan.toSave.map((s) => s.commandId)]).toEqual([2, ["history-2026-03"]]);
  });

  it("has nothing to save when the ledger is complete", () => {
    const plan = planHistory(ledgerAfter(3), three);
    expect(plan.ok && plan.toSave.length).toBe(0);
  });

  it("refuses a ledger with different statements, and one with more than the file", () => {
    expect(planHistory(ledgerAfter(3), three.slice(0, 2)).ok).toBe(false);
    const different = [statement("history-2026-01", "2026-01-31", 999, true), ...three.slice(1)];
    expect(planHistory(ledgerAfter(1), different).ok).toBe(false);
  });

  it("finds a statement the rules would not accept before anything is saved", () => {
    const broken = [three[0] as HistoryStatement, { ...(three[1] as HistoryStatement), statement: { funds: [], fundsSubtotal: cents(0) } }];
    const plan = planHistory(EMPTY_LEDGER, broken);
    expect(plan.ok).toBe(false);
  });
});

describe("runHistory", () => {
  it("saves in order, each against the revision the previous save returned", async () => {
    const seen: [string, string][] = [];
    const run = await runHistory<string>(
      (item, expected) => {
        seen.push([item.commandId, expected]);
        return Promise.resolve({ ok: true, ledger: { ...EMPTY_LEDGER, revision: `after-${item.commandId}` } });
      },
      EMPTY_LEDGER,
      three,
      () => undefined,
    );
    expect(seen).toEqual([["history-2026-01", ""], ["history-2026-02", "after-history-2026-01"], ["history-2026-03", "after-history-2026-02"]]);
    expect(run.saved).toBe(3);
    expect(run.stopped).toBeNull();
  });

  it("stops at the first statement not confirmed saved and attempts nothing after it", async () => {
    const attempted: string[] = [];
    const progress: number[] = [];
    const run = await runHistory<string>(
      (item) => {
        attempted.push(item.commandId);
        return Promise.resolve(item.commandId === "history-2026-02" ? { ok: false, failure: "unknown" } : { ok: true, ledger: EMPTY_LEDGER });
      },
      EMPTY_LEDGER,
      three,
      (saved) => progress.push(saved),
    );
    expect(attempted).toEqual(["history-2026-01", "history-2026-02"]);
    expect(run.saved).toBe(1);
    expect(run.stopped?.statement.commandId).toBe("history-2026-02");
    expect(run.stopped?.failure).toBe("unknown");
    expect(progress).toEqual([0, 1]);
  });
});

describe("planAttach", () => {
  const stored = { sheetName: "S", sheet: { date1904: false, rows: [] } };
  const withSource = three.map((statement) => ({ ...statement, source: stored }));

  it("lists the saved months whose statement is in the file but not yet stored", () => {
    const items = planAttach(ledgerAfter(2), withSource, new Set());
    expect(items.map((item) => item.date)).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("leaves out months that already have a stored statement, months not saved yet, and months the file has no statement for", () => {
    expect(planAttach(ledgerAfter(2), withSource, new Set([date("2026-01-31")])).map((item) => item.date)).toEqual(["2026-02-28"]);
    expect(planAttach(ledgerAfter(1), withSource, new Set()).map((item) => item.date)).toEqual(["2026-01-31"]);
    expect(planAttach(ledgerAfter(2), three, new Set())).toEqual([]);
  });

  it("has nothing to attach when every saved month has its statement", () => {
    expect(planAttach(ledgerAfter(3), withSource, new Set(withSource.map((statement) => statement.date)))).toEqual([]);
  });
});
