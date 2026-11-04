import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../../tests/fixtures/FakeGoogle";
import { date, interpret, januarySheet, OPENING } from "../../../../tests/fixtures/SavedMonths";
import { createExpenseCache } from "../../../adapters/browser/ExpenseCache";
import { createLedgerCache, type KeyValueStore } from "../../../adapters/browser/LedgerCache";
import { readExpenses } from "../../../adapters/google/DirectExpenses";
import { createWorkbook } from "../../../adapters/google/GoogleWorkbook";
import type { RestClient } from "../../../adapters/google/Rest";
import { presentStatement } from "../../../adapters/fideuram/FideuramPresentation";
import { ZERO_CENTS } from "../../../core/Money";
import { Session } from "./session";

function world() {
  const google = new FakeGoogle();
  const values = new Map<string, string>();
  const storage: KeyValueStore = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
  let id = 0;
  const make = (rest: RestClient = google.client) => new Session({ clientId: "synthetic-client", interpret, present: presentStatement, signIn: () => Promise.resolve({ ok: true, accessToken: google.token, expiresInSeconds: 3600 }), rest, cache: createLedgerCache(() => storage), expenseCache: createExpenseCache(() => storage), now: () => 1_793_875_200_000, newId: () => `session-expense-${String(++id)}` });
  const zeroDay = { date: date("2026-11-02"), amounts: [ZERO_CENTS, ZERO_CENTS, ZERO_CENTS, ZERO_CENTS, ZERO_CENTS] as const, expectedRevision: null };
  return { google, make, values, zeroDay };
}

describe("portfolio and expenses sharing a session", () => {
  it("saves expenses without portfolio statements and rebuilds them on another session", async () => {
    const { make, google, zeroDay } = world();
    const session = make(); await session.connect(); await session.expenses.refresh();
    expect((await session.expenses.save(zeroDay)).status).toBe("saved");
    expect(session.state.ledger.snapshots).toHaveLength(0);
    const another = make(); await another.connect(); await another.expenses.refresh();
    expect(another.state.workbook?.id).toBe(session.state.workbook?.id);
    expect(another.expenses.state.days[0]?.amounts).toEqual(zeroDay.amounts);
    expect(google.workbooks.size).toBe(1);
    await session.idle(); await another.idle();
  });
  it("restores a missing spending-only workbook from the checked device history", async () => {
    const { make, google, zeroDay } = world();
    const session = make(); await session.connect(); await session.expenses.refresh();
    await session.expenses.save(zeroDay); await session.idle();
    const originalId = session.state.workbook?.id ?? "";
    google.workbooks.delete(originalId);
    const file = google.files.get(originalId); if (file) file.trashed = true;
    expect((await session.refresh()).status).toBe("needs-attention");
    expect((await session.restoreFromDevice()).status).toBe("restored");
    expect(session.state.workbook?.id).not.toBe(originalId);
    expect(session.expenses.state.days[0]?.amounts).toEqual(zeroDay.amounts);
    expect(session.state.ledger.snapshots).toHaveLength(0);
    expect((await readExpenses(google.client, google.token, session.state.workbook?.id ?? "")).status).toBe("ok");
    await session.idle();
  });
  it("recovers portfolio figures and expense correction history into the same replacement workbook", async () => {
    const { make, google, zeroDay } = world();
    const session = make(); await session.connect(); await session.expenses.refresh();
    const bank = interpret(januarySheet()); if (!bank.ok) throw new Error("Synthetic statement failed");
    const recorded = await session.save.record({ date: date("2026-01-31"), statement: bank.statement, commands: OPENING }, session.save.newCommandId(), session.state.ledger.revision);
    expect(recorded.status).toBe("recorded");
    await session.expenses.save(zeroDay); await session.idle();
    const before = session.expenses.exportBackup();
    const originalId = session.state.workbook?.id ?? "";
    google.workbooks.delete(originalId); const file = google.files.get(originalId); if (file) file.trashed = true;
    await session.refresh();
    expect((await session.restoreFromDevice()).status).toBe("restored");
    expect(session.state.ledger.snapshots).toHaveLength(1);
    expect(session.expenses.exportBackup()).toBe(before);
    await session.idle();
  });
  it("forgetting a device clears both copies and any pending expense state", async () => {
    const { make, values, zeroDay } = world();
    const session = make(); await session.connect(); await session.expenses.refresh(); await session.expenses.save(zeroDay);
    expect(values.size).toBe(2);
    session.forget();
    expect(values.size).toBe(0);
    expect(session.expenses.state.days).toHaveLength(0);
    expect(session.state.mode).toBe("signed-out");
    await session.idle();
  });
  it("cannot repopulate either feature from a shared refresh completing after forget", async () => {
    const { make, google, values, zeroDay } = world();
    let hold = false;
    let release: () => void = () => undefined;
    let captured: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { captured = resolve; });
    const session = make(async request => {
      const response = await google.client(request);
      if (hold && request.method === "GET" && request.url.includes("/values/")) { captured(); await gate; }
      return response;
    });
    await session.connect(); await session.expenses.refresh(); await session.expenses.save(zeroDay); await session.idle();
    hold = true;
    const pending = session.refresh(); await started;
    session.forget(); release(); await pending;
    expect(session.state.mode).toBe("signed-out");
    expect(session.expenses.state.commands).toHaveLength(0);
    expect(values.size).toBe(0);
  });
  it("clears prior expense coverage before displaying a different connected workbook", async () => {
    const { make, google, values, zeroDay } = world();
    const session = make(); await session.connect(); await session.expenses.refresh(); await session.expenses.save(zeroDay); await session.idle();
    const second = await createWorkbook(google.client, google.token);
    expect(second.ok).toBe(true);
    expect((await session.connect()).status).toBe("connected");
    expect(session.expenses.state.commands).toHaveLength(0);
    expect(values.has("foliodash.expenses.v1")).toBe(false);
    await session.expenses.refresh();
    expect(session.expenses.state.days).toHaveLength(0);
    await session.idle();
  });
});
