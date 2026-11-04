import { describe, expect, it } from "vitest";
import { parseExpenseCommand, type ExpenseCommand } from "../../core/WorkExpenses";
import { createExpenseCache, type ExpenseCopy } from "./ExpenseCache";
import type { KeyValueStore } from "./LedgerCache";
import { encodeExpenseBackup } from "../google/DirectExpenses";

function command(value: unknown): ExpenseCommand {
  const parsed = parseExpenseCommand(value);
  if (parsed === null) throw new Error("Invalid synthetic expense command");
  return parsed;
}

const first = command({ id: "first", date: "2026-11-02", amounts: [100, null, 0, 0, 0], expectedRevision: null });
const corrected = command({ id: "corrected", date: "2026-11-02", amounts: [0, 0, 0, 0, 0], expectedRevision: "first" });
const cleared = command({ id: "cleared", date: "2026-11-02", amounts: [null, null, null, null, null], expectedRevision: "corrected" });
const pending = command({ id: "pending", date: "2026-11-03", amounts: [0, 500, 0, 0, 0], expectedRevision: null });
const copy: ExpenseCopy = { workbookId: "synthetic-workbook", initialized: true, commands: [first, corrected, cleared], pending, pendingRestore: null };

function memory(): KeyValueStore & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
}

function alter(store: ReturnType<typeof memory>, change: (value: Record<string, unknown>) => void): void {
  const raw = store.getItem("foliodash.expenses.v1");
  if (raw === null) throw new Error("Missing synthetic copy");
  const value = JSON.parse(raw) as Record<string, unknown>;
  change(value);
  store.setItem("foliodash.expenses.v1", JSON.stringify(value));
}

describe("workbook-bound expense device copy", () => {
  it("round trips correction history, explicit blanks, zeroes and an unresolved command", () => {
    const store = memory();
    const cache = createExpenseCache(() => store);
    expect(cache.save(copy)).toBe(true);
    expect(cache.load()).toEqual(copy);
    expect(cache.load()?.commands).toHaveLength(3);
    expect(cache.load()?.commands[2]?.amounts).toEqual([null, null, null, null, null]);
  });

  it("rejects changed history whose checksum no longer matches", () => {
    const store = memory();
    const cache = createExpenseCache(() => store);
    cache.save(copy);
    alter(store, (value) => { const backup = value["backup"] as { commands: { amounts: number[] }[] }; const item = backup.commands[0]; if (item !== undefined) item.amounts[0] = 999; });
    expect(cache.load()).toBeNull();
  });

  it("rejects an invalid pending command rather than guessing its amounts", () => {
    const store = memory();
    const cache = createExpenseCache(() => store);
    cache.save(copy);
    alter(store, (value) => { value["pending"] = { ...pending, amounts: [0.5, 0, 0, 0, 0] }; });
    expect(cache.load()).toBeNull();
  });

  it("rejects an initialisation flag that contradicts a committed history", () => {
    const store = memory();
    const cache = createExpenseCache(() => store);
    cache.save(copy);
    alter(store, (value) => { value["initialized"] = false; });
    expect(cache.load()).toBeNull();
  });

  it("rejects an empty workbook binding and a reused pending identifier with changed contents", () => {
    const store = memory();
    const cache = createExpenseCache(() => store);
    cache.save(copy);
    alter(store, (value) => { value["workbookId"] = ""; });
    expect(cache.load()).toBeNull();
    cache.save(copy);
    alter(store, (value) => { value["pending"] = { ...first, amounts: [900, 0, 0, 0, 0] }; });
    expect(cache.load()).toBeNull();
  });

  it("keeps synthetic and ordinary copies in independent keys", () => {
    const store = memory();
    const ordinary = createExpenseCache(() => store);
    const synthetic = createExpenseCache(() => store, "synthetic.expenses");
    ordinary.save(copy);
    synthetic.save({ ...copy, workbookId: "another-workbook" });
    synthetic.clear();
    expect(synthetic.load()).toBeNull();
    expect(ordinary.load()?.workbookId).toBe("synthetic-workbook");
  });

  it("preserves a validated unresolved recovery but rejects simultaneous pending save and recovery", () => {
    const store = memory();
    const cache = createExpenseCache(() => store);
    const backup = encodeExpenseBackup([first, corrected, cleared]);
    cache.save({ ...copy, pending: null, pendingRestore: backup });
    expect(cache.load()?.pendingRestore).toBe(backup);
    cache.save({ ...copy, pendingRestore: backup });
    expect(cache.load()).toBeNull();
    cache.save({ ...copy, pending: null, pendingRestore: "{" });
    expect(cache.load()).toBeNull();
  });

  it("survives blocked storage and malformed JSON without promoting an unchecked copy", () => {
    const blocked = createExpenseCache(() => { throw new Error("blocked"); });
    expect(blocked.save(copy)).toBe(false);
    expect(blocked.load()).toBeNull();
    expect(() => { blocked.clear(); }).not.toThrow();
    const store = memory();
    store.setItem("foliodash.expenses.v1", "{");
    expect(createExpenseCache(() => store).load()).toBeNull();
  });
});
