import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../fixtures/FakeGoogle";
import { date, interpret, januarySheet, OPENING } from "../fixtures/SavedMonths";
import { createExpenseCache } from "../../src/adapters/browser/ExpenseCache";
import { createLedgerCache, type KeyValueStore } from "../../src/adapters/browser/LedgerCache";
import type { RestClient } from "../../src/adapters/google/Rest";
import { presentStatement } from "../../src/adapters/fideuram/FideuramPresentation";
import { ZERO_CENTS } from "../../src/core/Money";
import type { SignInResult } from "../../src/applications/SessionModel";
import { Session } from "../../src/interfaces/web/app/session";

const EXPENSE_INSPECT = encodeURIComponent("sheets(properties(sheetId,title),developerMetadata)");

function world() {
  const google = new FakeGoogle();
  const values = new Map<string, string>();
  const storage: KeyValueStore = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
  let id = 0;
  const control = { now: 1_793_875_200_000, expenseReadsFail: false, latency: false, signIn: (): Promise<SignInResult> => Promise.resolve({ ok: true, accessToken: google.token, expiresInSeconds: 3600 }), onRequest: (() => undefined) as (url: string) => void };
  const rest: RestClient = async (request) => {
    control.onRequest(request.url);
    if (control.latency) await new Promise(resolve => setTimeout(resolve, 2));
    if (control.expenseReadsFail && request.url.endsWith(`?fields=${EXPENSE_INSPECT}`)) return { status: 503, json: () => Promise.resolve({}) };
    return google.client(request);
  };
  const session = new Session({ clientId: "synthetic-client", interpret, present: presentStatement, signIn: () => control.signIn(), rest, cache: createLedgerCache(() => storage), expenseCache: createExpenseCache(() => storage), now: () => control.now, newId: () => `bughunt-${String(++id)}` });
  const zeroDay = { date: date("2026-11-02"), amounts: [ZERO_CENTS, ZERO_CENTS, ZERO_CENTS, ZERO_CENTS, ZERO_CENTS] as const, expectedRevision: null };
  return { google, session, values, zeroDay, control };
}

async function portfolioAndExpensesThenDeleted(mirrorAppEffect: boolean) {
  const w = world();
  const { session, google, zeroDay } = w;
  await session.connect(); await session.expenses.refresh();
  const bank = interpret(januarySheet()); if (!bank.ok) throw new Error("synthetic statement failed");
  expect((await session.save.record({ date: date("2026-01-31"), statement: bank.statement, commands: OPENING }, session.save.newCommandId(), session.state.ledger.revision)).status).toBe("recorded");
  expect((await session.expenses.save(zeroDay)).status).toBe("saved");
  await session.idle();
  const originalId = session.state.workbook?.id ?? "";
  google.workbooks.delete(originalId); const file = google.files.get(originalId); if (file) file.trashed = true;
  expect((await session.refresh()).status).toBe("needs-attention");
  expect(session.expenses.state.commands).toHaveLength(1);
  // App.tsx lines 119-121: useEffect(() => { if (data.mode === "online" && data.sheet === "ok") void session.expenses.refresh(); }, [..., data.workbook?.id, data.syncedAt])
  if (mirrorAppEffect) session.subscribe(() => { setTimeout(() => { if (session.state.mode === "online" && session.state.sheet === "ok") void session.expenses.refresh(); }, 0); });
  w.control.latency = true;
  w.control.expenseReadsFail = true; // Google briefly unavailable for the expense step only
  return { ...w, originalId };
}

describe("workbook restore and the device's expense copy", () => {
  it("with no interleaved expense refresh a failed expense recovery keeps the device history", async () => {
    const { session, values, originalId } = await portfolioAndExpensesThenDeleted(false);
    const outcome = await session.restoreFromDevice();
    expect(outcome.status).toBe("failed");
    expect(session.expenses.state.pending).toBe(false);
    expect(session.state.workbook?.id).not.toBe(originalId);
    expect(session.expenses.state.commands).toHaveLength(1);
    expect(values.get("foliodash.expenses.v1")).toContain("2026-11-02");
    expect(values.get("foliodash.expenses.v1")).toContain("2026-11-02");
    await session.idle();
  });

  it("the App's expense refresh on the restored workbook forgets the device history before it was recovered", async () => {
    const { session, values, originalId } = await portfolioAndExpensesThenDeleted(true);
    const outcome = await session.restoreFromDevice();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(outcome.status).toBe("failed");
    expect(session.expenses.state.pending).toBe(false);
    expect(session.state.workbook?.id).not.toBe(originalId);
    // Expected by docs/operations/work-expenses.md ("a connection failure does not discard ... known device history"): 1.
    expect(session.expenses.state.commands).toHaveLength(1);
    expect(values.get("foliodash.expenses.v1")).toContain("2026-11-02");
    await session.idle();
  });

  it("spending-only: a refused expense recovery leaves a copy that the next Check records wipes", async () => {
    const w = world();
    const { session, google, zeroDay, control, values } = w;
    await session.connect(); await session.expenses.refresh();
    expect((await session.expenses.save(zeroDay)).status).toBe("saved");
    await session.idle();
    const originalId = session.state.workbook?.id ?? "";
    google.workbooks.delete(originalId); const file = google.files.get(originalId); if (file) file.trashed = true;
    expect((await session.refresh()).status).toBe("needs-attention");
    // The one-hour token has just over the 8 minute write minimum left when Restore is pressed...
    control.now += (3600 - 120) * 1000 - 8 * 60_000 - 1000;
    // ...the replacement workbook takes two seconds to create, and Google's window cannot open outside a click.
    control.onRequest = (url) => { if (url.includes("drive/v3/files") || url.endsWith("/spreadsheets")) control.now += 1000; };
    control.signIn = () => Promise.resolve({ ok: false, reason: "blocked" });
    const outcome = await session.restoreFromDevice();
    expect(outcome.status).toBe("failed");
    expect(session.expenses.state.pending).toBe(false);
    expect(session.state.workbook?.id).not.toBe(originalId);
    expect(session.expenses.state.commands).toHaveLength(1); // still on the device after the failure
    await session.expenses.refresh(); // "Check records", or the App effect
    expect(session.expenses.state.commands).toHaveLength(1);
    expect(values.get("foliodash.expenses.v1")).toContain("2026-11-02");
    await session.idle();
  });
});
