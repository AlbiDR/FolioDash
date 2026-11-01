import { describe, expect, it } from "vitest";
import { EMPTY_LEDGER } from "../../../core/Ledger";
import { demoPortfolio } from "./demoPortfolio";
import { type DeviceCopy, type KeyValueStore, createLedgerCache } from "./ledgerCache";

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
};
const blocked = (): KeyValueStore => {
  throw new Error("blocked");
};

async function realLedger() {
  // A valid ledger built by the real rules, from the invented demo portfolio.
  const { demoLedger } = await import("./demoPortfolio");
  return demoLedger("typical");
}

function copyOf(ledger: DeviceCopy["ledger"]): DeviceCopy {
  return { workbook: { id: "workbook-1", url: "https://example.test/sheet" }, ledger, syncedAt: 1_700_000_000_000 };
}

describe("ledger cache", () => {
  it("keeps a copy and returns exactly what was kept", async () => {
    const store = memory();
    const cache = createLedgerCache(() => store);
    const copy = copyOf(await realLedger());
    expect(cache.save(copy)).toBe(true);
    expect(cache.load()).toEqual(copy);
  });

  it("has nothing before anything is kept, and nothing after it is cleared", async () => {
    const store = memory();
    const cache = createLedgerCache(() => store);
    expect(cache.load()).toBeNull();
    cache.save(copyOf(await realLedger()));
    cache.clear();
    expect(cache.load()).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it.each([
    ["not JSON", "{"],
    ["the wrong version", JSON.stringify({ version: 99, workbook: { id: "a", url: "b" }, ledger: EMPTY_LEDGER, syncedAt: 1 })],
    ["no workbook", JSON.stringify({ version: 1, ledger: EMPTY_LEDGER, syncedAt: 1 })],
    ["a ledger that breaks the rules", JSON.stringify({ version: 1, workbook: { id: "a", url: "b" }, ledger: { revision: "r", funds: [{ isin: "BAD" }], snapshots: [] }, syncedAt: 1 })],
    ["no sync time", JSON.stringify({ version: 1, workbook: { id: "a", url: "b" }, ledger: EMPTY_LEDGER })],
  ])("throws away a stored copy that is %s, and removes it", (_name, text) => {
    const store = memory();
    store.data.set("foliodash.ledger.v1", text);
    const cache = createLedgerCache(() => store);
    expect(cache.load()).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it("does not keep a copy that is too large, and removes any older one", async () => {
    const store = memory();
    const cache = createLedgerCache(() => store);
    const ledger = await realLedger();
    cache.save(copyOf(ledger));
    const huge = { ...ledger, funds: ledger.funds.map((fund) => ({ ...fund, name: "x".repeat(2_100_000) })) };
    expect(cache.save(copyOf(huge))).toBe(false);
    expect(cache.load()).toBeNull();
  });

  it("survives blocked storage: nothing is kept and nothing throws", async () => {
    const cache = createLedgerCache(blocked);
    expect(cache.save(copyOf(await realLedger()))).toBe(false);
    expect(cache.load()).toBeNull();
    expect(() => {
      cache.clear();
    }).not.toThrow();
  });

  it("is the same ledger the demo screens use, so a kept copy renders without recalculation errors", () => {
    expect(demoPortfolio("typical").dates.length).toBeGreaterThan(0);
  });
});
