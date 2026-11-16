import { describe, expect, it } from "vitest";
import { type CheckpointCommand } from "../../core/Checkpoints";
import { type IsoDate, parseIsoDate } from "../../core/IsoDate";
import { toEuroCents } from "../../core/Money";
import { createCheckpointLock, createCheckpointStore } from "./CheckpointStore";
import type { KeyValueStore } from "./LedgerCache";

// Synthetic data only.
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test fixture value");
  return value;
}
const date = (text: string): IsoDate => required(parseIsoDate(text));
const add = (name: string): CheckpointCommand => ({ id: `${name}-0000000`.slice(0, 12), kind: "add", date: date("2026-11-14"), cents: required(toEuroCents(100_000)), note: "" });

function memory(): KeyValueStore & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
}

describe("checkpoint store", () => {
  it("keeps a copy and its receipts per workbook and reads them back", () => {
    const kv = memory();
    const store = createCheckpointStore(() => kv, "foliodash.");
    expect(store.saveCopy({ workbookId: "wb-1", commands: [add("a1")], initialized: true })).toBe(true);
    expect(store.saveReceipts("wb-1", [add("p1")])).toBe(true);
    expect(store.workbooks()).toEqual(["wb-1"]);
    expect(store.loadCopy("wb-1")?.commands).toEqual([add("a1")]);
    expect(store.loadReceipts("wb-1")).toEqual([add("p1")]);
    expect(store.loadCopy("wb-2")).toBeNull();
  });

  it("B1a reports a write that storage refuses, instead of believing it", () => {
    const full: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => undefined };
    const store = createCheckpointStore(() => full, "foliodash.");
    expect(store.saveReceipts("wb-1", [add("p1")])).toBe(false);
    expect(store.saveCopy({ workbookId: "wb-1", commands: [], initialized: true })).toBe(false);
  });

  it("B1a reports a write that does not read back identically", () => {
    const lossy: KeyValueStore = { getItem: () => "not what was written", setItem: () => undefined, removeItem: () => undefined };
    expect(createCheckpointStore(() => lossy, "foliodash.").saveReceipts("wb-1", [add("p1")])).toBe(false);
  });

  it("refuses an oversized copy rather than crowding out the browser's storage", () => {
    const store = createCheckpointStore(() => memory(), "foliodash.");
    const huge = Array.from({ length: 20_000 }, (_, index): CheckpointCommand => ({ id: `bulk-${String(index).padStart(8, "0")}`, kind: "add", date: date("2026-11-14"), cents: required(toEuroCentsSafe(100)), note: "x".repeat(100) }));
    expect(store.saveCopy({ workbookId: "wb-1", commands: huge, initialized: true })).toBe(false);
  });

  it("reports a receipt that cannot be removed", () => {
    const kv = memory();
    const stuck: KeyValueStore = { ...kv, removeItem: () => { throw new Error("blocked"); } };
    const store = createCheckpointStore(() => stuck, "foliodash.");
    expect(store.saveReceipts("wb-1", [add("p1")])).toBe(true);
    expect(store.saveReceipts("wb-1", [])).toBe(false);
    expect(store.loadReceipts("wb-1")).toEqual([add("p1")]);
  });

  it("B6 keeps the normal and synthetic-acceptance namespaces disjoint, including Forget", () => {
    const kv = memory();
    const normal = createCheckpointStore(() => kv, "foliodash.");
    const synthetic = createCheckpointStore(() => kv, "foliodash.synthetic-acceptance.");
    normal.saveCopy({ workbookId: "real-wb", commands: [add("a1")], initialized: true });
    normal.saveReceipts("real-wb", [add("p1")]);
    expect(synthetic.workbooks()).toEqual([]);
    expect(synthetic.loadCopy("real-wb")).toBeNull();
    expect(synthetic.loadReceipts("real-wb")).toEqual([]);
    synthetic.saveCopy({ workbookId: "synthetic-wb", commands: [], initialized: true });
    synthetic.clearAll();
    expect(normal.loadCopy("real-wb")?.commands).toHaveLength(1);
    expect(normal.loadReceipts("real-wb")).toHaveLength(1);
    expect(synthetic.workbooks()).toEqual([]);
    normal.clearAll();
    expect(normal.workbooks()).toEqual([]);
    expect(normal.loadReceipts("real-wb")).toEqual([]);
  });

  it("ignores a damaged or foreign record instead of trusting it", () => {
    const kv = memory();
    const store = createCheckpointStore(() => kv, "foliodash.");
    store.saveCopy({ workbookId: "wb-1", commands: [add("a1")], initialized: true });
    kv.data.set("foliodash.checkpoints.copy.v1:wb-1", "{\"version\":1}");
    expect(store.loadCopy("wb-1")).toBeNull();
    kv.data.set("foliodash.checkpoints.pending.v1:wb-1", "nonsense");
    expect(store.loadReceipts("wb-1")).toEqual([]);
  });
});

function toEuroCentsSafe(value: number): ReturnType<typeof toEuroCents> { return toEuroCents(value); }

describe("checkpoint lock", () => {
  const manager = (): { held: boolean; request: <T>(name: string, options: { ifAvailable: true; mode: "exclusive" }, callback: (lock: object | null) => Promise<T>) => Promise<T> } => {
    const state = { held: false, request: async <T>(_name: string, _options: { ifAvailable: true; mode: "exclusive" }, callback: (lock: object | null) => Promise<T>): Promise<T> => {
      if (state.held) return callback(null);
      state.held = true;
      try { return await callback({}); } finally { state.held = false; }
    } };
    return state;
  };

  it("runs the work while held and reports busy to a second window without waiting", async () => {
    const locks = manager();
    const lock = createCheckpointLock("foliodash.checkpoints", locks);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = lock.run(async () => { await gate; return "first"; });
    await Promise.resolve();
    expect((await lock.run(() => Promise.resolve("second"))).status).toBe("busy");
    release();
    expect(await first).toEqual({ status: "held", value: "first" });
    expect(await lock.run(() => Promise.resolve("third"))).toEqual({ status: "held", value: "third" });
  });

  it("B2b refuses when the browser has no Web Locks", async () => {
    expect((await createCheckpointLock("x", undefined).run(() => Promise.resolve(1))).status).toBe("unsupported");
  });
});
