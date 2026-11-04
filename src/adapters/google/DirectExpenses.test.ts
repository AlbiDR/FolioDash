import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../tests/fixtures/FakeGoogle";
import { canonicalJson } from "../../core/CanonicalJson";
import { parseIsoDate } from "../../core/IsoDate";
import { sha256Hex } from "../../core/Sha256";
import { parseExpenseAmounts, type ExpenseCommand } from "../../core/WorkExpenses";
import { createWorkbook, writeGridTabs } from "./GoogleWorkbook";
import { bufferedGrid, plainCell } from "../../applications/SheetGrid";
import { checkExpense, decodeExpenseBackup, encodeExpenseBackup, EXPENSE_LOG_TITLE, EXPENSE_VIEW_TITLE, parseExpenseHistory, readExpenses, restoreExpenses, saveExpense } from "./DirectExpenses";
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

describe("direct work expense records", () => {
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
    expect(rows[4]?.[8]).toBe("No work");
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
    expect((await restoreExpenses(google.client, google.token, target.value.id, required(decoded).commands)).status).toBe("damaged");
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
