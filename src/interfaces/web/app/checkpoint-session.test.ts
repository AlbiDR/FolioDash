import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../../tests/fixtures/fake-google";
import { createCheckpointLock, createCheckpointStore } from "../../../adapters/browser/checkpoint-store";
import type { KeyValueStore } from "../../../adapters/browser/ledger-cache";
import { CHECKPOINT_LOG_TITLE, readCheckpoints } from "../../../adapters/google/direct-checkpoints";
import { createWorkbook } from "../../../adapters/google/google-workbook";
import type { RestClient } from "../../../adapters/google/rest";
import type { Workbook } from "../../../applications/session-model";
import { canonicalJson } from "../../../core/canonical-json";
import type { CheckpointCommand } from "../../../core/checkpoints";
import { type IsoDate, parseIsoDate } from "../../../core/iso-date";
import { toEuroCents } from "../../../core/money";
import { sha256Hex } from "../../../core/sha256";
import { CheckpointSession } from "./checkpoint-session";

// Synthetic data only.
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test fixture value");
  return value;
}
const date = (text: string): IsoDate => required(parseIsoDate(text));
const TODAY = date("2026-11-16");
const euros = (value: number) => required(toEuroCents(Math.round(value * 100)));
const request = (on = "2026-11-14", value = 1000, note = "") => ({ date: date(on), cents: euros(value), note });

interface Memory extends KeyValueStore {
  readonly data: Map<string, string>;
  failWritesTo: RegExp | null;
  failRemovalsOf: RegExp | null;
}
function memory(): Memory {
  const data = new Map<string, string>();
  const kv: Memory = {
    data,
    failWritesTo: null,
    failRemovalsOf: null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (kv.failWritesTo?.test(key) === true) throw new Error("QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key) => {
      if (kv.failRemovalsOf?.test(key) === true) throw new Error("blocked");
      data.delete(key);
    },
  };
  return kv;
}

/** A Web Locks stand-in: exclusive, and a second request while held is told so without waiting. */
function locks() {
  const state = {
    held: false,
    request: async <T>(
      _name: string,
      _options: { ifAvailable: true; mode: "exclusive" },
      callback: (lock: object | null) => Promise<T>,
    ): Promise<T> => {
      if (state.held) return callback(null);
      state.held = true;
      try {
        return await callback({});
      } finally {
        state.held = false;
      }
    },
  };
  return state;
}

async function world() {
  const google = new FakeGoogle();
  const created = await createWorkbook(google.client, google.token);
  if (!created.ok) throw new Error("Synthetic workbook setup failed");
  const workbook: Workbook = created.value;
  const kv = memory();
  const shared = locks();
  let ids = 0;
  const make = (
    options: {
      store?: KeyValueStore;
      prefix?: string;
      useLocks?: boolean;
      workbookId?: string | null;
      access?: () => Promise<{ ok: true; token: string; workbook: Workbook }>;
      rest?: RestClient;
    } = {},
  ) =>
    new CheckpointSession({
      rest: options.rest ?? google.client,
      store: createCheckpointStore(() => options.store ?? kv, options.prefix ?? "foliodash."),
      lock: createCheckpointLock("foliodash.checkpoints", options.useLocks === false ? undefined : shared),
      newId: () => `synthetic-${String(++ids).padStart(4, "0")}`,
      access: options.access ?? (() => Promise.resolve({ ok: true as const, token: google.token, workbook })),
      workbookId: options.workbookId === undefined ? workbook.id : options.workbookId,
      today: () => TODAY,
    });
  const appends = () => google.calls.filter((call) => call.includes(":append")).length;
  return { google, workbook, kv, shared, make, appends };
}

async function ready() {
  const w = await world();
  const session = w.make();
  await session.refresh();
  return { ...w, session };
}

function appendRaw(google: FakeGoogle, id: string, entry: CheckpointCommand): void {
  const text = canonicalJson(entry);
  required(google.tab(id, CHECKPOINT_LOG_TITLE)).rows.push(["1", text, sha256Hex(text)]);
}

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
