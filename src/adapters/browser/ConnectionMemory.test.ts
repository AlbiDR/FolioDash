import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./DurableStore";
import { createAccountHintStore } from "./ConnectionMemory";

describe("the remembered Google account", () => {
  it("is remembered for the same client and cleared on request", () => {
    const store = createMemoryStore();
    const hints = createAccountHintStore(() => store);
    hints.save("client", "person@example.test");
    expect(createAccountHintStore(() => store).load("client")).toBe("person@example.test");
    hints.clear();
    expect(hints.load("client")).toBeNull();
  });

  it("is not offered to a different client, and is discarded when it is", () => {
    const store = createMemoryStore();
    const hints = createAccountHintStore(() => store, "hint");
    hints.save("client", "person@example.test");
    expect(hints.load("other")).toBeNull();
    expect(store.getItem("hint")).toBeNull();
  });

  it("refuses an empty or oversized address and survives damaged or blocked storage", () => {
    const store = createMemoryStore();
    const hints = createAccountHintStore(() => store, "hint");
    hints.save("client", "");
    hints.save("client", "x".repeat(300));
    expect(store.getItem("hint")).toBeNull();
    store.setItem("hint", "not json");
    expect(hints.load("client")).toBeNull();
    const blocked = createAccountHintStore(() => { throw new Error("blocked"); });
    expect(() => { blocked.save("client", "person@example.test"); blocked.clear(); }).not.toThrow();
    expect(blocked.load("client")).toBeNull();
  });
});
