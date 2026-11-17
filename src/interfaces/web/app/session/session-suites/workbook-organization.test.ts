import { describe, expect, it } from "vitest";
import { legacyJanuarySummary } from "../../../../../../tests/fixtures/legacy-summary";
import { rawGrid } from "../../../../../applications/ledger/sheet-grid";
import { OPENING } from "../../../../../../tests/fixtures/saved-months";
import { syntheticSheet } from "../../../../../../tests/fixtures/synthetic-fideuram-sheet";
import {
  LEDGER_TAB,
  VIEW_TAB,
  ORGANIZATION_METADATA_KEY,
  ORGANIZATION_VERSION,
} from "../../../../../adapters/google/sheets-layout";
import { parseExpenseAmounts } from "../../../../../core/expenses/work-expenses";
import { EXPENSE_LOG_TITLE, EXPENSE_VIEW_TITLE } from "../../../../../adapters/google/direct-expenses";
import { interpretStatement } from "../interpret-statement";
import {
  date,
  ISIN,
  january,
  february,
  world,
  saved,
} from "../../../../../../tests/fixtures/session/session-test-support";

describe("automatic spreadsheet organization", () => {
  it("upgrades on connection once, persists the version, and avoids repeated rebuilds", async () => {
    const { google, make, log } = world();
    const session = make();
    await session.connect();
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    expect(google.spreadsheetMetadata.get(id)).toContainEqual(
      expect.objectContaining({ metadataKey: ORGANIZATION_METADATA_KEY, metadataValue: ORGANIZATION_VERSION }),
    );
    expect(session.state.organization?.status).toBe("current");
    const batches = google.batches.length;
    await session.refresh();
    await session.idle();
    expect(google.batches.length).toBe(batches);
    const returning = make();
    await returning.connect();
    await returning.idle();
    expect(
      google.batches.filter((batch) => batch.some((request) => request["updateCells"] !== undefined)),
    ).toHaveLength(1);
    const signIns = log.signIns;
    log.clock += 31_000;
    await returning.refreshIfNeeded();
    await returning.idle();
    expect(log.signIns).toBe(signIns);
  });

  it("automatically upgrades an old FolioDash summary and consolidates its marked numbered copy", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    await saved(session, february);
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    const original = google.tab(id, VIEW_TAB);
    const tabs = google.workbooks.get(id);
    if (original === undefined || tabs === undefined) throw new Error("setup failed");
    tabs.set(`${VIEW_TAB} (2)`, {
      ...original,
      id: 2000,
      developerMetadata: original.developerMetadata.map((marker) => ({ ...marker, location: { sheetId: 2000 } })),
    });
    original.developerMetadata = [];
    original.rows = legacyJanuarySummary(ISIN);
    google.spreadsheetMetadata.set(id, [
      { metadataKey: ORGANIZATION_METADATA_KEY, metadataValue: "3", location: { spreadsheet: true } },
    ]);
    const records = JSON.stringify(google.tab(id, LEDGER_TAB)?.rows);
    const returning = make();
    await returning.connect();
    await returning.idle();
    expect(returning.state.organization?.status).toBe("current");
    expect(google.tab(id, VIEW_TAB)?.id).toBe(original.id);
    expect(tabs.has(`${VIEW_TAB} (2)`)).toBe(false);
    expect(google.tab(id, VIEW_TAB)?.rows.flat()).toContain("Statement date");
    expect(google.tab(id, VIEW_TAB)?.rows.flat()).toContain(1100);
    expect(JSON.stringify(google.tab(id, LEDGER_TAB)?.rows)).toBe(records);
    const batches = google.batches.length;
    await returning.tidySheet();
    expect(google.batches.length).toBe(batches + 1);
    expect(tabs.size).toBe(2);
  });

  it("automatically consolidates existing Bank copies from retained sources during a layout upgrade", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    const sheet = syntheticSheet();
    const interpreted = interpretStatement(sheet);
    if (!interpreted.ok) throw new Error("setup failed");
    await saved(session, {
      date: date("2026-01-31"),
      statement: interpreted.statement,
      commands: OPENING,
      source: { sheetName: "S", sheet },
    });
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    const title = "Bank 2026-01-31";
    const original = google.tab(id, title);
    const tabs = google.workbooks.get(id);
    if (original === undefined || tabs === undefined) throw new Error("setup failed");
    tabs.set(`${title} (2)`, {
      ...original,
      id: 2000,
      developerMetadata: original.developerMetadata.map((marker) => ({ ...marker, location: { sheetId: 2000 } })),
    });
    original.developerMetadata = [];
    // The legacy original still contains the bank's raw strings and padding.
    original.rows = rawGrid(sheet).cells.map((row) => row.map((cell) => cell.value));
    const records = JSON.stringify(google.tab(id, LEDGER_TAB)?.rows);
    const guards = [...(google.namedRanges.get(id) ?? [])];
    google.spreadsheetMetadata.set(id, []);
    const returning = make();
    await returning.connect();
    await returning.idle();
    expect(tabs.has(`${title} (2)`)).toBe(false);
    expect(google.tab(id, title)?.id).toBe(original.id);
    expect(JSON.stringify(google.tab(id, LEDGER_TAB)?.rows)).toBe(records);
    expect([...(google.namedRanges.get(id) ?? [])]).toEqual(guards);
    expect(returning.state.organization?.status).toBe("current");
  });

  it("keeps a failed expense projection pending and refreshes it on the next connection", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    await session.idle();
    await session.expenses.refresh();
    const amounts = parseExpenseAmounts([100, 500, 100, null, null]);
    if (amounts === null) throw new Error("setup failed");
    expect((await session.expenses.save({ date: date("2023-11-13"), amounts, expectedRevision: null })).status).toBe(
      "saved",
    );
    google.faults.push({ match: /:batchUpdate$/u, status: 429 });
    const outcome = await session.expenses.save({ date: date("2023-11-14"), amounts, expectedRevision: null });
    expect(outcome).toMatchObject({ status: "saved", viewUpdated: false });
    expect(session.state.organization?.status).toBe("pending");
    const id = session.state.workbook?.id ?? "";
    const records = JSON.stringify(google.tab(id, EXPENSE_LOG_TITLE)?.rows);
    await session.refresh();
    await session.idle();
    expect(session.state.organization?.status).toBe("current");
    expect(JSON.stringify(google.tab(id, EXPENSE_LOG_TITLE)?.rows)).toBe(records);
    expect(google.tab(id, EXPENSE_VIEW_TITLE)?.rows.flat()).toContain(700 / 100);
  });

  it("refreshes again when an expense save finishes during a full organization", async () => {
    const { google, make } = world();
    let hold = false;
    let release: (() => void) | undefined;
    const session = make({
      rest: async (request) => {
        if (hold && request.method === "POST" && request.body?.includes(ORGANIZATION_METADATA_KEY)) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return google.client(request);
      },
    });
    await session.connect();
    await session.idle();
    await session.expenses.refresh();
    const first = parseExpenseAmounts([100, 500, 100, null, null]);
    const second = parseExpenseAmounts([0, 1313, 0, null, null]);
    if (first === null || second === null) throw new Error("setup failed");
    await session.expenses.save({ date: date("2023-11-13"), amounts: first, expectedRevision: null });
    hold = true;
    const organizing = session.tidySheet();
    for (let step = 0; step < 100 && release === undefined; step++) await Promise.resolve();
    const finish = release;
    if (finish === undefined) throw new Error("Organization did not reach its layout batch");
    expect(
      (await session.expenses.save({ date: date("2023-11-14"), amounts: second, expectedRevision: null })).status,
    ).toBe("saved");
    hold = false;
    finish();
    await organizing;
    expect(session.state.organization?.status).toBe("pending");
    await session.idle();
    expect(session.state.organization?.status).toBe("current");
    expect(google.tab(session.state.workbook?.id ?? "", EXPENSE_VIEW_TITLE)?.rows.flat()).toContain(13.13);
  });

  it("retains failed maintenance for a later connection and never marks a refused upgrade current", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    // The first background structural request may be the ledger's best-effort hide.
    await Promise.resolve();
    google.faults.push({ match: /:batchUpdate$/u, status: 429 });
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    expect(session.state.organization?.status).toBe("needs-attention");
    expect(google.spreadsheetMetadata.get(id) ?? []).toHaveLength(0);
    await session.refresh();
    await session.idle();
    expect(session.state.organization?.status).toBe("current");
    expect(google.spreadsheetMetadata.get(id)).toHaveLength(1);
  });
});
