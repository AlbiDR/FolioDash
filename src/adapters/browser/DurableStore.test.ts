import { describe, expect, it } from "vitest";
import { createDurableStore, createMemoryStore } from "./DurableStore";
import type { KeyValueStore } from "./LedgerCache";

const blocked = (): KeyValueStore => { throw new Error("storage is blocked"); };
const full = (): KeyValueStore => ({ getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => undefined });

describe("a connection that outlasts what the browser allows", () => {
  it("writes to the first store that accepts the value and reads it back from there", () => {
    const first = createMemoryStore();
    const second = createMemoryStore();
    const store = createDurableStore([() => first, () => second]);
    store.setItem("key", "value");
    expect(first.getItem("key")).toBe("value");
    expect(second.getItem("key")).toBeNull();
    expect(store.getItem("key")).toBe("value");
  });

  it("falls back to the next store when one is blocked or full, and finally to memory", () => {
    const session = createMemoryStore();
    const viaSession = createDurableStore([blocked, () => session]);
    viaSession.setItem("key", "value");
    expect(session.getItem("key")).toBe("value");
    const viaMemory = createDurableStore([blocked, full]);
    viaMemory.setItem("key", "value");
    expect(viaMemory.getItem("key")).toBe("value");
  });

  it("never reads a stale value from an earlier store once a newer one was written to a later store", () => {
    const first = createMemoryStore();
    first.setItem("key", "old");
    let accepting = true;
    const flaky: KeyValueStore = { getItem: (key) => first.getItem(key), setItem: (key, value) => { if (!accepting) throw new Error("quota"); first.setItem(key, value); }, removeItem: (key) => { first.removeItem(key); } };
    const second = createMemoryStore();
    const store = createDurableStore([() => flaky, () => second]);
    accepting = false;
    store.setItem("key", "new");
    expect(store.getItem("key")).toBe("new");
    expect(first.getItem("key")).toBeNull();
  });

  it("removes a value from every store", () => {
    const first = createMemoryStore();
    const second = createMemoryStore();
    first.setItem("key", "a");
    second.setItem("key", "b");
    const store = createDurableStore([() => first, () => second]);
    store.removeItem("key");
    expect(first.getItem("key")).toBeNull();
    expect(second.getItem("key")).toBeNull();
    expect(store.getItem("key")).toBeNull();
  });

  it("survives every store being unreadable", () => {
    const store = createDurableStore([blocked, blocked]);
    expect(store.getItem("missing")).toBeNull();
    expect(() => { store.removeItem("missing"); }).not.toThrow();
  });
});
