import { expect } from "vitest";
import { FakeGoogle } from "../fake-google";
import { canonicalJson } from "../../../src/core/integrity/canonical-json";
import { parseIsoDate } from "../../../src/core/values/iso-date";
import { sha256Hex } from "../../../src/core/integrity/sha256";
import {
  isWorkday,
  shiftDate,
  parseExpenseAmounts,
  type ExpenseCommand,
} from "../../../src/core/expenses/work-expenses";
import { createWorkbook } from "../../../src/adapters/google/google-workbook";
import { EXPENSE_LOG_TITLE, readExpenses, saveExpense } from "../../../src/adapters/google/direct-expenses";

export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test fixture value");
  return value;
}

export const command = (
  id: string,
  date = "2026-11-04",
  previous: string | null = null,
  amounts: readonly (number | null)[] = [0, 1200, 0, 0, 200],
): ExpenseCommand => ({
  id,
  date: required(parseIsoDate(date)),
  expectedRevision: previous,
  amounts: required(parseExpenseAmounts(amounts)),
});
export async function setup(): Promise<{ google: FakeGoogle; id: string }> {
  const google = new FakeGoogle();
  const workbook = await createWorkbook(google.client, google.token);
  if (!workbook.ok) throw new Error("Fixture workbook creation failed");
  return { google, id: workbook.value.id };
}
export function appendRaw(google: FakeGoogle, id: string, entry: ExpenseCommand): void {
  const text = canonicalJson(entry);
  required(google.tab(id, EXPENSE_LOG_TITLE)).rows.push(["1", text, sha256Hex(text)]);
}

export function syntheticRecovery(count = 220): ExpenseCommand[] {
  const entries: ExpenseCommand[] = [];
  let date = required(parseIsoDate("2024-01-01"));
  while (entries.length < count) {
    if (isWorkday(date))
      entries.push(
        command(
          `synthetic-recovery-${String(entries.length)}`,
          date,
          null,
          entries.length % 4 === 0 ? [null, null, null, null, null] : [0, 500, 0, null, null],
        ),
      );
    date = required(shiftDate(date, 1));
  }
  return entries;
}

export async function setupEmptyExpenseStore(): Promise<{ google: FakeGoogle; id: string }> {
  const fixture = await setup();
  fixture.google.faults.push({ match: /:append/u, status: 403 });
  expect(
    (await saveExpense(fixture.google.client, fixture.google.token, fixture.id, command("unsent-first-day"))).status,
  ).toBe("not-saved");
  const checked = await readExpenses(fixture.google.client, fixture.google.token, fixture.id);
  expect(checked.status === "ok" && checked.commands).toEqual([]);
  return fixture;
}
