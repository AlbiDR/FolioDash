import { describe, expect, it } from "vitest";
import { createWorkbook } from "../../../../../adapters/google/google-workbook";
import {
  decodeExpenseBackup,
  encodeExpenseBackup,
  EXPENSE_LOG_TITLE,
  saveExpense,
} from "../../../../../adapters/google/direct-expenses";
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
  it("drops the old workbook copy before exposing a different connected workbook", async () => {
    const { google, session, setWorkbook, boundCache } = await world();
    await session.save(request);
    const other = await createWorkbook(google.client, google.token, {
      title: "Synthetic second account",
      propertyKey: "second",
      propertyValue: "v1",
    });
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
    setRest(async (call) => {
      waiting = true;
      await barrier.promise;
      return google.client(call);
    });
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
    const session = new ExpenseSession({
      rest: google.client,
      cache: boundCache,
      newId: () => "synthetic",
      access: () => barrier.promise,
    });
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
      const mismatched = new ExpenseSession({
        rest: google.client,
        cache: boundCache,
        newId: () => "synthetic",
        access,
        workbookId,
      });
      expect(mismatched.state.days).toEqual([]);
      expect(mismatched.state.commands).toEqual([]);
      expect(mismatched.state.cached).toBe(false);
    }
  });

  it("restores a full spending-only correction history without an investment statement and reconciles a repeat read-only", async () => {
    const { session, google, workbook } = await world();
    const initial = command({ ...first, id: "history-first" });
    const cleared = command({
      ...first,
      id: "history-cleared",
      amounts: [null, null, null, null, null],
      expectedRevision: initial.id,
    });
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
      if (
        call.method === "POST" &&
        call.url.endsWith(":batchUpdate") &&
        call.body?.includes("foliodash.expenses") === true
      ) {
        entered.resolve(undefined);
        await release.promise;
      }
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
      if (call.method === "POST" && call.body?.includes("foliodash.expenses") === true) {
        lost = true;
        throw new Error("Synthetic recovery answer lost");
      }
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
      if (call.method === "POST" && call.body?.includes("foliodash.expenses") === true) {
        lost = true;
        throw new Error("Synthetic recovery answer lost");
      }
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
      if (!held && call.method === "GET" && call.url.includes("/values/")) {
        held = true;
        entered.resolve(undefined);
        await release.promise;
      }
      return answer;
    });
    const refreshing = session.refresh();
    await entered.promise;
    const changed = command({ ...first, amounts: [200, 500, 0, 0, 0], expectedRevision: previous });
    expect(
      (await session.save({ date: changed.date, amounts: changed.amounts, expectedRevision: changed.expectedRevision }))
        .status,
    ).toBe("saved");
    const confirmed = session.state.commands;
    release.resolve(undefined);
    await refreshing;
    expect(session.state.commands).toEqual(confirmed);
    expect(boundCache.load()?.commands).toEqual(confirmed);
  });
});
