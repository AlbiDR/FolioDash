import { describe, expect, it } from "vitest";
import { createWorkbook } from "../../../../../adapters/google/google-workbook";
import { decodeExpenseBackup, EXPENSE_LOG_TITLE } from "../../../../../adapters/google/direct-expenses";
import { ExpenseSession } from "../expense-session";
import type { Workbook } from "../../../../../applications/session/session-model";
import {
  command,
  first,
  request,
  deferred,
  world,
} from "../../../../../../tests/fixtures/session/expense-session-test-support";

describe("expense session integrity and recovery", () => {
  it("joins concurrent readiness checks so background loading and explicit reconnect finish together", async () => {
    const { session, google, setRest } = await world();
    const entered = deferred<undefined>();
    const release = deferred<undefined>();
    let inspections = 0;
    setRest(async (call) => {
      if (call.method === "GET" && call.url.includes("?fields=")) {
        inspections++;
        entered.resolve(undefined);
        await release.promise;
      }
      return google.client(call);
    });
    const background = session.refresh();
    await entered.promise;
    const explicit = session.refresh();
    expect(explicit).toBe(background);
    release.resolve(undefined);
    await Promise.all([background, explicit]);
    expect(inspections).toBe(1);
    expect(session.state.ready).toBe(true);
  });

  it("makes a failed connection check visible and recoverable without losing the history", async () => {
    const { session, google, boundCache } = await world();
    await session.save(request);
    const denied = new ExpenseSession({
      rest: google.client,
      cache: boundCache,
      newId: () => "unused",
      access: () => Promise.resolve({ ok: false, message: "Sign in with Google to check these records." }),
    });
    await denied.refresh();
    expect(denied.state.ready).toBe(false);
    expect(denied.state.message).toContain("Sign in with Google");
    expect(denied.state.commands).toHaveLength(1);
    expect(boundCache.load()?.commands).toHaveLength(1);
  });

  it("surfaces unexpected check failures without an unhandled rejection and permits another check", async () => {
    const { session, google, setRest } = await world();
    const access = deferred<{ readonly ok: true; readonly token: string; readonly workbook: Workbook }>();
    const delayed = new ExpenseSession({ rest: google.client, newId: () => "unused", access: () => access.promise });
    const checking = delayed.refresh();
    access.reject(new Error("Synthetic identity failure"));
    await expect(checking).resolves.toBeUndefined();
    expect(delayed.state.ready).toBe(false);
    expect(delayed.state.message).toContain("could not be checked");
    setRest(() => Promise.reject(new Error("Synthetic network failure")));
    await session.refresh();
    expect(session.state.ready).toBe(false);
    setRest(google.client);
    await session.refresh();
    expect(session.state.ready).toBe(true);
  });
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
    expect(
      (await session.save({ date: zero.date, amounts: zero.amounts, expectedRevision: zero.expectedRevision })).status,
    ).toBe("saved");
    const clear = command({
      ...first,
      id: "unused-clear",
      amounts: [null, null, null, null, null],
      expectedRevision: session.state.days[0]?.revision,
    });
    expect(
      (await session.save({ date: clear.date, amounts: clear.amounts, expectedRevision: clear.expectedRevision }))
        .status,
    ).toBe("saved");
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
      if (call.method === "POST" && call.url.includes(":append")) {
        blocked = true;
        throw new Error("Synthetic acknowledgement lost");
      }
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
      if (call.method === "POST" && call.url.includes(":append")) {
        blocked = true;
        throw new Error("Synthetic acknowledgement lost");
      }
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
    const correction = command({
      ...first,
      amounts: [200, 500, 0, 0, 0],
      expectedRevision: session.state.days[0]?.revision,
    });
    expect(
      (
        await session.save({
          date: correction.date,
          amounts: correction.amounts,
          expectedRevision: correction.expectedRevision,
        })
      ).status,
    ).toBe("saved");
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

  it("preserves a confirmed replacement-workbook copy through refresh, reload and a retry", async () => {
    const { google, session, setWorkbook, boundCache, make } = await world();
    await session.save(request);
    const backup = session.exportBackup();
    const other = await createWorkbook(google.client, google.token, {
      title: "Synthetic recovery",
      propertyKey: "recovery",
      propertyValue: "v1",
    });
    if (!other.ok) throw new Error("Synthetic recovery workbook failed");
    expect(session.prepareWorkbookRecovery(other.value.id)).toBe(true);
    setWorkbook(other.value);
    await session.refresh();
    expect(session.state.ready).toBe(false);
    expect(session.state.commands).toHaveLength(1);
    expect(boundCache.load()?.workbookId).toBe(other.value.id);
    expect(boundCache.load()?.commands).toHaveLength(1);
    const reloaded = make();
    await reloaded.refresh();
    expect(reloaded.state.commands).toHaveLength(1);
    expect((await reloaded.save(request)).status).toBe("not-saved");
    expect(google.tab(other.value.id, EXPENSE_LOG_TITLE)).toBeUndefined();
    expect((await reloaded.restoreBackup(backup)).status).toBe("saved");
    await reloaded.refresh();
    expect(reloaded.state.ready).toBe(true);
    expect(reloaded.state.commands).toHaveLength(1);
    reloaded.forget();
    expect(reloaded.state.commands).toEqual([]);
    expect(boundCache.load()).toBeNull();
  });
});
