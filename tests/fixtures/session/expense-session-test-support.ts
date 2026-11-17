import { FakeGoogle } from "../fake-google";
import { createExpenseCache } from "../../../src/adapters/browser/storage/expense-cache";
import type { KeyValueStore } from "../../../src/adapters/browser/storage/ledger-cache";
import { createWorkbook } from "../../../src/adapters/google/google-workbook";
import type { RestClient } from "../../../src/adapters/google/rest";
import { parseExpenseCommand, type ExpenseCommand } from "../../../src/core/expenses/work-expenses";
import { ExpenseSession } from "../../../src/interfaces/web/app/session/expense-session";

export function command(value: unknown): ExpenseCommand {
  const parsed = parseExpenseCommand(value);
  if (parsed === null) throw new Error("Invalid synthetic command");
  return parsed;
}
export const first = command({
  id: "unused",
  date: "2026-11-02",
  amounts: [100, 500, 0, 0, 0],
  expectedRevision: null,
});
export const request = { date: first.date, amounts: first.amounts, expectedRevision: first.expectedRevision };

export function memory(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export async function world() {
  const google = new FakeGoogle();
  const created = await createWorkbook(google.client, google.token);
  if (!created.ok) throw new Error("Synthetic workbook setup failed");
  let active = created.value;
  const store = memory();
  const boundCache = createExpenseCache(() => store);
  let ids = 0;
  let rest: RestClient = google.client;
  const access = () => Promise.resolve({ ok: true as const, token: google.token, workbook: active });
  const make = () =>
    new ExpenseSession({
      rest: (call) => rest(call),
      cache: boundCache,
      newId: () => `synthetic-${String(++ids)}`,
      access,
    });
  const session = make();
  await session.refresh();
  return {
    google,
    boundCache,
    store,
    session,
    make,
    access,
    setRest: (next: RestClient) => {
      rest = next;
    },
    setWorkbook: (next: typeof active) => {
      active = next;
    },
    workbook: created.value,
  };
}
