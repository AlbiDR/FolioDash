import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../../tests/fixtures/FakeGoogle";
import { createExpenseCache } from "../../../adapters/browser/ExpenseCache";
import type { KeyValueStore } from "../../../adapters/browser/LedgerCache";
import { createWorkbook } from "../../../adapters/google/GoogleWorkbook";
import { decodeExpenseBackup, encodeExpenseBackup, EXPENSE_LOG_TITLE, saveExpense } from "../../../adapters/google/DirectExpenses";
import type { RestClient } from "../../../adapters/google/Rest";
import { parseExpenseCommand, type ExpenseCommand } from "../../../core/WorkExpenses";
import { ExpenseSession } from "./expenseSession";
import type { Workbook } from "../../../applications/SessionModel";

function command(value: unknown): ExpenseCommand {
  const parsed = parseExpenseCommand(value);
  if (parsed === null) throw new Error("Invalid synthetic command");
  return parsed;
}
const first = command({ id: "unused", date: "2026-11-02", amounts: [100, 500, 0, 0, 0], expectedRevision: null });
const request = { date: first.date, amounts: first.amounts, expectedRevision: first.expectedRevision };

function memory(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function world() {
  const google = new FakeGoogle();
  const created = await createWorkbook(google.client, google.token);
  if (!created.ok) throw new Error("Synthetic workbook setup failed");
  let active = created.value;
  const store = memory();
  const boundCache = createExpenseCache(() => store);
  let ids = 0;
  let rest: RestClient = google.client;
  const access = () => Promise.resolve({ ok: true as const, token: google.token, workbook: active });
  const make = () => new ExpenseSession({ rest: (call) => rest(call), cache: boundCache, newId: () => `synthetic-${String(++ids)}`, access });
  const session = make();
  await session.refresh();
  return { google, boundCache, store, session, make, access, setRest: (next: RestClient) => { rest = next; }, setWorkbook: (next: typeof active) => { active = next; }, workbook: created.value };
}

describe("expense session integrity and recovery", () => {
  it("does not create a records tab just by opening an empty tracker", async () => {
    const { google, session, workbook } = await world();
    expect(session.state.ready).toBe(true);
    expect(session.state.initialized).toBe(false);
    expect(google.tab(workbook.id, EXPENSE_LOG_TITLE)).toBeUndefined();
    expect(session.state.days).toEqual([]);
  });

  it("exports every revision including zero-cost corrections and a cleared day", async () => {
    const { session } = await world();
    expect((await session.save(request)).status).toBe("saved");
    const firstRevision = session.state.days[0]?.revision;
    expect(firstRevision).toBeDefined();
    const zero = command({ ...first, id: "unused-zero", amounts: [0, 0, 0, 0, 0], expectedRevision: firstRevision });
    expect((await session.save({ date: zero.date, amounts: zero.amounts, expectedRevision: zero.expectedRevision })).status).toBe("saved");
    const clear = command({ ...first, id: "unused-clear", amounts: [null, null, null, null, null], expectedRevision: session.state.days[0]?.revision });
    expect((await session.save({ date: clear.date, amounts: clear.amounts, expectedRevision: clear.expectedRevision })).status).toBe("saved");
    const history = decodeExpenseBackup(JSON.parse(session.exportBackup()) as unknown);
    expect(history?.commands).toHaveLength(3);
    expect(history?.days[0]?.amounts).toEqual([null, null, null, null, null]);
  });

  it("persists an unknown command and reconciles it after reload without appending again", async () => {
    const { google, session, make, setRest, boundCache } = await world();
    let blocked = false;
    setRest(async (call) => {
      if (blocked && call.method === "GET") throw new Error("Synthetic read outage");
      const result = await google.client(call);
      if (call.method === "POST" && call.url.includes(":append")) { blocked = true; throw new Error("Synthetic acknowledgement lost"); }
      return result;
    });
    expect((await session.save(request)).status).toBe("unknown");
    expect(session.state.pending).toBe(true);
    expect(boundCache.load()?.pending?.amounts).toEqual(request.amounts);
    const appended = google.callsMatching(/POST .*:append/u).length;
    const reloaded = make();
    expect(reloaded.state.pending).toBe(true);
    expect(reloaded.state.cached).toBe(true);
    blocked = false;
    setRest(google.client);
    expect((await reloaded.save(request)).status).toBe("saved");
    expect(reloaded.state.pending).toBe(false);
    expect(reloaded.state.commands).toHaveLength(1);
    expect(google.callsMatching(/POST .*:append/u)).toHaveLength(appended);
  });

  it("checking a previous uncertain save does not submit a different edited draft", async () => {
    const { google, session, setRest } = await world();
    let blocked = false;
    setRest(async (call) => {
      if (blocked && call.method === "GET") throw new Error("Synthetic read outage");
      const answer = await google.client(call);
      if (call.method === "POST" && call.url.includes(":append")) { blocked = true; throw new Error("Synthetic acknowledgement lost"); }
      return answer;
    });
    await session.save(request);
    const before = google.callsMatching(/POST .*:append/u).length;
    setRest(google.client);
    const changed = command({ ...first, amounts: [0, 0, 0, 0, 0] });
    const outcome = await session.save({ date: changed.date, amounts: changed.amounts, expectedRevision: null });
    expect(outcome.status).toBe("not-saved");
    expect(session.state.days[0]?.amounts).toEqual(request.amounts);
    expect(session.state.pending).toBe(false);
    expect(google.callsMatching(/POST .*:append/u)).toHaveLength(before);
  });

  it("preserves a saved copy and stops writes when an initialized records tab disappears", async () => {
    const { google, session, workbook, boundCache } = await world();
    await session.save(request);
    const commands = [...session.state.commands];
    google.workbooks.get(workbook.id)?.delete(EXPENSE_LOG_TITLE);
    await session.refresh();
    expect(session.state.ready).toBe(false);
    expect(session.state.commands).toEqual(commands);
    expect(boundCache.load()?.commands).toEqual(commands);
    expect((await session.save(request)).status).toBe("not-saved");
    expect(google.tab(workbook.id, EXPENSE_LOG_TITLE)).toBeUndefined();
  });

  it("preserves cached correction history when Google returns a valid but truncated log", async () => {
    const { google, session, workbook, boundCache, make } = await world();
    expect((await session.save(request)).status).toBe("saved");
    const correction = command({ ...first, amounts: [200, 500, 0, 0, 0], expectedRevision: session.state.days[0]?.revision });
    expect((await session.save({ date: correction.date, amounts: correction.amounts, expectedRevision: correction.expectedRevision })).status).toBe("saved");
    const known = [...session.state.commands];
    const reloaded = make();
    expect(reloaded.state.cached).toBe(true);
    expect(reloaded.state.commands).toHaveLength(2);
    const tab = google.tab(workbook.id, EXPENSE_LOG_TITLE);
    if (tab === undefined) throw new Error("Synthetic expense records are missing");
    tab.rows.pop();
    await reloaded.refresh();
    expect(reloaded.state.ready).toBe(false);
    expect(reloaded.state.commands).toEqual(known);
    expect(reloaded.state.days[0]?.amounts).toEqual(correction.amounts);
    expect(boundCache.load()?.commands).toEqual(known);
    const appends = google.callsMatching(/POST .*:append/u).length;
    expect((await reloaded.save(request)).status).toBe("not-saved");
    expect(google.callsMatching(/POST .*:append/u)).toHaveLength(appends);
  });

  it("drops the old workbook copy before exposing a different connected workbook", async () => {
    const { google, session, setWorkbook, boundCache } = await world();
    await session.save(request);
    const other = await createWorkbook(google.client, google.token, { title: "Synthetic second account", propertyKey: "second", propertyValue: "v1" });
    if (!other.ok) throw new Error("Synthetic second workbook failed");
    setWorkbook(other.value);
    await session.refresh();
    expect(session.state.commands).toEqual([]);
    expect(session.state.days).toEqual([]);
    expect(boundCache.load()?.workbookId).toBe(other.value.id);
  });

  it("does not resurrect a forgotten copy when an earlier refresh response arrives", async () => {
    const { google, session, setRest, boundCache } = await world();
    await session.save(request);
    const barrier = deferred<undefined>();
    let waiting = false;
    setRest(async (call) => { waiting = true; await barrier.promise; return google.client(call); });
    const refresh = session.refresh();
    await Promise.resolve();
    expect(waiting).toBe(true);
    session.forget();
    barrier.resolve(undefined);
    await refresh;
    expect(session.state.days).toEqual([]);
    expect(session.state.ready).toBe(false);
    expect(boundCache.load()).toBeNull();
  });

  it("ignores a rejected old-account access promise after the session is forgotten", async () => {
    const { google, boundCache } = await world();
    const barrier = deferred<{ readonly ok: true; readonly token: string; readonly workbook: Workbook }>();
    const session = new ExpenseSession({ rest: google.client, cache: boundCache, newId: () => "synthetic", access: () => barrier.promise });
    const saving = session.save(request);
    session.forget();
    barrier.reject(new Error("Old account failed"));
    await saving;
    expect(session.state.message).toBe("");
    expect(session.state.ready).toBe(false);
    expect(boundCache.load()).toBeNull();
  });

  it("does not expose an expense copy when its workbook binding differs from the account copy", async () => {
    const { google, session, boundCache, access } = await world();
    await session.save(request);
    for (const workbookId of [null, "different-workbook"]) {
      const mismatched = new ExpenseSession({ rest: google.client, cache: boundCache, newId: () => "synthetic", access, workbookId });
      expect(mismatched.state.days).toEqual([]);
      expect(mismatched.state.commands).toEqual([]);
      expect(mismatched.state.cached).toBe(false);
    }
  });

  it("restores a full spending-only correction history without an investment statement and reconciles a repeat read-only", async () => {
    const { session, google, workbook } = await world();
    const initial = command({ ...first, id: "history-first" });
    const cleared = command({ ...first, id: "history-cleared", amounts: [null, null, null, null, null], expectedRevision: initial.id });
    const text = encodeExpenseBackup([initial, cleared]);
    expect(session.previewBackup(text)?.commands).toHaveLength(2);
    expect((await session.restoreBackup(text)).status).toBe("saved");
    expect(session.state.initialized).toBe(true);
    expect(session.state.days[0]?.amounts).toEqual([null, null, null, null, null]);
    expect(decodeExpenseBackup(JSON.parse(session.exportBackup()) as unknown)?.commands).toHaveLength(2);
    const beforeRows = google.tab(workbook.id, EXPENSE_LOG_TITLE)?.rows.length;
    expect((await session.restoreBackup(text)).status).toBe("saved");
    expect(google.tab(workbook.id, EXPENSE_LOG_TITLE)?.rows).toHaveLength(beforeRows ?? -1);
    expect(session.state.commands).toHaveLength(2);
  });

  it("cannot overwrite a reachable spending history with a different backup", async () => {
    const { session } = await world();
    await session.save(request);
    const before = session.exportBackup();
    const alternative = command({ ...first, id: "alternative", amounts: [900, 0, 0, 0, 0] });
    expect((await session.restoreBackup(encodeExpenseBackup([alternative]))).status).toBe("not-saved");
    expect(session.exportBackup()).toBe(before);
  });

  it("serializes restore operations and does not restore old-account state after forgetting in flight", async () => {
    const { session, google, setRest, boundCache } = await world();
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    setRest(async (call) => {
      const answer = await google.client(call);
      if (call.method === "POST" && call.url.endsWith(":batchUpdate") && call.body?.includes("foliodash.expenses") === true) { entered.resolve(undefined); await release.promise; }
      return answer;
    });
    const text = encodeExpenseBackup([first]);
    const restoring = session.restoreBackup(text);
    await entered.promise;
    expect((await session.restoreBackup(text)).status).toBe("not-saved");
    session.forget();
    release.resolve(undefined);
    expect((await restoring).status).toBe("unknown");
    expect(session.state.days).toEqual([]);
    expect(session.state.commands).toEqual([]);
    expect(boundCache.load()).toBeNull();
  });

  it("keeps an uncertain recovery across reload and checks its original history before another write", async () => {
    const { session, google, setRest, boundCache, make, workbook } = await world();
    let lost = false;
    setRest(async (call) => {
      if (lost && call.method === "GET") throw new Error("Synthetic recovery read outage");
      const answer = await google.client(call);
      if (call.method === "POST" && call.body?.includes("foliodash.expenses") === true) { lost = true; throw new Error("Synthetic recovery answer lost"); }
      return answer;
    });
    const text = encodeExpenseBackup([first]);
    expect((await session.restoreBackup(text)).status).toBe("unknown");
    expect(boundCache.load()?.pendingRestore).toBe(text);
    const reloaded = make();
    expect(reloaded.state.pending).toBe(true);
    const rows = google.tab(workbook.id, EXPENSE_LOG_TITLE)?.rows.length;
    expect((await reloaded.save(request)).status).toBe("unknown");
    setRest(google.client);
    expect((await reloaded.checkPending()).status).toBe("saved");
    expect(google.tab(workbook.id, EXPENSE_LOG_TITLE)?.rows).toHaveLength(rows ?? -1);
    expect(reloaded.state.pending).toBe(false);
    expect(boundCache.load()?.pendingRestore).toBeNull();
    expect(reloaded.state.commands).toEqual([first]);
  });

  it("reconciles an uncertain recovery after refresh observes a legitimate later save", async () => {
    const { session, google, setRest, boundCache, make, workbook } = await world();
    let lost = false;
    setRest(async (call) => {
      if (lost && call.method === "GET") throw new Error("Synthetic recovery read outage");
      const answer = await google.client(call);
      if (call.method === "POST" && call.body?.includes("foliodash.expenses") === true) { lost = true; throw new Error("Synthetic recovery answer lost"); }
      return answer;
    });
    const text = encodeExpenseBackup([first]);
    expect((await session.restoreBackup(text)).status).toBe("unknown");
    const reloaded = make();
    expect(reloaded.state.pending).toBe(true);
    setRest(google.client);
    const later = command({ ...first, id: "other-device-later", date: "2026-11-03" });
    expect((await saveExpense(google.client, google.token, workbook.id, later, true)).status).toBe("saved");
    await reloaded.refresh();
    expect(reloaded.state.commands).toEqual([first, later]);
    expect(reloaded.state.pending).toBe(true);
    const appends = google.callsMatching(/POST .*:append/u).length;
    expect((await reloaded.checkPending()).status).toBe("saved");
    expect(reloaded.state.commands).toEqual([first, later]);
    expect(reloaded.state.pending).toBe(false);
    expect(boundCache.load()?.pendingRestore).toBeNull();
    expect(google.callsMatching(/POST .*:append/u)).toHaveLength(appends);
  });

  it("does not replace a newly confirmed save with an older concurrent refresh response", async () => {
    const { google, session, setRest, boundCache } = await world();
    await session.save(request);
    const previous = session.state.days[0]?.revision;
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    let held = false;
    setRest(async (call) => {
      const answer = await google.client(call);
      if (!held && call.method === "GET" && call.url.includes("/values/")) { held = true; entered.resolve(undefined); await release.promise; }
      return answer;
    });
    const refreshing = session.refresh();
    await entered.promise;
    const changed = command({ ...first, amounts: [200, 500, 0, 0, 0], expectedRevision: previous });
    expect((await session.save({ date: changed.date, amounts: changed.amounts, expectedRevision: changed.expectedRevision })).status).toBe("saved");
    const confirmed = session.state.commands;
    release.resolve(undefined);
    await refreshing;
    expect(session.state.commands).toEqual(confirmed);
    expect(boundCache.load()?.commands).toEqual(confirmed);
  });
});
