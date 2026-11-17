import { describe, expect, it } from "vitest";
import { createCheckpointStore } from "../../../../../adapters/browser/storage/checkpoint-store";
import { CHECKPOINT_LOG_TITLE } from "../../../../../adapters/google/direct-checkpoints";
import { canonicalJson } from "../../../../../core/integrity/canonical-json";
import type { CheckpointCommand } from "../../../../../core/portfolio/checkpoints";
import {
  required,
  euros,
  request,
  world,
  ready,
  appendRaw,
} from "../../../../../../tests/fixtures/session/checkpoint-session-test-support";

describe("checkpoint session", () => {
  it("blocks writes and keeps the copy when Google is missing a checkpoint the device already knows", async () => {
    const { session, google, workbook } = await ready();
    await session.add(request());
    required(google.tab(workbook.id, CHECKPOINT_LOG_TITLE)).rows.splice(1);
    await session.refresh();
    expect(session.state.ready).toBe(false);
    expect(session.state.active).toHaveLength(1);
    expect(session.state.message).toMatch(/missing/u);
  });

  it("C4 never touches the ledger tab's rows", async () => {
    const { session, google, workbook } = await ready();
    const before = canonicalJson(required(google.tab(workbook.id, "_FolioDash ledger")).rows);
    await session.add(request());
    expect(canonicalJson(required(google.tab(workbook.id, "_FolioDash ledger")).rows)).toBe(before);
  });

  it("CP-001 sends nothing when Google no longer holds a checkpoint the device knows, even without a refresh", async () => {
    const { session, google, workbook, appends } = await ready();
    await session.add(request("2026-11-10", 900));
    const before = appends();
    required(google.tab(workbook.id, CHECKPOINT_LOG_TITLE)).rows.splice(1);
    const result = await session.add(request("2026-11-12", 950));
    expect(result.status).toBe("not-saved");
    expect(result.message).toMatch(/missing/u);
    expect(appends()).toBe(before);
    expect(session.state.pending).toEqual([]);
  });

  it("CP-002 a delayed refresh in one window cannot overwrite a newer copy another window saved", async () => {
    const w = await world();
    const a = w.make();
    await a.refresh();
    const b = w.make({ workbookId: w.workbook.id });
    await b.refresh();
    // A reads the old (empty) log but has not stored anything yet.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    const slow = w.make({
      workbookId: w.workbook.id,
      rest: async (call) => {
        const answer = await w.google.client(call);
        if (call.url.includes("/values/") && ++reads === 1) await gate;
        return answer;
      },
    });
    const delayed = slow.refresh();
    await Promise.resolve();
    expect((await b.add(request("2026-11-12", 950))).status).toBe("saved");
    release();
    await delayed;
    const stored = createCheckpointStore(() => w.kv, "foliodash.").loadCopy(w.workbook.id);
    expect(stored?.commands).toHaveLength(1);
  });

  it("CP-003 a receipt that cannot be read blocks every write and is left untouched", async () => {
    const { session, kv, google, make, workbook, appends } = await ready();
    google.faults.push({ match: /:append/u, network: true });
    await session.add(request());
    const key = [...kv.data.keys()].find((entry) => entry.includes("pending.v1")) ?? "";
    const original = kv.data.get(key) ?? "";
    kv.data.set(key, "damaged");
    const reloaded = make({ workbookId: workbook.id });
    expect(reloaded.state.receiptsUnreadable).toBe(true);
    await reloaded.refresh();
    const result = await reloaded.add(request("2026-11-15", 1100));
    expect(result.status).toBe("unknown");
    expect(appends()).toBe(1);
    expect(kv.data.get(key)).toBe("damaged");
    expect((await reloaded.checkPending()).status).toBe("unknown");
    kv.data.set(key, original);
    const healed = make({ workbookId: workbook.id });
    expect(healed.state.receiptsUnreadable).toBe(false);
    expect(healed.state.pending).toHaveLength(1);
  });

  it("CP-004 a refusal whose receipt removal fails is finished later without the command ever existing in Google", async () => {
    const { session, kv, google, make, workbook } = await ready();
    google.faults.push({ match: /:append/u, status: 403 });
    kv.failRemovalsOf = /pending/u;
    const first = await session.add(request());
    expect(first.status).toBe("unknown");
    expect(session.state.pending).toHaveLength(1);
    kv.failRemovalsOf = null;
    const restarted = make({ workbookId: workbook.id });
    expect(restarted.state.pending).toHaveLength(1);
    await restarted.refresh();
    expect((await restarted.checkPending()).status).toBe("no-change");
    expect(restarted.state.pending).toEqual([]);
    expect((await restarted.add(request("2026-11-15", 1100))).status).toBe("saved");
  });

  it("CP-004 a no-op whose snapshot cannot be saved keeps a not-submitted receipt that a later check clears", async () => {
    const { session, kv, google, workbook } = await ready();
    await session.add(request());
    const target = required(session.state.active[0]);
    const reads = google.calls.filter((call) => call.startsWith("GET") && call.includes("/values/")).length;
    google.afterRead = {
      count: reads + 1,
      run: () => {
        appendRaw(google, workbook.id, { id: "rival-void-1", kind: "void", target: target.id });
      },
    };
    kv.failWritesTo = /checkpoints\.copy/u;
    const result = await session.void(target.id);
    expect(result.status).toBe("unknown");
    expect(session.state.pending).toHaveLength(1);
    kv.failWritesTo = null;
    expect((await session.checkPending()).status).toBe("no-change");
    expect(session.state.pending).toEqual([]);
    expect(session.state.active).toEqual([]);
  });

  it("CP-006 draws no markers after an integrity failure, but keeps the device copy for the screen", async () => {
    const { session, google, workbook } = await ready();
    await session.add(request());
    expect(session.state.suspect).toBe(false);
    google.workbooks.get(workbook.id)?.delete(CHECKPOINT_LOG_TITLE);
    await session.refresh();
    expect(session.state.suspect).toBe(true);
    expect(session.state.active).toHaveLength(1);
  });

  it("CP-005 the preserved text can leave amounts out", async () => {
    const original = await world();
    const first = original.make();
    await first.refresh();
    await first.add(request("2026-11-10", 900));
    const elsewhere = original.make({ workbookId: "some-other-workbook" });
    const id = original.workbook.id;
    expect(elsewhere.preservedText(id)).toContain("900.00");
    expect(elsewhere.preservedText(id, true)).not.toContain("900");
    expect(elsewhere.preservedText(id, true)).toContain("hidden");
  });

  it("CR-001 Forget while the save waits for the lock or reads Google sends nothing and recreates nothing", async () => {
    const w = await world();
    let calls = -1_000;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The adapter's own read, after the preflight, is held back so Forget lands before the append.
    const session = w.make({
      rest: async (call) => {
        const answer = await w.google.client(call);
        if (call.url.includes("/values/") && ++calls === 2) await gate;
        return answer;
      },
    });
    await session.refresh();
    await session.add(request("2026-11-10", 900));
    const before = w.appends();
    calls = 0;
    const pending = session.add(request("2026-11-12", 950));
    await new Promise((resolve) => setTimeout(resolve, 20));
    session.forget();
    release();
    expect((await pending).status).toBe("unknown");
    expect(w.appends()).toBe(before);
    expect(createCheckpointStore(() => w.kv, "foliodash.").workbooks()).toEqual([]);
  });

  it("CR-002 a log that lost a checkpoint another window saved is refused before anything is sent", async () => {
    const w = await world();
    const a = w.make();
    await a.refresh();
    const b = w.make({ workbookId: w.workbook.id });
    await b.refresh();
    expect((await b.add(request("2026-11-12", 950))).status).toBe("saved");
    // Google loses B's row while window A still holds its earlier, empty view.
    required(w.google.tab(w.workbook.id, CHECKPOINT_LOG_TITLE)).rows.splice(1);
    const before = w.appends();
    const result = await a.add(request("2026-11-13", 960));
    expect(result.status).toBe("not-saved");
    expect(w.appends()).toBe(before);
  });

  it("CR-002 a refresh that sees a log older than the shared copy is not treated as ready", async () => {
    const w = await world();
    const a = w.make();
    await a.refresh();
    const b = w.make({ workbookId: w.workbook.id });
    await b.refresh();
    await b.add(request("2026-11-12", 950));
    required(w.google.tab(w.workbook.id, CHECKPOINT_LOG_TITLE)).rows.splice(1);
    await a.refresh();
    expect(a.state.ready).toBe(false);
    expect(a.state.message).toMatch(/missing/u);
  });

  it("CR-005 withdrawing something another device already withdrew brings this window up to date without writing", async () => {
    const { session, google, workbook, appends } = await ready();
    await session.add(request());
    const target = required(session.state.active[0]);
    appendRaw(google, workbook.id, { id: "other-void-01", kind: "void", target: target.id });
    const before = appends();
    const result = await session.void(target.id);
    expect(result.status).toBe("no-change");
    expect(appends()).toBe(before);
    expect(session.state.active).toEqual([]);
    expect(session.state.pending).toEqual([]);
  });

  it("CR-006 a first save that fails before initialisation does not leave the workbook permanently unwritable", async () => {
    const { session, kv, google, make, workbook } = await ready();
    expect(session.state.initialized).toBe(false);
    google.faults.push({ match: /:batchUpdate/u, status: 403 });
    kv.failRemovalsOf = /pending/u;
    const first = await session.add(request());
    expect(first.status).toBe("unknown");
    kv.failRemovalsOf = null;
    const restarted = make({ workbookId: workbook.id });
    await restarted.refresh();
    expect((await restarted.checkPending()).status).toBe("no-change");
    expect(restarted.state.initialized).toBe(false);
    const again = make({ workbookId: workbook.id });
    await again.refresh();
    expect(again.state.ready).toBe(true);
    expect((await again.add(request("2026-11-15", 1100))).status).toBe("saved");
  });

  it("REVIEW-001 a command that exists in Google with different content is an integrity failure: the receipt and the block stay", async () => {
    const { session, google, workbook, make, appends } = await ready();
    google.faults.push({ match: /:append/u, network: true });
    await session.add(request());
    const pending = required(session.state.pending[0]);
    appendRaw(google, workbook.id, { ...(pending as Extract<CheckpointCommand, { kind: "add" }>), cents: euros(5) });
    const result = await session.checkPending();
    expect(result.status).toBe("unknown");
    expect(session.state.pending).toHaveLength(1);
    expect(session.state.suspect).toBe(true);
    const restarted = make({ workbookId: workbook.id });
    expect(restarted.state.pending).toHaveLength(1);
    expect((await restarted.add(request("2026-11-15", 1100))).status).toBe("unknown");
    expect(appends()).toBe(1);
  });

  it("REVIEW-003 an older answer that the log did not exist cannot hide a checkpoint another window saved meanwhile", async () => {
    const w = await world();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    const slow = w.make({
      rest: async (call) => {
        const answer = await w.google.client(call);
        if (!held && call.method === "GET" && !call.url.includes("/values/")) {
          held = true;
          await gate;
        }
        return answer;
      },
    });
    const delayed = slow.refresh();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const other = w.make({ workbookId: w.workbook.id });
    await other.refresh();
    expect((await other.add(request("2026-11-12", 950))).status).toBe("saved");
    release();
    await delayed;
    expect(slow.state.ready).toBe(false);
    expect(slow.state.suspect).toBe(true);
    expect(slow.state.message).toMatch(/knows of checkpoints|missing/u);
  });

  it("REVIEW-004 an unsuccessful read stops the markers until a read succeeds, and the copy stays listed", async () => {
    const { session, google } = await ready();
    await session.add(request());
    expect(session.state.suspect).toBe(false);
    google.faults.push({ match: /spreadsheets/u, status: 503 });
    await session.refresh();
    expect(session.state.suspect).toBe(true);
    expect(session.state.active).toHaveLength(1);
    await session.refresh();
    expect(session.state.suspect).toBe(false);
  });

  it("REVIEW-005 the preserved text includes a save that was never confirmed, labelled", async () => {
    const original = await world();
    const first = original.make();
    await first.refresh();
    original.google.faults.push({ match: /:append/u, network: true });
    await first.add(request("2026-11-10", 900));
    const elsewhere = original.make({ workbookId: "some-other-workbook" });
    const text = elsewhere.preservedText(original.workbook.id);
    expect(text).toContain("UNCONFIRMED\t2026-11-10\t900.00");
    expect(elsewhere.preservedText(original.workbook.id, true)).not.toContain("900");
    expect(elsewhere.state.preserved[0]?.pending).toHaveLength(1);
  });

  it("REVIEW-002 Forget bumps the generation so a screen can discard private drafts", async () => {
    const { session } = await ready();
    const before = session.state.generation;
    session.forget();
    expect(session.state.generation).toBe(before + 1);
  });
});
