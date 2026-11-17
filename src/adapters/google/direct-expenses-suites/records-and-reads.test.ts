import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../../core/integrity/canonical-json";
import { parseIsoDate } from "../../../core/values/iso-date";
import { writeGridTabs } from "../google-workbook";
import { bufferedGrid, plainCell } from "../../../applications/ledger/sheet-grid";
import {
  checkExpense,
  encodeExpenseBackup,
  EXPENSE_LOG_TITLE,
  EXPENSE_VIEW_TITLE,
  readExpenses,
  refreshExpenseView,
  saveExpense,
} from "../direct-expenses";
import { LEDGER_TAB } from "../sheets-layout";
import { required, command, setup } from "../../../../tests/fixtures/google-adapters/direct-expenses-support";

describe("direct work expense records", () => {
  it("classifies old optional blanks through the current policy without changing committed records or backups", async () => {
    const { google, id } = await setup();
    await saveExpense(
      google.client,
      google.token,
      id,
      command("required-only", "2026-11-02", null, [100, 700, 100, null, null]),
    );
    await saveExpense(
      google.client,
      google.token,
      id,
      command("extras-paid", "2026-11-03", null, [100, 500, 100, 300, 200]),
      true,
    );
    const before = await readExpenses(google.client, google.token, id, true);
    if (before.status !== "ok") throw new Error("Synthetic expense setup failed");
    const rowsBefore = canonicalJson(required(google.tab(id, EXPENSE_LOG_TITLE)).rows);
    const backupBefore = encodeExpenseBackup(before.commands);
    expect(
      await refreshExpenseView(google.client, google.token, id, before.days, [], required(parseIsoDate("2026-11-05"))),
    ).toBe(true);
    const view = required(google.tab(id, EXPENSE_VIEW_TITLE)).rows;
    expect(view[3]?.[5]).toBe("Dinner (optional)");
    expect(view[3]?.[6]).toBe("Other Expenses (optional)");
    expect(view[4]?.slice(2, 7)).toEqual([1, 7, 1, "", ""]);
    expect(view[4]?.[8]).toBe("Recorded workday");
    expect(view.find((row) => row[1] === "Average Daily")?.[2]).toBe(10.5);
    expect(view.find((row) => row[1] === "Total Yearly")?.[2]).toBe(21);
    expect(canonicalJson(required(google.tab(id, EXPENSE_LOG_TITLE)).rows)).toBe(rowsBefore);
    const after = await readExpenses(google.client, google.token, id, true);
    expect(after.status === "ok" && encodeExpenseBackup(after.commands)).toBe(backupBefore);
    expect(after.status === "ok" && after.days[0]?.amounts).toEqual([100, 700, 100, null, null]);
  });
  it("shows optional-only days as recorded while retaining blanks and backup bytes", async () => {
    const { google, id } = await setup();
    await saveExpense(
      google.client,
      google.token,
      id,
      command("dinner-only", "2026-11-02", null, [null, null, null, 1500, null]),
    );
    await saveExpense(
      google.client,
      google.token,
      id,
      command("other-zero", "2026-11-03", null, [null, null, null, null, 0]),
      true,
    );
    const before = await readExpenses(google.client, google.token, id, true);
    if (before.status !== "ok") throw new Error("Synthetic expense setup failed");
    const rowsBefore = canonicalJson(required(google.tab(id, EXPENSE_LOG_TITLE)).rows);
    const backupBefore = encodeExpenseBackup(before.commands);
    expect(
      await refreshExpenseView(google.client, google.token, id, before.days, [], required(parseIsoDate("2026-11-05"))),
    ).toBe(true);
    const view = required(google.tab(id, EXPENSE_VIEW_TITLE)).rows;
    expect(view[4]?.slice(2, 7)).toEqual(["", "", "", 15, ""]);
    expect(view[4]?.[8]).toBe("Recorded workday");
    expect(view[5]?.slice(2, 7)).toEqual(["", "", "", "", 0]);
    expect(view[5]?.[8]).toBe("Recorded workday");
    expect(view.find((row) => row[1] === "Average Daily")?.[2]).toBe(7.5);
    expect(canonicalJson(required(google.tab(id, EXPENSE_LOG_TITLE)).rows)).toBe(rowsBefore);
    const after = await readExpenses(google.client, google.token, id, true);
    expect(after.status === "ok" && encodeExpenseBackup(after.commands)).toBe(backupBefore);
  });
  it("refuses a future expense before creating or writing its records", async () => {
    const { google, id } = await setup();
    const before = google.calls.length;
    const result = await saveExpense(
      google.client,
      google.token,
      id,
      command("future", "2026-11-06"),
      false,
      required(parseIsoDate("2026-11-05")),
    );
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
    expect(
      (
        await saveExpense(
          google.client,
          google.token,
          id,
          command("two", undefined, "one", [null, 0, null, null, null]),
          true,
        )
      ).status,
    ).toBe("saved");
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
    expect(
      (await saveExpense(google.client, google.token, id, command("one", undefined, null, [1, 0, 0, 0, 0]), true))
        .status,
    ).toBe("not-saved");
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
    await writeGridTabs(google.client, google.token, id, [
      { title: EXPENSE_LOG_TITLE, grid },
      { title: EXPENSE_VIEW_TITLE, grid },
    ]);
    const record = required(google.tab(id, EXPENSE_LOG_TITLE));
    const view = required(google.tab(id, EXPENSE_VIEW_TITLE));
    record.developerMetadata = [];
    view.developerMetadata = [];
    const before = record.rows.map((row) => [...row]);
    const outcome = await saveExpense(google.client, google.token, id, command("one"));
    expect(outcome.status).toBe("saved");
    expect(record.rows).toEqual(before);
    expect(view.rows).toEqual(before);
    expect(google.tab(id, `${EXPENSE_LOG_TITLE} (2)`)).toBeDefined();
    expect(google.tab(id, `${EXPENSE_VIEW_TITLE} (2)`)).toBeUndefined();
    expect(outcome.status === "saved" && outcome.viewUpdated).toBe(false);
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
    tab.developerMetadata.push({
      metadataKey: "foliodash.view",
      metadataValue: EXPENSE_VIEW_TITLE,
      location: { sheetId: tab.id },
    });
    const before = tab.rows.map((row) => [...row]);
    const written = await writeGridTabs(google.client, google.token, id, [
      { title: EXPENSE_VIEW_TITLE, grid: bufferedGrid([[plainCell("replace")]]) },
    ]);
    expect(written.ok).toBe(false);
    expect(tab.rows).toEqual(before);
  });

  it("keeps no-work totals blank and writes the five canonical recap metrics when an as-of date is supplied", async () => {
    const { google, id } = await setup();
    await saveExpense(
      google.client,
      google.token,
      id,
      command("blank", "2026-11-03", null, [null, null, null, null, null]),
    );
    expect(
      (
        await saveExpense(
          google.client,
          google.token,
          id,
          command("zero", undefined, null, [0, 0, 0, 0, 0]),
          true,
          required(parseIsoDate("2026-11-05")),
        )
      ).status,
    ).toBe("saved");
    const rows = required(google.tab(id, EXPENSE_VIEW_TITLE)).rows;
    expect(rows[4]?.[7]).toBe("");
    expect(rows[4]?.[8]).toBe("No onsite work");
    expect(rows[5]?.[7]).toBe(0);
    for (const label of [
      "Average Daily",
      "Average Weekly",
      "Average Monthly",
      "Total Yearly",
      "Yearly Projection (estimate)",
    ])
      expect(rows.some((row) => row[1] === label)).toBe(true);
    expect(rows.find((row) => row[1] === "Average Daily")?.[2]).toBe(0);
  });
});
