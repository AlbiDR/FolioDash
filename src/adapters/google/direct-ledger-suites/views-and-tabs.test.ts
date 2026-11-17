import { describe, expect, it } from "vitest";
import type { CommitRequest } from "../../../applications/ledger/ledger-service";
import { rawGrid } from "../../../applications/ledger/sheet-grid";
import type { RawSheet } from "../../../core/statements/raw-sheet";
import {
  commitDirect,
  ensureWorkbook,
  mirrorStatements,
  readAllDirect,
  readDirect,
  refreshView,
  statementTabTitle,
  tidyLedgerTab,
} from "../direct-ledger";
import { LEDGER_TAB, VIEW_TAB } from "../sheets-layout";
import { date, first, setup, readyWorkbook } from "../../../../tests/fixtures/google-adapters/direct-ledger-support";

describe("saving the bank statement with the month", () => {
  const sheet: RawSheet = {
    date1904: false,
    rows: [
      [undefined, { kind: "text", text: "Categoria / Nome prodotto" }],
      [
        { kind: "number", text: "652.289", format: null },
        { kind: "text", text: "Synthetic Fund A" },
      ],
    ],
  };
  const withSource = (): CommitRequest => ({ ...first(), source: { sheetName: "Il Mio Patrimonio", sheet } });

  it("saves the exact statement in the same single request as the ledger, and reads it back with the ledger", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    expect((await commitDirect(deps, google.token, workbook.id, withSource())).status).toBe("committed");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(1);
    const all = await readAllDirect(google.client, google.token, workbook.id);
    expect(all.status).toBe("ok");
    if (all.status !== "ok") return;
    expect(all.state.snapshots).toHaveLength(1);
    expect(all.sources).toHaveLength(1);
    expect(all.sources[0]).toMatchObject({ date: "2026-01-31", sheetName: "Il Mio Patrimonio" });
    expect(all.sources[0]?.sheet.rows[1]?.[0]).toEqual({ kind: "number", text: "652.289", format: null });
  });

  it("reports a damaged stored statement, and never returns the ledger without saying so", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, withSource());
    const piece = (google.tab(workbook.id, LEDGER_TAB)?.rows ?? []).find((row) => row[1] === "SOURCE");
    if (piece !== undefined) piece[2] = String(piece[2]).replace("Synthetic Fund A", "Synthetic Fund Z");
    expect((await readAllDirect(google.client, google.token, workbook.id)).status).toBe("damaged");
  });

  it("writes a readable tab for the month, and rewrites it in place instead of adding another", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, withSource());
    expect(
      await mirrorStatements(google.client, google.token, workbook.id, [{ date: date("2026-01-31"), sheet }], rawGrid),
    ).toBe(true);
    const title = statementTabTitle(date("2026-01-31"));
    expect(title).toBe("Bank 2026-01-31");
    // The data keeps its place, with one empty row and column around it.
    expect(google.tab(workbook.id, title)?.rows).toEqual([
      ["", "", "", ""],
      ["", "", "Categoria / Nome prodotto", ""],
      ["", 652.289, "Synthetic Fund A", ""],
      ["", "", "", ""],
    ]);
    expect(
      await mirrorStatements(google.client, google.token, workbook.id, [{ date: date("2026-01-31"), sheet }], rawGrid),
    ).toBe(true);
    expect([...(google.workbooks.get(workbook.id)?.keys() ?? [])].filter((name) => name === title)).toHaveLength(1);
  });

  it("lets a failed readable tab pass without touching the saved records", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, withSource());
    const before = JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows);
    google.faults.push({ match: /:batchUpdate$/u, status: 503 });
    expect(
      await mirrorStatements(google.client, google.token, workbook.id, [{ date: date("2026-01-31"), sheet }], rawGrid),
    ).toBe(false);
    expect(JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows)).toBe(before);
    expect((await readAllDirect(google.client, google.token, workbook.id)).status).toBe("ok");
  });
});

describe("the ledger tab stays hidden", () => {
  it("is hidden when created, and hidden afterwards when Google ignored the request", async () => {
    const hidden = setup();
    const a = await readyWorkbook(hidden.google);
    expect(hidden.google.tab(a.id, LEDGER_TAB)?.hidden).toBe(true);

    const ignored = setup();
    ignored.google.ignoreHiddenOnCreate = true;
    const created = await ensureWorkbook(ignored.google.client, ignored.google.token);
    if (created.status !== "ready") throw new Error("setup failed");
    // createWorkbook already tries again after creation, which is what makes it hidden here.
    expect(ignored.google.tab(created.workbook.id, LEDGER_TAB)?.hidden).toBe(true);
  });

  it("hides a tab that a person or an older build left showing, and says so", async () => {
    const { google } = setup();
    google.ignoreHiddenOnCreate = true;
    const created = await ensureWorkbook(google.client, google.token);
    if (created.status !== "ready") throw new Error("setup failed");
    const tab = google.tab(created.workbook.id, LEDGER_TAB);
    if (tab !== undefined) tab.hidden = false;
    expect(await tidyLedgerTab(google.client, google.token, created.workbook.id)).toBe(true);
    expect(google.tab(created.workbook.id, LEDGER_TAB)?.hidden).toBe(true);
    expect(await tidyLedgerTab(google.client, google.token, "no-such-workbook")).toBe(false);
  });
});

describe("the readable monthly tabs, in a few requests", () => {
  const sheetFor = (label: string): RawSheet => ({ date1904: false, rows: [[{ kind: "text", text: label }]] });

  it("writes seventeen months with the same handful of requests as one, never one request per month", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const months = Array.from({ length: 17 }, (_, index) => ({
      date: date(`2026-${String((index % 12) + 1).padStart(2, "0")}-${index < 12 ? "15" : "16"}`),
      sheet: sheetFor(`Month ${String(index)}`),
    }));
    const before = google.calls.length;
    expect(await mirrorStatements(google.client, google.token, workbook.id, months, rawGrid)).toBe(true);
    // List the tabs, then one batch that adds, fits, formats and fills them all.
    expect(google.calls.length - before).toBe(2);
    expect(
      [...(google.workbooks.get(workbook.id)?.keys() ?? [])].filter((name) => name.startsWith("Bank ")),
    ).toHaveLength(17);
    expect(google.tab(workbook.id, "Bank 2026-03-15")?.rows).toEqual([
      ["", "", ""],
      ["", "Month 2", ""],
      ["", "", ""],
    ]);
  });

  it("rewrites tabs that exist and adds only the missing ones", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    await mirrorStatements(
      google.client,
      google.token,
      workbook.id,
      [{ date: date("2026-01-31"), sheet: sheetFor("old") }],
      rawGrid,
    );
    await mirrorStatements(
      google.client,
      google.token,
      workbook.id,
      [
        { date: date("2026-01-31"), sheet: sheetFor("new") },
        { date: date("2026-02-28"), sheet: sheetFor("second") },
      ],
      rawGrid,
    );
    expect(google.tab(workbook.id, "Bank 2026-01-31")?.rows).toEqual([
      ["", "", ""],
      ["", "new", ""],
      ["", "", ""],
    ]);
    expect(google.tab(workbook.id, "Bank 2026-02-28")?.rows).toEqual([
      ["", "", ""],
      ["", "second", ""],
      ["", "", ""],
    ]);
    expect(
      [...(google.workbooks.get(workbook.id)?.keys() ?? [])].filter((name) => name === "Bank 2026-01-31"),
    ).toHaveLength(1);
  });

  it("does nothing, and asks Google for nothing, when there are no months", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const before = google.calls.length;
    expect(await mirrorStatements(google.client, google.token, workbook.id, [], rawGrid)).toBe(true);
    expect(google.calls.length).toBe(before);
  });
});

describe("lean tabs", () => {
  const sheet = (): RawSheet => ({
    date1904: false,
    rows: [[], [undefined, { kind: "text", text: "Header" }, { kind: "number", text: "5", format: null }], [], []],
  });

  it("cuts a tab down to its data plus one empty row and column, deleting what was there", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    await mirrorStatements(
      google.client,
      google.token,
      workbook.id,
      [{ date: date("2026-01-31"), sheet: sheet() }],
      rawGrid,
    );
    const tab = google.tab(workbook.id, "Bank 2026-01-31");
    expect([tab?.rowCount, tab?.columnCount]).toEqual([3, 4]);
    // Rewriting with a bigger tab in place first (as a person might) still ends lean.
    if (tab !== undefined) {
      tab.rowCount = 1000;
      tab.columnCount = 26;
      tab.rows[500] = ["stray"];
    }
    await mirrorStatements(
      google.client,
      google.token,
      workbook.id,
      [{ date: date("2026-01-31"), sheet: sheet() }],
      rawGrid,
    );
    expect([tab?.rowCount, tab?.columnCount]).toEqual([3, 4]);
    expect(tab?.rows).toHaveLength(3);
  });

  it("applies the whole write or none of it, so a refused batch leaves the old tab alone", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    await mirrorStatements(
      google.client,
      google.token,
      workbook.id,
      [{ date: date("2026-01-31"), sheet: sheet() }],
      rawGrid,
    );
    const before = JSON.stringify(google.tab(workbook.id, "Bank 2026-01-31")?.rows);
    google.faults.push({ match: /:batchUpdate$/u, status: 400 });
    expect(
      await mirrorStatements(
        google.client,
        google.token,
        workbook.id,
        [{ date: date("2026-01-31"), sheet: { date1904: false, rows: [[{ kind: "text", text: "Other" }]] } }],
        rawGrid,
      ),
    ).toBe(false);
    expect(JSON.stringify(google.tab(workbook.id, "Bank 2026-01-31")?.rows)).toBe(before);
  });

  it("writes the summary tab with a margin, and money, percent and date shown as such", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    const read = await readDirect(google.client, google.token, workbook.id);
    if (read.status !== "ok") throw new Error("setup failed");
    expect(await refreshView(google.client, google.token, workbook.id, read.state)).toBe(true);
    const view = google.tab(workbook.id, VIEW_TAB);
    expect(view?.rows[0]?.every((cell) => cell === "")).toBe(true);
    expect(view?.rows[1]?.[0]).toBe("");
    expect(view?.rows[1]?.[1]).toBe("FolioDash");
    const patterns = (view?.formats ?? [])
      .flat()
      .map((format) => (format?.["numberFormat"] as { pattern?: string } | undefined)?.pattern);
    expect(patterns).toContain('#,##0.00" €"');
    expect(patterns).toContain("dd/mm/yyyy");
  });

  it("trims the ledger tab's unused columns but never deletes its rows", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    const ledger = google.tab(workbook.id, LEDGER_TAB);
    if (ledger !== undefined) ledger.columnCount = 26;
    const rowsBefore = ledger?.rows.length;
    expect(await tidyLedgerTab(google.client, google.token, workbook.id)).toBe(true);
    expect(ledger?.columnCount).toBe(4);
    expect(ledger?.rows).toHaveLength(rowsBefore ?? -1);
  });
});
