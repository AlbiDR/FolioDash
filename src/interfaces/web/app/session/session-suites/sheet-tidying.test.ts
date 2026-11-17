import { describe, expect, it } from "vitest";
import { OPENING, februarySheet, januarySheet } from "../../../../../../tests/fixtures/saved-months";
import { syntheticSheet } from "../../../../../../tests/fixtures/synthetic-fideuram-sheet";
import { planImport } from "../../../../../core/statements/import-plan";
import { LEDGER_TAB, VIEW_TAB } from "../../../../../adapters/google/sheets-layout";
import type { FundCommand } from "../../../../../core/statements/import-plan";
import { parseExpenseAmounts } from "../../../../../core/expenses/work-expenses";
import { saveExpense, EXPENSE_LOG_TITLE, EXPENSE_VIEW_TITLE } from "../../../../../adapters/google/direct-expenses";
import { ZERO_CENTS } from "../../../../../core/values/money";
import { interpretStatement } from "../interpret-statement";
import { date, january, world, saved } from "../../../../../../tests/fixtures/session/session-test-support";

describe("tidying the sheet", () => {
  it("rewrites every month's tab lean and typed, from the kept statements, leaving the records alone", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    const sheet = syntheticSheet();
    const read = interpretStatement(sheet);
    if (!read.ok) throw new Error("setup failed");
    await saved(session, {
      date: date("2026-01-31"),
      statement: read.statement,
      commands: OPENING,
      source: { sheetName: "S", sheet },
    });
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    // A person (or an older build) left the tab bare and oversized.
    const tab = google.tab(id, "Bank 2026-01-31");
    if (tab !== undefined) {
      tab.rowCount = 1000;
      tab.columnCount = 26;
      tab.formats = [];
    }
    const ledgerBefore = JSON.stringify(google.tab(id, "_FolioDash ledger")?.rows);
    const outcome = await session.tidySheet();
    expect(outcome).toEqual({ status: "tidied", months: 1, withoutStatement: 0 });
    expect(tab?.columnCount).toBeLessThan(26);
    expect(tab?.rowCount).toBe(tab?.rows.length);
    const patterns = (tab?.formats ?? [])
      .flat()
      .map((format) => (format?.["numberFormat"] as { pattern?: string } | undefined)?.pattern);
    expect(patterns).toContain("dd/mm/yyyy");
    expect(JSON.stringify(google.tab(id, "_FolioDash ledger")?.rows)).toBe(ledgerBefore);
  });

  it("organizes both record stores together, preserves their values and makes repeated runs stable", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    const amounts = parseExpenseAmounts([100, 500, 100, null, null]);
    if (amounts === null) throw new Error("setup failed");
    expect(
      (
        await saveExpense(google.client, google.token, id, {
          id: "expense",
          date: date("2023-11-13"),
          expectedRevision: null,
          amounts,
        })
      ).status,
    ).toBe("saved");
    const before = [LEDGER_TAB, EXPENSE_LOG_TITLE].map((title) => JSON.stringify(google.tab(id, title)?.rows));
    const count = google.workbooks.get(id)?.size;
    const batches = google.batches.length;
    for (let run = 0; run < 3; run++) expect((await session.tidySheet()).status).toBe("tidied");
    expect(google.batches.length - batches).toBe(3);
    expect(google.workbooks.get(id)?.size).toBe(count);
    expect([LEDGER_TAB, EXPENSE_LOG_TITLE].map((title) => JSON.stringify(google.tab(id, title)?.rows))).toEqual(before);
    expect(google.tab(id, EXPENSE_VIEW_TITLE)?.rows.flat()).toContain("Work expenses");
    expect(google.tab(id, EXPENSE_LOG_TITLE)?.hidden).toBe(true);
    expect([...(google.workbooks.get(id)?.keys() ?? [])]).toEqual([
      VIEW_TAB,
      EXPENSE_VIEW_TITLE,
      LEDGER_TAB,
      EXPENSE_LOG_TITLE,
    ]);
    const views = [VIEW_TAB, EXPENSE_VIEW_TITLE].map((title) => JSON.stringify(google.tab(id, title)?.rows));
    google.faults.push({ match: /:batchUpdate$/u, status: 400 });
    expect((await session.tidySheet()).status).toBe("failed");
    expect([VIEW_TAB, EXPENSE_VIEW_TITLE].map((title) => JSON.stringify(google.tab(id, title)?.rows))).toEqual(views);
  });

  it("checks expense integrity before submitting any organization batch", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    const amounts = parseExpenseAmounts([100, 500, 100, null, null]);
    if (amounts === null) throw new Error("setup failed");
    await saveExpense(google.client, google.token, id, {
      id: "expense",
      date: date("2023-11-13"),
      expectedRevision: null,
      amounts,
    });
    const records = google.tab(id, EXPENSE_LOG_TITLE);
    if (records?.rows[1] === undefined) throw new Error("setup failed");
    records.rows[1][2] = "damaged";
    const batches = google.batches.length;
    expect((await session.tidySheet()).status).toBe("needs-attention");
    expect(google.batches.length).toBe(batches);
  });

  it("reports an unconfirmed organization when Google refuses", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    const sheet = syntheticSheet();
    const read = interpretStatement(sheet);
    if (!read.ok) throw new Error("setup failed");
    await saved(session, {
      date: date("2026-01-31"),
      statement: read.statement,
      commands: OPENING,
      source: { sheetName: "S", sheet },
    });
    await session.idle();
    google.faults.push({ match: /:batchUpdate$/u, status: 503 });
    expect((await session.tidySheet()).status).toBe("failed");
  });
});

describe("the readable tabs and summary are written once after a run of saves", () => {
  it("two saves in a row write both monthly tabs and the summary together, in one batch, not once per save", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    const first = interpretStatement(januarySheet());
    const second = interpretStatement(februarySheet());
    if (!first.ok || !second.ok) throw new Error("setup failed");
    await saved(session, {
      date: date("2026-01-31"),
      statement: first.statement,
      commands: OPENING,
      source: { sheetName: "S", sheet: januarySheet() },
    });
    const keeps = planImport(session.state.ledger, second.statement).map((row): FundCommand => ({
      isin: row.isin,
      action: "Keep",
      moneyIn: ZERO_CENTS,
      moneyOut: ZERO_CENTS,
      comment: "",
    }));
    await saved(session, {
      date: date("2026-02-28"),
      statement: second.statement,
      commands: keeps,
      source: { sheetName: "S", sheet: februarySheet() },
    });
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    // Both months and the summary share one batch after the run of saves.
    expect(
      google.batches.filter((batch) => batch.some((request) => request["updateCells"] !== undefined)),
    ).toHaveLength(1);
    expect(google.tab(id, "Bank 2026-01-31")?.rows.length).toBeGreaterThan(5);
    expect(google.tab(id, "Bank 2026-02-28")?.rows.length).toBeGreaterThan(5);
  });

  it("keeps what could not be written, and writes it at the next chance", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    // Google refuses the single atomic view batch.
    google.faults.push({ match: /:batchUpdate$/u, status: 429, append: false });
    const sheet = syntheticSheet();
    const read = interpretStatement(sheet);
    if (!read.ok) throw new Error("setup failed");
    await saved(session, {
      date: date("2026-01-31"),
      statement: read.statement,
      commands: OPENING,
      source: { sheetName: "S", sheet },
    });
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    expect(google.tab(id, "Bank 2026-01-31")?.rows ?? []).toHaveLength(0);
    await session.idle();
    expect(google.tab(id, "Bank 2026-01-31")?.rows.length).toBeGreaterThan(5);
  });
});
