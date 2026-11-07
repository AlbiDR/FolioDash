import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "./DurableStore";
import { createSharedConnection } from "./TabCoordination";

const keys = { access: "access", claim: "claim", forgotten: "forgotten" } as const;

function windows() {
  const store = createMemoryStore();
  const clock = { now: 1_700_000_000_000 };
  const listeners = new Set<(event: StorageEvent) => void>();
  const source = {
    addEventListener: (_type: "storage", listener: (event: StorageEvent) => void) => { listeners.add(listener); },
    removeEventListener: (_type: "storage", listener: (event: StorageEvent) => void) => { listeners.delete(listener); },
  };
  const open = (windowId: string) => createSharedConnection({ open: () => store, keys, windowId, now: () => clock.now, source });
  const emit = (key: string | null, newValue: string | null) => { for (const listener of [...listeners]) listener({ key, newValue } as StorageEvent); };
  return { store, clock, open, emit, listeners };
}

describe("windows of one browser sharing a connection", () => {
  it("lets one window see that another is renewing, but not itself", () => {
    const { open } = windows();
    const first = open("first");
    const second = open("second");
    expect(second.heldElsewhere()).toBe(false);
    first.claim();
    expect(second.heldElsewhere()).toBe(true);
    expect(first.heldElsewhere()).toBe(false);
  });

  it("clears its own claim when finished, and never another window's", () => {
    const { open } = windows();
    const first = open("first");
    const second = open("second");
    first.claim();
    second.release();
    expect(second.heldElsewhere()).toBe(true);
    first.release();
    expect(second.heldElsewhere()).toBe(false);
  });

  it("lets a stale claim expire, so a window that closed mid-renewal cannot block the others", () => {
    const { open, clock } = windows();
    const first = open("first");
    const second = open("second");
    first.claim();
    clock.now += 131_000;
    expect(second.heldElsewhere()).toBe(false);
  });

  it("ignores a damaged claim", () => {
    const { open, store } = windows();
    store.setItem(keys.claim, "not json");
    expect(open("first").heldElsewhere()).toBe(false);
  });

  it("reports newer access and a forgotten device from other windows, and nothing else", () => {
    const { open, emit, listeners } = windows();
    const adopt = vi.fn();
    const forgotten = vi.fn();
    const stop = open("first").watch({ adopt, forgotten });
    emit(keys.access, "{}");
    emit(keys.access, null);
    emit("other", "x");
    emit(keys.forgotten, "1:second");
    expect(adopt).toHaveBeenCalledOnce();
    expect(forgotten).toHaveBeenCalledOnce();
    stop();
    expect(listeners.size).toBe(0);
  });

  it("announces a forgotten device so other windows do not write a credential back", () => {
    const { open, store } = windows();
    open("first").announceForgotten();
    expect(store.getItem(keys.forgotten)).toMatch(/:first$/u);
  });

  it("does nothing, and breaks nothing, when storage is blocked", () => {
    const connection = createSharedConnection({ open: () => { throw new Error("blocked"); }, keys, windowId: "only", now: () => 0, source: { addEventListener: () => undefined, removeEventListener: () => undefined } });
    expect(() => { connection.claim(); connection.release(); connection.announceForgotten(); }).not.toThrow();
    expect(connection.heldElsewhere()).toBe(false);
  });
});
