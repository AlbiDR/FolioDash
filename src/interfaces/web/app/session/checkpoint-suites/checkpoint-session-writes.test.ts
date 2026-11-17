import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../../../../tests/fixtures/fake-google";
import { createCheckpointStore } from "../../../../../adapters/browser/storage/checkpoint-store";
import { CHECKPOINT_LOG_TITLE, readCheckpoints } from "../../../../../adapters/google/direct-checkpoints";
import { createWorkbook } from "../../../../../adapters/google/google-workbook";
import type { RestClient } from "../../../../../adapters/google/rest";
import type { Workbook } from "../../../../../applications/session/session-model";
import {
  required,
  euros,
  request,
  world,
  ready,
  appendRaw,
} from "../../../../../../tests/fixtures/session/checkpoint-session-test-support";

describe("checkpoint session", () => {
  it("C1 saves a checkpoint, shows it, and leaves no receipt behind", async () => {
    const { session, kv, google, workbook } = await ready();
    expect(session.state.ready).toBe(true);
    expect((await session.add(request())).status).toBe("saved");
    expect(session.state.active.map((entry) => entry.cents)).toEqual([euros(1000)]);
    expect(session.state.pending).toEqual([]);
    expect([...kv.data.keys()].some((key) => key.includes("pending"))).toBe(false);
    const remote = await readCheckpoints(google.client, google.token, workbook.id, true);
    expect(remote.status === "ok" && remote.commands).toHaveLength(1);
  });

  it("C8 and C9 void then add on the same date, and a reload shows the same state", async () => {
    const { session, make, workbook } = await ready();
    await session.add(request("2026-11-14", 1000));
    const target = required(session.state.active[0]).id;
    expect((await session.void(target)).status).toBe("saved");
    expect(session.state.active).toEqual([]);
    expect((await session.add(request("2026-11-14", 1010))).status).toBe("saved");
    expect(session.state.active.map((entry) => entry.cents)).toEqual([euros(1010)]);
    const reloaded = make({ workbookId: workbook.id });
    expect(reloaded.state.active.map((entry) => entry.cents)).toEqual([euros(1010)]);
    expect(reloaded.state.commands).toHaveLength(3);
  });

  it("refuses a future date and a void of an unknown checkpoint without writing", async () => {
    const { session, appends } = await ready();
    expect((await session.add(request("2026-11-17"))).status).toBe("refused");
    expect((await session.void("not-a-real-id")).status).toBe("refused");
    expect(appends()).toBe(0);
  });

  it("B1a sends nothing when the receipt cannot be kept, and keeps the draft", async () => {
    const { session, kv, appends } = await ready();
    kv.failWritesTo = /pending/u;
    const result = await session.add(request());
    expect(result.status).toBe("not-saved");
    expect(result.message).toMatch(/safe record/u);
    expect(appends()).toBe(0);
    expect(session.state.pending).toEqual([]);
  });

  it("B1b keeps a receipt that cannot be removed, blocks other saves, and a later check finishes it without a duplicate", async () => {
    const { session, kv, google, workbook, appends } = await ready();
    kv.failRemovalsOf = /pending/u;
    await session.add(request());
    expect(session.state.pending).toHaveLength(1);
    expect((await session.add(request("2026-11-15", 1100))).status).toBe("unknown");
    kv.failRemovalsOf = null;
    expect((await session.checkPending()).status).toBe("saved");
    expect(session.state.pending).toEqual([]);
    const remote = await readCheckpoints(google.client, google.token, workbook.id, true);
    expect(remote.status === "ok" && remote.commands).toHaveLength(1);
    expect(appends()).toBe(1);
  });

  it("C7a a lost answer that was applied is confirmed by reading it back, once", async () => {
    const { session, google, workbook } = await ready();
    google.faults.push({ match: /:append/u, network: true, applyFirst: true });
    const result = await session.add(request());
    expect(result.status).toBe("saved");
    const remote = await readCheckpoints(google.client, google.token, workbook.id, true);
    expect(remote.status === "ok" && remote.commands).toHaveLength(1);
    expect(session.state.pending).toEqual([]);
  });

  it("C7b and C7c a command not visible after an ambiguous failure stays unknown across a reload and blocks other saves", async () => {
    const { session, google, workbook, make, appends } = await ready();
    google.faults.push({ match: /:append/u, network: true });
    expect((await session.add(request())).status).toBe("unknown");
    expect(session.state.pending).toHaveLength(1);
    const reloaded = make({ workbookId: workbook.id });
    expect(reloaded.state.pending).toHaveLength(1);
    await reloaded.refresh();
    expect((await reloaded.add(request("2026-11-15", 1100))).status).toBe("unknown");
    expect((await reloaded.checkPending()).status).toBe("unknown");
    expect(appends()).toBe(1);
    // The delayed completion arrives: the original command becomes visible and the receipt resolves.
    appendRaw(google, workbook.id, required(reloaded.state.pending[0]));
    expect((await reloaded.checkPending()).status).toBe("saved");
    expect(reloaded.state.pending).toEqual([]);
    expect((await reloaded.add(request("2026-11-15", 1100))).status).toBe("saved");
  });

  it("B2 a second window can neither erase nor bypass another window's unresolved receipt", async () => {
    const { session, google, workbook, make, kv } = await ready();
    google.faults.push({ match: /:append/u, network: true });
    await session.add(request());
    const other = make({ workbookId: workbook.id });
    await other.refresh();
    // The other window refreshes and saves its own snapshot, which must leave the receipt alone.
    expect(other.state.pending).toHaveLength(1);
    expect((await other.add(request("2026-11-15", 1100))).status).toBe("unknown");
    expect([...kv.data.keys()].some((key) => key.includes("pending.v1"))).toBe(true);
    const reloadA = make({ workbookId: workbook.id });
    expect(reloadA.state.pending).toHaveLength(1);
  });

  it("B2 a window that finds the lock held does not wait and does not send", async () => {
    const { session, shared, appends } = await ready();
    shared.held = true;
    const result = await session.add(request());
    expect(result.status).toBe("not-saved");
    expect(result.message).toMatch(/Another window/u);
    expect(appends()).toBe(0);
  });

  it("B2b writes are refused without Web Locks, while reading still works", async () => {
    const w = await world();
    const session = w.make({ useLocks: false });
    await session.refresh();
    expect(session.state.ready).toBe(true);
    const result = await session.add(request());
    expect(result.status).toBe("not-saved");
    expect(w.appends()).toBe(0);
  });

  it("C11 Forget during an in-flight save attributes nothing to the new state and removes the copies", async () => {
    const w = await world();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const session = w.make({
      access: async () => {
        calls++;
        if (calls > 1) await gate;
        return { ok: true as const, token: w.google.token, workbook: w.workbook };
      },
    });
    await session.refresh();
    const pending = session.add(request());
    await Promise.resolve();
    session.forget();
    release();
    expect((await pending).status).toBe("unknown");
    expect(session.state.commands).toEqual([]);
    expect(w.appends()).toBe(0);
    expect(createCheckpointStore(() => w.kv, "foliodash.").workbooks()).toEqual([]);
  });

  it("B7a keeps the receipt and says so when the local copy cannot be updated after a confirmed save", async () => {
    const { session, kv, google, workbook } = await ready();
    kv.failWritesTo = /checkpoints\.copy/u;
    const result = await session.add(request());
    expect(result.status).toBe("unknown");
    expect(result.message).toMatch(/Saved in Google/u);
    expect(session.state.pending).toHaveLength(1);
    kv.failWritesTo = null;
    expect((await session.checkPending()).status).toBe("saved");
    expect(session.state.pending).toEqual([]);
    const remote = await readCheckpoints(google.client, google.token, workbook.id, true);
    expect(remote.status === "ok" && remote.commands).toHaveLength(1);
  });

  it("B7b a page that dies between the snapshot and the receipt removal resolves on restart with no Google write", async () => {
    const { session, kv, make, workbook, appends } = await ready();
    kv.failRemovalsOf = /pending/u;
    await session.add(request());
    expect(appends()).toBe(1);
    kv.failRemovalsOf = null;
    const restarted = make({ workbookId: workbook.id });
    expect(restarted.state.pending).toHaveLength(1);
    expect(restarted.state.commands).toHaveLength(1);
    expect((await restarted.checkPending()).status).toBe("saved");
    expect(restarted.state.pending).toEqual([]);
    expect(appends()).toBe(1);
  });

  it("B9a a competing void that lands after the preflight turns this void into a no-op and clears the receipt", async () => {
    const { session, google, workbook, appends } = await ready();
    await session.add(request());
    const target = required(session.state.active[0]);
    const before = appends();
    const reads = google.calls.filter((call) => call.startsWith("GET") && call.includes("/values/")).length;
    google.afterRead = {
      count: reads + 1,
      run: () => {
        appendRaw(google, workbook.id, { id: "rival-void-1", kind: "void", target: target.id });
      },
    };
    const result = await session.void(target.id);
    expect(result.status).toBe("no-change");
    expect(session.state.pending).toEqual([]);
    expect(appends()).toBe(before);
    expect(session.state.active).toEqual([]);
  });

  it("B9b a refusal before any write clears the receipt and leaves the next save possible", async () => {
    const { session, google } = await ready();
    google.faults.push({ match: /:append/u, status: 403 });
    expect((await session.add(request())).status).toBe("not-saved");
    expect(session.state.pending).toEqual([]);
    expect((await session.add(request())).status).toBe("saved");
  });

  it("C5 a deleted records tab is reported, nothing is recreated, and the device copy is kept", async () => {
    const { session, google, workbook } = await ready();
    await session.add(request());
    google.workbooks.get(workbook.id)?.delete(CHECKPOINT_LOG_TITLE);
    await session.refresh();
    expect(session.state.ready).toBe(false);
    expect(session.state.active).toHaveLength(1);
    expect((await session.add(request("2026-11-15"))).status).toBe("not-saved");
    expect(google.tab(workbook.id, CHECKPOINT_LOG_TITLE)).toBeUndefined();
  });

  it("C12 and C12b a replacement workbook preserves the old copy and its unresolved command, even after a restart", async () => {
    const original = await world();
    const first = original.make();
    await first.refresh();
    await first.add(request("2026-11-10", 900));
    original.google.faults.push({ match: /:append/u, network: true });
    await first.add(request("2026-11-12", 950));
    expect(first.state.pending).toHaveLength(1);

    // Recovery: the connected workbook is now a different one, on a fresh fake Google.
    const replacementGoogle = new FakeGoogle();
    const created = await createWorkbook(replacementGoogle.client, replacementGoogle.token);
    if (!created.ok) throw new Error("Synthetic replacement setup failed");
    // Both fakes number their first workbook the same, so the app sees a different id and the fake is addressed by its own.
    const replacement: Workbook = { id: "replacement-workbook", url: created.value.url };
    const replacementRest: RestClient = (call) =>
      replacementGoogle.client({ ...call, url: call.url.replaceAll(replacement.id, created.value.id) });
    const reachReplacement = () =>
      Promise.resolve({ ok: true as const, token: replacementGoogle.token, workbook: replacement });
    const viaReplacement = original.make({
      workbookId: replacement.id,
      rest: replacementRest,
      access: reachReplacement,
    });
    expect(viaReplacement.state.preserved.map((entry) => entry.workbookId)).toEqual([original.workbook.id]);
    expect(viaReplacement.state.preserved[0]?.pending).toHaveLength(1);
    await viaReplacement.refresh();
    expect(viaReplacement.state.ready).toBe(true);
    expect(viaReplacement.state.active).toEqual([]);
    expect((await viaReplacement.add(request("2026-11-15", 1200))).status).toBe("saved");
    // A full restart still shows the old copy untouched, and a refresh of the replacement cannot overwrite it.
    const restarted = original.make({ workbookId: replacement.id, rest: replacementRest, access: reachReplacement });
    await restarted.refresh();
    const kept = restarted.state.preserved.find((entry) => entry.workbookId === original.workbook.id);
    expect(kept?.active.map((entry) => entry.cents)).toEqual([euros(900)]);
    expect(kept?.pending).toHaveLength(1);
    expect(restarted.preservedText(original.workbook.id)).toContain("2026-11-10\t900.00");
    // Only the explicit Forget removes them.
    restarted.forget();
    expect(original.make({ workbookId: replacement.id }).state.preserved).toEqual([]);
  });

  it("B6 the synthetic-acceptance session neither shows nor removes ordinary copies and receipts", async () => {
    const w = await world();
    const ordinary = w.make();
    await ordinary.refresh();
    await ordinary.add(request());
    w.google.faults.push({ match: /:append/u, network: true });
    await ordinary.add(request("2026-11-15"));
    const synthetic = w.make({ prefix: "foliodash.synthetic-acceptance.", workbookId: "synthetic-workbook" });
    expect(synthetic.state.preserved).toEqual([]);
    expect(synthetic.state.pending).toEqual([]);
    await synthetic.refresh().catch(() => undefined);
    synthetic.forget();
    const stillThere = w.make({ workbookId: w.workbook.id });
    expect(stillThere.state.active).toHaveLength(1);
    expect(stillThere.state.pending).toHaveLength(1);
  });
});
