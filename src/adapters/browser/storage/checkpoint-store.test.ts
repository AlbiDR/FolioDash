import { describe, expect, it } from "vitest";
import { ADD_ADMISSION_LIMIT, type CheckpointCommand, READ_SAFE_LIMIT } from "../../../core/portfolio/checkpoints";
import { type IsoDate, parseIsoDate } from "../../../core/values/iso-date";
import { toEuroCents } from "../../../core/values/money";
import { type CheckpointReceipt, createCheckpointLock, createCheckpointStore } from "./checkpoint-store";
import type { KeyValueStore } from "./ledger-cache";

// Synthetic data only.
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test fixture value");
  return value;
}
const date = (text: string): IsoDate => required(parseIsoDate(text));
const add = (name: string): CheckpointCommand => ({
  id: `${name}-0000000`.slice(0, 12),
  kind: "add",
  date: date("2026-11-14"),
  cents: required(toEuroCents(100_000)),
  note: "",
});

const receipt = (name: string, phase: CheckpointReceipt["phase"] = "sent"): CheckpointReceipt => ({
  command: add(name),
  phase,
});

function memory(): KeyValueStore & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("checkpoint store", () => {
  it("keeps a copy and its receipts per workbook and reads them back", () => {
    const kv = memory();
    const store = createCheckpointStore(() => kv, "foliodash.");
    expect(store.saveCopy({ workbookId: "wb-1", commands: [add("a1")], initialized: true })).toBe(true);
    expect(store.saveReceipts("wb-1", [receipt("p1")])).toBe(true);
    expect(store.workbooks()).toEqual(["wb-1"]);
    expect(store.loadCopy("wb-1")?.commands).toEqual([add("a1")]);
    expect(store.loadReceipts("wb-1")).toEqual({ status: "present", receipts: [receipt("p1")] });
    expect(store.loadCopy("wb-2")).toBeNull();
  });

  it("B1a reports a write that storage refuses, instead of believing it", () => {
    const full: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    const store = createCheckpointStore(() => full, "foliodash.");
    expect(store.saveReceipts("wb-1", [receipt("p1")])).toBe(false);
    expect(store.saveCopy({ workbookId: "wb-1", commands: [], initialized: true })).toBe(false);
  });

  it("B1a reports a write that does not read back identically", () => {
    const lossy: KeyValueStore = {
      getItem: () => "not what was written",
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(createCheckpointStore(() => lossy, "foliodash.").saveReceipts("wb-1", [receipt("p1")])).toBe(false);
  });

  it("refuses an oversized copy rather than crowding out the browser's storage", () => {
    const store = createCheckpointStore(() => memory(), "foliodash.");
    const huge = Array.from({ length: 20_000 }, (_, index): CheckpointCommand => ({
      id: `bulk-${String(index).padStart(8, "0")}`,
      kind: "add",
      date: date("2026-11-14"),
      cents: required(toEuroCentsSafe(100)),
      note: "x".repeat(100),
    }));
    expect(store.saveCopy({ workbookId: "wb-1", commands: huge, initialized: true })).toBe(false);
  });

  it("CR-003 keeps the worst log the rules admit: the add limit with the longest escaped notes, every withdrawal and competing duplicates", () => {
    const store = createCheckpointStore(() => memory(), "foliodash.");
    const kv = memory();
    const real = createCheckpointStore(() => kv, "foliodash.");
    const note = "\\".repeat(120);
    const adds = Array.from({ length: ADD_ADMISSION_LIMIT }, (_, index): CheckpointCommand => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      kind: "add",
      date: date("2026-11-14"),
      cents: required(toEuroCents(99_999_999_999)),
      note,
    }));
    const voids = Array.from({ length: READ_SAFE_LIMIT - ADD_ADMISSION_LIMIT }, (_, index): CheckpointCommand => ({
      id: `ffffffff-0000-4000-8000-${String(index).padStart(12, "0")}`,
      kind: "void",
      target: `00000000-0000-4000-8000-${String(index % ADD_ADMISSION_LIMIT).padStart(12, "0")}`,
    }));
    expect(real.saveCopy({ workbookId: "wb-1", commands: [...adds, ...voids], initialized: true })).toBe(true);
    expect(real.loadCopy("wb-1")?.commands).toHaveLength(READ_SAFE_LIMIT);
    expect(store.workbooks()).toEqual([]);
  });

  it("reports a receipt that cannot be removed", () => {
    const kv = memory();
    const stuck: KeyValueStore = {
      ...kv,
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const store = createCheckpointStore(() => stuck, "foliodash.");
    expect(store.saveReceipts("wb-1", [receipt("p1")])).toBe(true);
    expect(store.saveReceipts("wb-1", [])).toBe(false);
    expect(store.loadReceipts("wb-1")).toEqual({ status: "present", receipts: [receipt("p1")] });
  });

  it("B6 keeps the normal and synthetic-acceptance namespaces disjoint, including Forget", () => {
    const kv = memory();
    const normal = createCheckpointStore(() => kv, "foliodash.");
    const synthetic = createCheckpointStore(() => kv, "foliodash.synthetic-acceptance.");
    normal.saveCopy({ workbookId: "real-wb", commands: [add("a1")], initialized: true });
    normal.saveReceipts("real-wb", [receipt("p1")]);
    expect(synthetic.workbooks()).toEqual([]);
    expect(synthetic.loadCopy("real-wb")).toBeNull();
    expect(synthetic.loadReceipts("real-wb")).toEqual({ status: "none" });
    synthetic.saveCopy({ workbookId: "synthetic-wb", commands: [], initialized: true });
    synthetic.clearAll();
    expect(normal.loadCopy("real-wb")?.commands).toHaveLength(1);
    expect(normal.loadReceipts("real-wb").status).toBe("present");
    expect(synthetic.workbooks()).toEqual([]);
    normal.clearAll();
    expect(normal.workbooks()).toEqual([]);
    expect(normal.loadReceipts("real-wb")).toEqual({ status: "none" });
  });

  it("CP-003 reports a damaged, foreign or unreadable receipt as unreadable, never as empty, and leaves it untouched", () => {
    const kv = memory();
    const store = createCheckpointStore(() => kv, "foliodash.");
    store.saveReceipts("wb-1", [receipt("p1")]);
    const key = "foliodash.checkpoints.pending.v1:wb-1";
    const good = kv.data.get(key) ?? "";
    expect(store.loadReceipts("wb-2")).toEqual({ status: "none" });
    for (const broken of [
      "nonsense",
      '{"version":1}',
      '{"version":2,"workbookId":"wb-1","receipts":[]}',
      good.replace("wb-1", "other-workbook"),
      "[]",
    ]) {
      kv.data.set(key, broken);
      expect(store.loadReceipts("wb-1")).toEqual({ status: "unreadable" });
      expect(kv.data.get(key)).toBe(broken);
    }
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(createCheckpointStore(() => throwing, "foliodash.").loadReceipts("wb-1")).toEqual({ status: "unreadable" });
  });

  it("CP-004 keeps the phase of a receipt", () => {
    const kv = memory();
    const store = createCheckpointStore(() => kv, "foliodash.");
    store.saveReceipts("wb-1", [receipt("p1", "not-submitted")]);
    expect(store.loadReceipts("wb-1")).toEqual({ status: "present", receipts: [receipt("p1", "not-submitted")] });
  });

  it("ignores a damaged copy instead of trusting it", () => {
    const kv = memory();
    const store = createCheckpointStore(() => kv, "foliodash.");
    store.saveCopy({ workbookId: "wb-1", commands: [add("a1")], initialized: true });
    kv.data.set("foliodash.checkpoints.copy.v1:wb-1", '{"version":1}');
    expect(store.loadCopy("wb-1")).toBeNull();
  });
});

function toEuroCentsSafe(value: number): ReturnType<typeof toEuroCents> {
  return toEuroCents(value);
}

describe("checkpoint lock", () => {
  const manager = (): {
    held: boolean;
    request: <T>(
      name: string,
      options: { ifAvailable: true; mode: "exclusive" },
      callback: (lock: object | null) => Promise<T>,
    ) => Promise<T>;
  } => {
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
  };

  it("runs the work while held and reports busy to a second window without waiting", async () => {
    const locks = manager();
    const lock = createCheckpointLock("foliodash.checkpoints", locks);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = lock.run(async () => {
      await gate;
      return "first";
    });
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
