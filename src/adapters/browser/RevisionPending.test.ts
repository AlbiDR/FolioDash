import { describe, expect, it } from "vitest";
import { createRevisionPendingStore } from "./RevisionPending";
import type { KeyValueStore } from "./LedgerCache";

function memory(): KeyValueStore & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("revision pending receipts", () => {
  it("keeps a pending write isolated by workbook and clears only its own command", () => {
    const storage = memory();
    const receipts = createRevisionPendingStore(() => storage);
    const predecessor = "a".repeat(64);
    expect(receipts.begin("first", "command-1")).toBe(true);
    expect(receipts.begin("first", "command-2")).toBe(false);
    expect(receipts.prepare("first", "command-1", predecessor)).toBe(true);
    expect(receipts.prepare("first", "command-1", predecessor)).toBe(false);
    expect(receipts.clear("first", "command-2")).toBe(false);
    expect(receipts.load("first")).toEqual({ ok: true, commandId: "command-1", predecessor });
    expect(receipts.load("second")).toEqual({ ok: true, commandId: null, predecessor: null });
    expect(receipts.clear("first", "command-1")).toBe(true);
    expect(receipts.load("first")).toEqual({ ok: true, commandId: null, predecessor: null });
  });

  it("fails closed when the receipt is corrupted or storage cannot be read", () => {
    const storage = memory();
    const receipts = createRevisionPendingStore(() => storage, "test.");
    storage.values.set("test.first", '{"commandId":"pending","predecessor":"invalid"}');
    expect(receipts.load("first")).toEqual({ ok: false });
    expect(receipts.begin("first", "another")).toBe(false);
    expect(receipts.clear("first", "pending")).toBe(false);
    const blocked = createRevisionPendingStore(() => {
      throw new Error("blocked");
    });
    expect(blocked.load("first")).toEqual({ ok: false });
    expect(blocked.begin("first", "command")).toBe(false);
  });

  it("refuses a write when storage does not retain the pending receipt", () => {
    const storage = memory();
    const receipts = createRevisionPendingStore(() => ({ ...storage, setItem: () => undefined }));
    expect(receipts.begin("first", "command")).toBe(false);
  });
});
