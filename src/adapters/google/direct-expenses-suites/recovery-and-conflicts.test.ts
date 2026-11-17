import { describe, expect, it } from "vitest";
import { createWorkbook } from "../google-workbook";
import {
  decodeExpenseBackup,
  encodeExpenseBackup,
  EXPENSE_LOG_TITLE,
  parseExpenseHistory,
  readExpenses,
  restoreExpenses,
  saveExpense,
} from "../direct-expenses";
import type { RestClient } from "../rest";
import {
  required,
  command,
  setup,
  appendRaw,
  syntheticRecovery,
  setupEmptyExpenseStore,
} from "../../../../tests/fixtures/google-adapters/direct-expenses-support";

describe("direct work expense records", () => {
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
    expect((await restoreExpenses(first.google.client, first.google.token, first.id, [command("one")])).status).toBe(
      "damaged",
    );
    const second = await setup();
    second.google.faults.push({ match: /:batchUpdate/u, network: true });
    expect((await restoreExpenses(second.google.client, second.google.token, second.id, [command("one")])).status).toBe(
      "unavailable",
    );
  });

  it("discovers a renamed record tab by ownership and refuses ambiguous markers", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("one"));
    const tabs = required(google.workbooks.get(id));
    const tab = required(google.tab(id, EXPENSE_LOG_TITLE));
    tabs.delete(EXPENSE_LOG_TITLE);
    tabs.set("My renamed expense log", tab);
    expect((await readExpenses(google.client, google.token, id)).status).toBe("ok");
    expect((await saveExpense(google.client, google.token, id, command("two", undefined, "one"), true)).status).toBe(
      "saved",
    );
    tab.developerMetadata.push({
      metadataKey: "foliodash.expenses",
      metadataValue: "records-v1",
      location: { sheetId: tab.id },
    });
    expect((await readExpenses(google.client, google.token, id)).status).toBe("damaged");
  });

  it("detects same-day concurrent branches and resolves explicitly without losing either version", async () => {
    const { google, id } = await setup();
    await saveExpense(google.client, google.token, id, command("base"));
    let interleaved = false;
    const rest: RestClient = async (request) => {
      if (!interleaved && request.method === "POST" && request.url.includes(":append")) {
        interleaved = true;
        await saveExpense(
          google.client,
          google.token,
          id,
          command("other", undefined, "base", [0, 2000, 0, 0, 0]),
          true,
        );
      }
      return google.client(request);
    };
    expect(
      (await saveExpense(rest, google.token, id, command("mine", undefined, "base", [0, 3000, 0, 0, 0]), true)).status,
    ).toBe("conflict");
    const conflicted = await readExpenses(google.client, google.token, id, true);
    if (conflicted.status !== "ok") throw new Error("Expected checked conflict history");
    expect(conflicted.days).toEqual([]);
    expect(conflicted.conflicts[0]?.versions).toHaveLength(2);
    const resolved = await saveExpense(
      google.client,
      google.token,
      id,
      command("resolution", undefined, required(conflicted.conflicts[0]).revision, [0, 2500, 0, 0, 0]),
      true,
    );
    expect(resolved.status).toBe("saved");
    const read = await readExpenses(google.client, google.token, id, true);
    expect(read.status === "ok" && read.conflicts).toEqual([]);
    expect(read.status === "ok" && read.commands.map((item) => item.id)).toEqual([
      "base",
      "other",
      "mine",
      "resolution",
    ]);
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
    expect(
      (await restoreExpenses(google.client, google.token, target.value.id, required(decoded).commands)).status,
    ).toBe("ok");
    expect(google.callsMatching(/:append|:batchUpdate/u)).toHaveLength(writes);
    expect(
      (await restoreExpenses(google.client, google.token, target.value.id, [command("different-recovery")])).status,
    ).toBe("damaged");
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
    expect(
      google.requests
        .slice(requests)
        .some(
          (request) =>
            "addSheet" in request &&
            (request["addSheet"] as { properties?: { title?: string } }).properties?.title?.startsWith(
              EXPENSE_LOG_TITLE,
            ),
        ),
    ).toBe(false);
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
    expect((await restoreExpenses(first.google.client, first.google.token, first.id, syntheticRecovery())).status).toBe(
      "damaged",
    );
    expect(required(first.google.tab(first.id, EXPENSE_LOG_TITLE)).rows).toHaveLength(1);
    const second = await setupEmptyExpenseStore();
    second.google.faults.push({ match: /:append/u, network: true });
    const before = second.google.callsMatching(/:append/u).length;
    expect(
      (await restoreExpenses(second.google.client, second.google.token, second.id, syntheticRecovery())).status,
    ).toBe("unavailable");
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
    expect(result.status === "ok" && result.commands.map((item) => item.id)).toEqual([
      "concurrent-day",
      ...entries.map((entry) => entry.id),
    ]);
    expect(result.status === "ok" && result.conflicts).toEqual([]);
  });

  it("surfaces a same-day race as a conflict without replacing either version", async () => {
    const { google, id } = await setupEmptyExpenseStore();
    const entries = syntheticRecovery();
    let interleaved = false;
    const rest: RestClient = async (request) => {
      if (!interleaved && request.method === "POST" && request.url.includes(":append")) {
        interleaved = true;
        await saveExpense(
          google.client,
          google.token,
          id,
          command("concurrent-same-day", required(entries[0]).date),
          true,
        );
      }
      return google.client(request);
    };
    const result = await restoreExpenses(rest, google.token, id, entries);
    expect(result.status === "ok" && result.commands).toHaveLength(221);
    expect(result.status === "ok" && result.conflicts[0]?.versions.map((version) => version.revision).sort()).toEqual(
      ["concurrent-same-day", required(entries[0]).id].sort(),
    );
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
    expect(
      decodeExpenseBackup({
        format: "foliodash-work-expenses",
        version: 1,
        commands: [command("one")],
        checksum: "wrong",
      }),
    ).toBeNull();
    expect(parseExpenseHistory([command("one"), command("one")])?.commands).toHaveLength(1);
    expect(
      decodeExpenseBackup({ format: "foliodash-work-expenses", version: 1, commands: [{ unsupported: undefined }] }),
    ).toBeNull();
    expect(parseExpenseHistory([command("conflict:reserved")])).toBeNull();
  });
});
