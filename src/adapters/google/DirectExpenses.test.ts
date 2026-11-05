import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../tests/fixtures/FakeGoogle";
import { canonicalJson } from "../../core/CanonicalJson";
import { parseIsoDate } from "../../core/IsoDate";
import { sha256Hex } from "../../core/Sha256";
import { isWorkday, shiftDate, parseExpenseAmounts, type ExpenseCommand } from "../../core/WorkExpenses";
import { createWorkbook, writeGridTabs } from "./GoogleWorkbook";
import { bufferedGrid, plainCell } from "../../applications/SheetGrid";
import { checkExpense, decodeExpenseBackup, encodeExpenseBackup, EXPENSE_LOG_TITLE, EXPENSE_VIEW_TITLE, parseExpenseHistory, readExpenses, refreshExpenseView, restoreExpenses, saveExpense } from "./DirectExpenses";
import type { RestClient } from "./Rest";
import { LEDGER_TAB } from "./SheetsLayout";

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test fixture value");
  return value;
}

const command = (id: string, date = "2026-11-04", previous: string | null = null, amounts: readonly (number | null)[] = [0, 1200, 0, 0, 200]): ExpenseCommand => ({
  id, date: required(parseIsoDate(date)), expectedRevision: previous, amounts: required(parseExpenseAmounts(amounts)),
});
async function setup(): Promise<{ google: FakeGoogle; id: string }> {
  const google = new FakeGoogle();
  const workbook = await createWorkbook(google.client, google.token);
  if (!workbook.ok) throw new Error("Fixture workbook creation failed");
  return { google, id: workbook.value.id };
}
function appendRaw(google: FakeGoogle, id: string, entry: ExpenseCommand): void {
  const text = canonicalJson(entry);
  required(google.tab(id, EXPENSE_LOG_TITLE)).rows.push(["1", text, sha256Hex(text)]);
}

function syntheticRecovery(count = 220): ExpenseCommand[] {
  const entries: ExpenseCommand[] = [];
  let date = required(parseIsoDate("2024-01-01"));
  while (entries.length < count) {
    if (isWorkday(date)) entries.push(command(`synthetic-recovery-${String(entries.length)}`, date, null, entries.length % 4 === 0 ? [null, null, null, null, null] : [0, 500, 0, null, null]));
    date = required(shiftDate(date, 1));
  }
  return entries;
}

async function setupEmptyExpenseStore(): Promise<{ google: FakeGoogle; id: string }> {
  const fixture = await setup();
  fixture.google.faults.push({ match: /:append/u, status: 403 });
  expect((await saveExpense(fixture.google.client, fixture.google.token, fixture.id, command("unsent-first-day"))).status).toBe("not-saved");
  const checked = await readExpenses(fixture.google.client, fixture.google.token, fixture.id);
  expect(checked.status === "ok" && checked.commands).toEqual([]);
  return fixture;
}

describe("direct work expense records", () => {
  it("classifies old optional blanks through the current policy without changing committed records or backups", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("required-only", "2026-11-02", null, [100, 700, 100, null, null]));
    await saveExpense(google.client, google.token, id, command("extras-paid", "2026-11-03", null, [100, 500, 100, 300, 200]), true);
    const before = await readExpenses(google.client, google.token, id, true);
    if (before.status !== "ok") throw new Error("Synthetic expense setup failed");
    const rowsBefore = canonicalJson(required(google.tab(id, EXPENSE_LOG_TITLE)).rows);
    const backupBefore = encodeExpenseBackup(before.commands);
    expect(await refreshExpenseView(google.client, google.token, id, before.days, [], required(parseIsoDate("2026-11-05")))).toBe(true);
    const view = required(google.tab(id, EXPENSE_VIEW_TITLE)).rows;
    expect(view[3]?.[5]).toBe("Dinner (optional)");
    expect(view[3]?.[6]).toBe("Other Expenses (optional)");
    expect(view[4]?.slice(2, 7)).toEqual([1, 7, 1, "", ""]);
    expect(view[4]?.[8]).toBe("Recorded workday");
    expect(view.find(row => row[1] === "Average Daily")?.[2]).toBe(10.5);
    expect(view.find(row => row[1] === "Total Yearly")?.[2]).toBe(21);
    expect(canonicalJson(required(google.tab(id, EXPENSE_LOG_TITLE)).rows)).toBe(rowsBefore);
    const after = await readExpenses(google.client, google.token, id, true);
    expect(after.status === "ok" && encodeExpenseBackup(after.commands)).toBe(backupBefore);
    expect(after.status === "ok" && after.days[0]?.amounts).toEqual([100, 700, 100, null, null]);
  });
  it("refuses a future expense before creating or writing its records", async () => {
    const { google, id } = await setup();
    const before = google.calls.length;
    const result = await saveExpense(google.client, google.token, id, command("future", "2026-11-06"), false, required(parseIsoDate("2026-11-05")));
    expect(result.status).toBe("not-saved");
    expect(google.calls.length).toBe(before);
    expect(await readExpenses(google.client, google.token, id)).toEqual({ status: "absent" });
  });
  it("reads a portfolio-only workbook without creating any tabs", async () => {
    const { google, id } = await setup();
    const before = google.calls.length;
    expect(await readExpenses(google.client, google.token, id)).toEqual({ status: "absent" });
    expect(google.calls.slice(before).every((call) => call.startsWith("GET"))).toBe(true);
  });

  it("initialises explicitly, saves cents and real zeroes, and writes typed readable values", async () => {
    const { google, id } = await setup();
    const originalPortfolio = required(google.tab(id, LEDGER_TAB)).rows.map((row) => [...row]);
    const saved = await saveExpense(google.client, google.token, id, command("one"));
    expect(saved.status).toBe("saved");
    const read = await readExpenses(google.client, google.token, id, true);
    expect(read.status === "ok" && read.days[0]?.amounts).toEqual([0, 1200, 0, 0, 200]);
    expect(required(google.tab(id, LEDGER_TAB)).rows).toEqual(originalPortfolio);
    const view = required(google.tab(id, EXPENSE_VIEW_TITLE));
    expect(view.rows[4]?.[1]).toBeTypeOf("number");
    expect(view.rows[4]?.slice(2, 7)).toEqual([0, 12, 0, 0, 2]);
    expect(view.formats[4]?.[1]?.["numberFormat"]).toEqual({ type: "DATE", pattern: "dd/mm/yyyy" });
  });

  it("keeps partial blanks distinct from explicit zeroes and preserves correction history", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("one"));
    expect((await saveExpense(google.client, google.token, id, command("two", undefined, "one", [null, 0, null, null, null]), true)).status).toBe("saved");
    const read = await readExpenses(google.client, google.token, id, true);
    expect(read.status === "ok" && read.commands.length).toBe(2);
    expect(read.status === "ok" && read.days[0]?.amounts).toEqual([null, 0, null, null, null]);
    expect(required(google.tab(id, EXPENSE_VIEW_TITLE)).rows[4]?.slice(2, 7)).toEqual(["", 0, "", "", ""]);
  });

  it("refuses stale correction and reusing an identifier for changed values", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("one"));
    const before = required(google.tab(id, EXPENSE_LOG_TITLE)).rows.length;
    expect((await saveExpense(google.client, google.token, id, command("stale"), true)).status).toBe("conflict");
    expect((await saveExpense(google.client, google.token, id, command("one", undefined, null, [1, 0, 0, 0, 0]), true)).status).toBe("not-saved");
    expect(required(google.tab(id, EXPENSE_LOG_TITLE)).rows.length).toBe(before);
  });

  it("reconciles a lost append response and replay does not append again", async () => {
    const { google, id } = await setup();
    google.faults.push({ match: /:append/u, network: true, applyFirst: true });
    const first = await saveExpense(google.client, google.token, id, command("one"));
    expect(first.status).toBe("saved");
    expect((await saveExpense(google.client, google.token, id, command("one"), true)).status).toBe("saved");
    expect(required(google.tab(id, EXPENSE_LOG_TITLE)).rows).toHaveLength(2);
  });

  it("keeps an unconfirmed failed append unknown and read-only checking never retries", async () => {
    const { google, id } = await setup();
    google.faults.push({ match: /:append/u, network: true });
    expect((await saveExpense(google.client, google.token, id, command("one"))).status).toBe("unknown");
    const count = google.callsMatching(/:append/u).length;
    expect((await checkExpense(google.client, google.token, id, command("one"))).status).toBe("unknown");
    expect(google.callsMatching(/:append/u)).toHaveLength(count);
  });

  it("distinguishes a rejected save from uncertain commit", async () => {
    const { google, id } = await setup();
    google.faults.push({ match: /:append/u, status: 403 });
    expect((await saveExpense(google.client, google.token, id, command("one"))).status).toBe("not-saved");
  });

  it("detects deleted history across a fresh device through the durable anchor", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("one"));
    required(google.workbooks.get(id)).delete(EXPENSE_LOG_TITLE);
    expect((await readExpenses(google.client, google.token, id)).status).toBe("damaged");
    expect((await saveExpense(google.client, google.token, id, command("two"))).status).toBe("not-saved");
    expect(google.tab(id, EXPENSE_LOG_TITLE)).toBeUndefined();
  });

  it("never adopts an unowned records or view tab with the same name", async () => {
    const { google, id } = await setup();
    const grid = bufferedGrid([[plainCell("personal note")]]);
    await writeGridTabs(google.client, google.token, id, [{ title: EXPENSE_LOG_TITLE, grid }, { title: EXPENSE_VIEW_TITLE, grid }]);
    const record = required(google.tab(id, EXPENSE_LOG_TITLE));
    const view = required(google.tab(id, EXPENSE_VIEW_TITLE));
    record.developerMetadata = [];
    view.developerMetadata = [];
    const before = record.rows.map((row) => [...row]);
    expect((await saveExpense(google.client, google.token, id, command("one"))).status).toBe("saved");
    expect(record.rows).toEqual(before);
    expect(view.rows).toEqual(before);
    expect(google.tab(id, `${EXPENSE_LOG_TITLE} (2)`)).toBeDefined();
    expect(google.tab(id, `${EXPENSE_VIEW_TITLE} (2)`)).toBeDefined();
  });

  it("rejects corruption and unsupported schema without repairing it", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("one"));
    required(required(google.tab(id, EXPENSE_LOG_TITLE)).rows[1])[2] = "wrong";
    expect((await readExpenses(google.client, google.token, id)).status).toBe("damaged");
    expect((await saveExpense(google.client, google.token, id, command("two"), true)).status).toBe("not-saved");
  });

  it("refuses a view marker on a financial record tab before any destructive batch", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("one"));
    const tab = required(google.tab(id, EXPENSE_LOG_TITLE));
    tab.developerMetadata.push({ metadataKey: "foliodash.view", metadataValue: EXPENSE_VIEW_TITLE, location: { sheetId: tab.id } });
    const before = tab.rows.map((row) => [...row]);
    const written = await writeGridTabs(google.client, google.token, id, [{ title: EXPENSE_VIEW_TITLE, grid: bufferedGrid([[plainCell("replace")]]) }]);
    expect(written.ok).toBe(false);
    expect(tab.rows).toEqual(before);
  });

  it("keeps no-work totals blank and writes the five canonical recap metrics when an as-of date is supplied", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("blank", "2026-11-03", null, [null, null, null, null, null]));
    expect((await saveExpense(google.client, google.token, id, command("zero", undefined, null, [0, 0, 0, 0, 0]), true, required(parseIsoDate("2026-11-05")))).status).toBe("saved");
    const rows = required(google.tab(id, EXPENSE_VIEW_TITLE)).rows;
    expect(rows[4]?.[7]).toBe("");
    expect(rows[4]?.[8]).toBe("No onsite work");
    expect(rows[5]?.[7]).toBe(0);
    for (const label of ["Average Daily", "Average Weekly", "Average Monthly", "Total Yearly", "Yearly Projection (estimate)"]) expect(rows.some((row) => row[1] === label)).toBe(true);
    expect(rows.find((row) => row[1] === "Average Daily")?.[2]).toBe(0);
  });

  it("reconciles lost atomic setup response without adding another log", async () => {
    const { google, id } = await setup();
    google.faults.push({ match: /:batchUpdate/u, network: true, applyFirst: true });
    expect((await saveExpense(google.client, google.token, id, command("one"))).status).toBe("saved");
    const tabs = [...required(google.workbooks.get(id)).keys()].filter((title) => title.startsWith(EXPENSE_LOG_TITLE));
    expect(tabs).toHaveLength(1);
  });

  it("leaves setup absent if the atomic creation batch is refused", async () => {
    const { google, id } = await setup();
    google.faults.push({ match: /:batchUpdate/u, status: 403 });
    expect((await saveExpense(google.client, google.token, id, command("one"))).status).toBe("not-saved");
    expect(await readExpenses(google.client, google.token, id)).toEqual({ status: "absent" });
    expect(google.tab(id, EXPENSE_LOG_TITLE)).toBeUndefined();
  });

  it("reports an unsent command as not saved when setup succeeds but its confirmation read fails", async () => {
    const { google, id } = await setup();
    let setupWritten = false;
    const rest: RestClient = async (request) => {
      if (request.method === "POST" && request.url.includes(":batchUpdate")) {
        const response = await google.client(request);
        setupWritten = true;
        return response;
      }
      if (setupWritten && request.method === "GET") throw new Error("Lost read after structural setup");
      return google.client(request);
    };
    expect((await saveExpense(rest, google.token, id, command("not-submitted"))).status).toBe("not-saved");
    expect(google.callsMatching(/:append/u)).toHaveLength(0);
    expect((await saveExpense(google.client, google.token, id, command("next-attempt"))).status).toBe("saved");
  });

  it("distinguishes refused recovery from an unconfirmed lost recovery response", async () => {
    const first = await setup();
    first.google.faults.push({ match: /:batchUpdate/u, status: 403 });
    expect((await restoreExpenses(first.google.client, first.google.token, first.id, [command("one")])).status).toBe("damaged");
    const second = await setup();
    second.google.faults.push({ match: /:batchUpdate/u, network: true });
    expect((await restoreExpenses(second.google.client, second.google.token, second.id, [command("one")])).status).toBe("unavailable");
  });

  it("discovers a renamed record tab by ownership and refuses ambiguous markers", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("one"));
    const tabs = required(google.workbooks.get(id));
    const tab = required(google.tab(id, EXPENSE_LOG_TITLE));
    tabs.delete(EXPENSE_LOG_TITLE);
    tabs.set("My renamed expense log", tab);
    expect((await readExpenses(google.client, google.token, id)).status).toBe("ok");
    expect((await saveExpense(google.client, google.token, id, command("two", undefined, "one"), true)).status).toBe("saved");
    tab.developerMetadata.push({ metadataKey: "foliodash.expenses", metadataValue: "records-v1", location: { sheetId: tab.id } });
    expect((await readExpenses(google.client, google.token, id)).status).toBe("damaged");
  });

  it("detects same-day concurrent branches and resolves explicitly without losing either version", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("base"));
    let interleaved = false;
    const rest: RestClient = async (request) => {
      if (!interleaved && request.method === "POST" && request.url.includes(":append")) {
        interleaved = true;
        await saveExpense(google.client, google.token, id, command("other", undefined, "base", [0, 2000, 0, 0, 0]), true);
      }
      return google.client(request);
    };
    expect((await saveExpense(rest, google.token, id, command("mine", undefined, "base", [0, 3000, 0, 0, 0]), true)).status).toBe("conflict");
    const conflicted = await readExpenses(google.client, google.token, id, true);
    if (conflicted.status !== "ok") throw new Error("Expected checked conflict history");
    expect(conflicted.days).toEqual([]);
    expect(conflicted.conflicts[0]?.versions).toHaveLength(2);
    const resolved = await saveExpense(google.client, google.token, id, command("resolution", undefined, required(conflicted.conflicts[0]).revision, [0, 2500, 0, 0, 0]), true);
    expect(resolved.status).toBe("saved");
    const read = await readExpenses(google.client, google.token, id, true);
    expect(read.status === "ok" && read.conflicts).toEqual([]);
    expect(read.status === "ok" && read.commands.map((item) => item.id)).toEqual(["base", "other", "mine", "resolution"]);
  });

  it("preserves concurrent saves on different days without false conflict", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("base"));
    let interleaved = false;
    const rest: RestClient = async (request) => {
      if (!interleaved && request.method === "POST" && request.url.includes(":append")) {
        interleaved = true;
        await saveExpense(google.client, google.token, id, command("other", "2026-11-03"), true);
      }
      return google.client(request);
    };
    expect((await saveExpense(rest, google.token, id, command("mine", undefined, "base"), true)).status).toBe("saved");
    const read = await readExpenses(google.client, google.token, id);
    expect(read.status === "ok" && read.days).toHaveLength(2);
  });

  it("exports and restores exact history atomically into a fresh store, including conflict evidence", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("one"));
    appendRaw(google, id, command("two"));
    const original = await readExpenses(google.client, google.token, id);
    if (original.status !== "ok") throw new Error("Expected checked original");
    const backup = JSON.parse(encodeExpenseBackup(original.commands)) as unknown;
    const decoded = decodeExpenseBackup(backup);
    expect(decoded).toEqual({ days: original.days, commands: original.commands, conflicts: original.conflicts });
    const target = await createWorkbook(google.client, google.token);
    if (!target.ok) throw new Error("Expected target workbook");
    google.faults.push({ match: /:batchUpdate/u, network: true, applyFirst: true });
    const restored = await restoreExpenses(google.client, google.token, target.value.id, required(decoded).commands);
    expect(restored.status === "ok" && restored.commands).toEqual(original.commands);
    const writes = google.callsMatching(/:append|:batchUpdate/u).length;
    expect((await restoreExpenses(google.client, google.token, target.value.id, required(decoded).commands)).status).toBe("ok");
    expect(google.callsMatching(/:append|:batchUpdate/u)).toHaveLength(writes);
    expect((await restoreExpenses(google.client, google.token, target.value.id, [command("different-recovery")])).status).toBe("damaged");
  });

  it("restores all 220 synthetic commands into an owned empty log without resetting it", async () => {
    const { google, id } = await setupEmptyExpenseStore();
    const log = required(google.tab(id, EXPENSE_LOG_TITLE));
    const header = required(log.rows[0]).slice();
    const originalId = log.id;
    const requests = google.requests.length;
    const beforeAppend = google.callsMatching(/:append/u).length;
    const entries = syntheticRecovery();
    const restored = await restoreExpenses(google.client, google.token, id, entries);
    expect(restored.status === "ok" && restored.commands).toEqual(entries);
    expect(required(google.tab(id, EXPENSE_LOG_TITLE)).id).toBe(originalId);
    expect(required(google.tab(id, EXPENSE_LOG_TITLE)).rows[0]).toEqual(header);
    expect(required(google.tab(id, EXPENSE_LOG_TITLE)).rows).toHaveLength(221);
    expect(google.callsMatching(/:append/u)).toHaveLength(beforeAppend + 1);
    expect(google.requests.slice(requests).some((request) => "addSheet" in request && (request["addSheet"] as { properties?: { title?: string } }).properties?.title?.startsWith(EXPENSE_LOG_TITLE))).toBe(false);
    const rechecked = await restoreExpenses(google.client, google.token, id, entries);
    expect(rechecked.status === "ok" && rechecked.commands).toEqual(entries);
    expect(google.callsMatching(/:append/u)).toHaveLength(beforeAppend + 1);
  });

  it("refuses populated recovery targets and pre-write read failures without appending", async () => {
    const { google, id } = await setupEmptyExpenseStore();
    await saveExpense(google.client, google.token, id, command("existing"), true);
    const before = google.callsMatching(/:append/u).length;
    expect((await restoreExpenses(google.client, google.token, id, syntheticRecovery())).status).toBe("damaged");
    expect(google.callsMatching(/:append/u)).toHaveLength(before);
    const unavailable: RestClient = () => Promise.resolve({ status: 503, json: () => Promise.resolve({}) });
    expect((await restoreExpenses(unavailable, google.token, id, syntheticRecovery())).status).toBe("damaged");
    expect(google.callsMatching(/:append/u)).toHaveLength(before);
  });

  it("reconciles a lost bulk append response without a second recovery write", async () => {
    const { google, id } = await setupEmptyExpenseStore();
    const entries = syntheticRecovery();
    google.faults.push({ match: /:append/u, network: true, applyFirst: true });
    const before = google.callsMatching(/:append/u).length;
    expect((await restoreExpenses(google.client, google.token, id, entries)).status).toBe("ok");
    expect((await restoreExpenses(google.client, google.token, id, entries)).status).toBe("ok");
    expect(google.callsMatching(/:append/u)).toHaveLength(before + 1);
    expect(required(google.tab(id, EXPENSE_LOG_TITLE)).rows).toHaveLength(221);
  });

  it("distinguishes a refused bulk append from an unconfirmed lost response", async () => {
    const first = await setupEmptyExpenseStore();
    first.google.faults.push({ match: /:append/u, status: 403 });
    expect((await restoreExpenses(first.google.client, first.google.token, first.id, syntheticRecovery())).status).toBe("damaged");
    expect(required(first.google.tab(first.id, EXPENSE_LOG_TITLE)).rows).toHaveLength(1);
    const second = await setupEmptyExpenseStore();
    second.google.faults.push({ match: /:append/u, network: true });
    const before = second.google.callsMatching(/:append/u).length;
    expect((await restoreExpenses(second.google.client, second.google.token, second.id, syntheticRecovery())).status).toBe("unavailable");
    expect((await readExpenses(second.google.client, second.google.token, second.id)).status).toBe("ok");
    expect(second.google.callsMatching(/:append/u)).toHaveLength(before + 1);
  });

  it("preserves a new competing day while appending recovery into an empty log", async () => {
    const { google, id } = await setupEmptyExpenseStore();
    const entries = syntheticRecovery();
    let interleaved = false;
    const rest: RestClient = async (request) => {
      if (!interleaved && request.method === "POST" && request.url.includes(":append")) {
        interleaved = true;
        await saveExpense(google.client, google.token, id, command("concurrent-day", "2024-12-31"), true);
      }
      return google.client(request);
    };
    const result = await restoreExpenses(rest, google.token, id, entries);
    expect(result.status === "ok" && result.commands.map((item) => item.id)).toEqual(["concurrent-day", ...entries.map((entry) => entry.id)]);
    expect(result.status === "ok" && result.conflicts).toEqual([]);
  });

  it("surfaces a same-day race as a conflict without replacing either version", async () => {
    const { google, id } = await setupEmptyExpenseStore();
    const entries = syntheticRecovery();
    let interleaved = false;
    const rest: RestClient = async (request) => {
      if (!interleaved && request.method === "POST" && request.url.includes(":append")) {
        interleaved = true;
        await saveExpense(google.client, google.token, id, command("concurrent-same-day", required(entries[0]).date), true);
      }
      return google.client(request);
    };
    const result = await restoreExpenses(rest, google.token, id, entries);
    expect(result.status === "ok" && result.commands).toHaveLength(221);
    expect(result.status === "ok" && result.conflicts[0]?.versions.map((version) => version.revision).sort()).toEqual(["concurrent-same-day", required(entries[0]).id].sort());
    expect(result.status === "ok" && result.days).toHaveLength(219);
  });

  it("confirms atomic recovery even if another device saves afterward before its read-back", async () => {
    const { google, id } = await setup();
    let restored = false;
    const rest: RestClient = async (request) => {
      const response = await google.client(request);
      if (!restored && request.method === "POST" && request.url.includes(":batchUpdate")) {
        restored = true;
        await saveExpense(google.client, google.token, id, command("later", "2026-11-05"), true);
      }
      return response;
    };
    const result = await restoreExpenses(rest, google.token, id, [command("restored")]);
    expect(result.status === "ok" && result.commands.map((item) => item.id)).toEqual(["restored", "later"]);
  });

  it("rejects invalid backups, missing predecessors, changed command ids and malformed values", () => {
    expect(parseExpenseHistory([command("one", undefined, "missing")])).toBeNull();
    expect(parseExpenseHistory([command("one"), command("one", undefined, null, [1, 0, 0, 0, 0])])).toBeNull();
    expect(parseExpenseHistory([{ ...command("one"), amounts: [0, 0] }])).toBeNull();
    expect(decodeExpenseBackup({ format: "foliodash-work-expenses", version: 1, commands: [command("one")], checksum: "wrong" })).toBeNull();
    expect(parseExpenseHistory([command("one"), command("one")])?.commands).toHaveLength(1);
    expect(decodeExpenseBackup({ format: "foliodash-work-expenses", version: 1, commands: [{ unsupported: undefined }] })).toBeNull();
    expect(parseExpenseHistory([command("conflict:reserved")])).toBeNull();
  });
});
