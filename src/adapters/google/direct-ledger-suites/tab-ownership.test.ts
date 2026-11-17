import { describe, expect, it } from "vitest";
import { legacyJanuarySummary, LEGACY_SUMMARY_NOTICE } from "../../../../tests/fixtures/legacy-summary";
import { readableView } from "../../../applications/ledger/readable-view";
import { rawGrid } from "../../../applications/ledger/sheet-grid";
import { EMPTY_LEDGER } from "../../../core/portfolio/ledger";
import { type DirectDeps, commitDirect, readDirect, refreshView } from "../direct-ledger";
import { LEDGER_TAB, VIEW_TAB } from "../sheets-layout";
import { writeGridTabs } from "../google-workbook";
import {
  ISIN,
  first,
  second,
  setup,
  readyWorkbook,
} from "../../../../tests/fixtures/google-adapters/direct-ledger-support";

describe("generated tab ownership", () => {
  const grid = () => rawGrid({ date1904: false, rows: [[{ kind: "text", text: "Synthetic view" }]] });

  it("preserves conflicting unmarked tabs and refuses to create numbered copies", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const old = google.tab(workbook.id, VIEW_TAB);
    if (old === undefined) throw new Error("setup failed");
    old.developerMetadata = [];
    old.rows = [["personal notes"]];
    for (let run = 0; run < 3; run++) {
      expect(
        (await writeGridTabs(google.client, google.token, workbook.id, [{ title: VIEW_TAB, grid: grid() }])).ok,
      ).toBe(false);
    }
    expect(google.workbooks.get(workbook.id)?.size).toBe(2);
    expect(old.rows).toEqual([["personal notes"]]);
  });

  it("adopts an identical legacy view once, without duplicating tabs or touching records", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    await writeGridTabs(google.client, google.token, workbook.id, [{ title: VIEW_TAB, grid: grid() }]);
    const view = google.tab(workbook.id, VIEW_TAB);
    if (view === undefined) throw new Error("setup failed");
    view.developerMetadata = [];
    const records = JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows);
    for (let run = 0; run < 3; run++) {
      expect(
        (await writeGridTabs(google.client, google.token, workbook.id, [{ title: VIEW_TAB, grid: grid() }])).ok,
      ).toBe(true);
    }
    expect(view.developerMetadata).toHaveLength(1);
    expect(google.workbooks.get(workbook.id)?.size).toBe(2);
    expect(JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows)).toBe(records);
  });

  it("upgrades an unmarked summary from the old layout, even when it shows an earlier saved date", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    const january = await readDirect(google.client, google.token, workbook.id);
    if (january.status !== "ok") throw new Error("setup failed");
    await commitDirect(deps, google.token, workbook.id, second(january.state.revision));
    const latest = await readDirect(google.client, google.token, workbook.id);
    const original = google.tab(workbook.id, VIEW_TAB);
    if (latest.status !== "ok" || original === undefined) throw new Error("setup failed");
    original.developerMetadata = [];
    original.rows = legacyJanuarySummary(ISIN);
    const records = JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows);
    const guards = [...(google.namedRanges.get(workbook.id) ?? [])];
    expect(await refreshView(google.client, google.token, workbook.id, latest.state)).toBe(true);
    expect(google.tab(workbook.id, VIEW_TAB)?.id).toBe(original.id);
    expect(original.rows.flat()).toContain("Statement date");
    expect(original.rows.flat()).toContain(1100);
    expect(original.rows.flat()).not.toContain(LEGACY_SUMMARY_NOTICE);
    expect(original.developerMetadata).toHaveLength(1);
    expect(google.workbooks.get(workbook.id)?.size).toBe(2);
    expect(JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows)).toBe(records);
    expect([...(google.namedRanges.get(workbook.id) ?? [])]).toEqual(guards);
  });

  it("also recognises an unmarked current-layout summary from an earlier saved date", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    const january = await readDirect(google.client, google.token, workbook.id);
    if (january.status !== "ok") throw new Error("setup failed");
    const original = google.tab(workbook.id, VIEW_TAB);
    if (original === undefined) throw new Error("setup failed");
    original.developerMetadata = [];
    original.rows = readableView(january.state).cells.map((row) => row.map((cell) => cell.value));
    await commitDirect(deps, google.token, workbook.id, second(january.state.revision));
    const latest = await readDirect(google.client, google.token, workbook.id);
    if (latest.status !== "ok") throw new Error("setup failed");
    expect(await refreshView(google.client, google.token, workbook.id, latest.state)).toBe(true);
    expect(original.rows.flat()).toContain(1100);
    expect(google.workbooks.get(workbook.id)?.size).toBe(2);
  });

  it("upgrades a recognised old empty summary without requiring a rename", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const original = google.tab(workbook.id, VIEW_TAB);
    if (original === undefined) throw new Error("setup failed");
    original.developerMetadata = [];
    original.rows = [[], ["", VIEW_TAB], ["", LEGACY_SUMMARY_NOTICE], [], ["", "No statements recorded yet."]];
    expect(await refreshView(google.client, google.token, workbook.id, EMPTY_LEDGER)).toBe(true);
    expect(original.developerMetadata).toHaveLength(1);
    expect(google.workbooks.get(workbook.id)?.size).toBe(2);
  });

  it.each(["changed value", "extra note", "formula"])("preserves an old-looking summary with %s", async (change) => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    const latest = await readDirect(google.client, google.token, workbook.id);
    const original = google.tab(workbook.id, VIEW_TAB);
    if (latest.status !== "ok" || original === undefined) throw new Error("setup failed");
    const rows = legacyJanuarySummary(ISIN);
    if (change === "extra note") rows.push(["personal note"]);
    else {
      const fund = rows.at(-1);
      if (fund === undefined) throw new Error("setup failed");
      fund[4] = change === "formula" ? "=1000" : 999;
    }
    original.developerMetadata = [];
    original.rows = rows;
    const before = JSON.stringify(rows);
    const batches = google.batches.length;
    expect(await refreshView(google.client, google.token, workbook.id, latest.state)).toBe(false);
    expect(JSON.stringify(original.rows)).toBe(before);
    expect(google.batches.length).toBe(batches);
  });

  it("recognizes sheet zero when Google omits default-valued scalar IDs", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const rest: DirectDeps["rest"] = async (request) => {
      const answer = await google.client(request);
      if (request.method !== "GET" || request.url.includes("/values")) return answer;
      const body = (await answer.json()) as {
        sheets?: {
          properties: Record<string, unknown>;
          developerMetadata?: (Record<string, unknown> & { location: Record<string, unknown> })[];
        }[];
      };
      for (const sheet of body.sheets ?? []) {
        if (sheet.properties["sheetId"] === 0) delete sheet.properties["sheetId"];
        for (const marker of sheet.developerMetadata ?? []) {
          if (marker.location["sheetId"] === 0) {
            delete marker.location["sheetId"];
            marker.location["locationType"] = "SHEET";
          }
        }
      }
      return { ...answer, json: () => Promise.resolve(body) };
    };
    expect(await refreshView(rest, google.token, workbook.id, EMPTY_LEDGER)).toBe(true);
    expect(google.tab(workbook.id, VIEW_TAB)?.rows[1]?.[1]).toBe(VIEW_TAB);
    expect(google.workbooks.get(workbook.id)?.size).toBe(2);
  });

  it("orders and colours views consistently even when older months are written later", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    await writeGridTabs(google.client, google.token, workbook.id, [
      { title: "Bank 2026-03-31", grid: grid() },
      { title: "Work expenses", grid: grid() },
    ]);
    await writeGridTabs(google.client, google.token, workbook.id, [{ title: "Bank 2026-01-31", grid: grid() }]);
    expect([...(google.workbooks.get(workbook.id)?.keys() ?? [])]).toEqual([
      VIEW_TAB,
      "Work expenses",
      "Bank 2026-03-31",
      "Bank 2026-01-31",
      LEDGER_TAB,
    ]);
    expect(google.tab(workbook.id, "Bank 2026-03-31")?.tabColorStyle).toEqual(
      google.tab(workbook.id, "Bank 2026-01-31")?.tabColorStyle,
    );
    expect(google.tab(workbook.id, "Work expenses")?.tabColorStyle).not.toEqual(
      google.tab(workbook.id, VIEW_TAB)?.tabColorStyle,
    );
    expect(google.tab(workbook.id, "Bank 2026-01-31")?.hideGridlines).toBe(true);
    expect(google.tab(workbook.id, LEDGER_TAB)?.frozenRowCount).toBe(1);
  });

  it("recognises a generated tab after the person renames it", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const tabs = google.workbooks.get(workbook.id);
    const view = tabs?.get(VIEW_TAB);
    if (tabs === undefined || view === undefined) throw new Error("setup failed");
    tabs.delete(VIEW_TAB);
    tabs.set("My overview", view);
    expect(
      (await writeGridTabs(google.client, google.token, workbook.id, [{ title: VIEW_TAB, grid: grid() }])).ok,
    ).toBe(true);
    expect(tabs.has(VIEW_TAB)).toBe(false);
    expect(view.rows[1]?.[1]).toBe("Synthetic view");
  });

  it("refuses ambiguous ownership without applying any part of the requested batch", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    await writeGridTabs(google.client, google.token, workbook.id, [{ title: "Another view", grid: grid() }]);
    const other = google.tab(workbook.id, "Another view");
    const view = google.tab(workbook.id, VIEW_TAB);
    if (other === undefined || view === undefined) throw new Error("setup failed");
    other.developerMetadata = view.developerMetadata.map((metadata) => ({
      ...metadata,
      location: { sheetId: other.id },
    }));
    const calls = google.callsMatching(/:batchUpdate$/u).length;
    expect(
      (
        await writeGridTabs(google.client, google.token, workbook.id, [
          { title: "New view", grid: grid() },
          { title: VIEW_TAB, grid: grid() },
        ])
      ).ok,
    ).toBe(false);
    expect(google.callsMatching(/:batchUpdate$/u)).toHaveLength(calls);
    expect(google.tab(workbook.id, "New view")).toBeUndefined();
  });

  it("never lets a generated view erase the ledger or repeat a role", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const before = JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows);
    expect(
      (await writeGridTabs(google.client, google.token, workbook.id, [{ title: LEDGER_TAB, grid: grid() }])).ok,
    ).toBe(false);
    expect(
      (
        await writeGridTabs(google.client, google.token, workbook.id, [
          { title: VIEW_TAB, grid: grid() },
          { title: VIEW_TAB, grid: grid() },
        ])
      ).ok,
    ).toBe(false);
    expect(JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows)).toBe(before);
  });

  it("consolidates a source-backed original and numbered generated views atomically, then stays stable", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const title = "Bank 2026-05-03";
    const view = { title, grid: grid(), legacyGrids: [grid()] };
    await writeGridTabs(google.client, google.token, workbook.id, [view]);
    const original = google.tab(workbook.id, title);
    const tabs = google.workbooks.get(workbook.id);
    if (original === undefined || tabs === undefined) throw new Error("setup failed");
    const duplicate = {
      ...original,
      id: 2000,
      rows: original.rows.map((row) => [...row]),
      developerMetadata: original.developerMetadata.map((marker) => ({ ...marker, location: { sheetId: 2000 } })),
    };
    original.developerMetadata = [];
    tabs.set(`${title} (2)`, duplicate);
    google.faults.push({ match: /:batchUpdate$/u, status: 400 });
    expect((await writeGridTabs(google.client, google.token, workbook.id, [view])).ok).toBe(false);
    expect(tabs.has(`${title} (2)`)).toBe(true);
    google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
    expect((await writeGridTabs(google.client, google.token, workbook.id, [view])).ok).toBe(false);
    expect(tabs.has(`${title} (2)`)).toBe(false);
    expect(google.tab(workbook.id, title)?.id).toBe(original.id);
    expect((await writeGridTabs(google.client, google.token, workbook.id, [view])).ok).toBe(true);
    expect([...tabs.keys()].filter((name) => name.startsWith(title))).toEqual([title]);
    expect(google.tab(workbook.id, title)?.developerMetadata).toHaveLength(1);
  });

  it("renames a lone numbered owned Bank view and preserves an unverified numbered tab", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const title = "Bank 2026-04-02";
    const view = { title, grid: grid(), legacyGrids: [grid()] };
    await writeGridTabs(google.client, google.token, workbook.id, [view]);
    const tab = google.tab(workbook.id, title);
    const tabs = google.workbooks.get(workbook.id);
    if (tab === undefined || tabs === undefined) throw new Error("setup failed");
    tabs.delete(title);
    tabs.set(`${title} (2)`, tab);
    tabs.set(`${title} (3)`, { ...tab, id: 3000, developerMetadata: [], rows: [["personal note"]] });
    const written = await writeGridTabs(google.client, google.token, workbook.id, [view]);
    expect(written).toMatchObject({ ok: true, preservedTabs: 1 });
    expect(tabs.has(`${title} (2)`)).toBe(false);
    expect(google.tab(workbook.id, title)?.id).toBe(tab.id);
    expect(google.tab(workbook.id, `${title} (3)`)?.rows).toEqual([["personal note"]]);
  });

  it("never consolidates a formula or changed value merely because the tab looks like a duplicate", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const title = "Bank 2026-04-02";
    const view = { title, grid: grid(), legacyGrids: [grid()] };
    await writeGridTabs(google.client, google.token, workbook.id, [view]);
    const tab = google.tab(workbook.id, title);
    const tabs = google.workbooks.get(workbook.id);
    if (tab === undefined || tabs === undefined) throw new Error("setup failed");
    tabs.set(`${title} (2)`, { ...tab, id: 4000, developerMetadata: [], rows: [["=1+1"]] });
    expect(await writeGridTabs(google.client, google.token, workbook.id, [view])).toMatchObject({
      ok: true,
      consolidatedTabs: 0,
      preservedTabs: 1,
    });
    expect(google.tab(workbook.id, `${title} (2)`)?.rows).toEqual([["=1+1"]]);
  });

  it("resolves a lost view-write response by finding the marker, without making duplicate tabs", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
    expect(
      (await writeGridTabs(google.client, google.token, workbook.id, [{ title: "Generated", grid: grid() }])).ok,
    ).toBe(false);
    expect(
      (await writeGridTabs(google.client, google.token, workbook.id, [{ title: "Generated", grid: grid() }])).ok,
    ).toBe(true);
    expect(google.workbooks.get(workbook.id)?.size).toBe(3);
  });

  it("rolls back a new tab when its ownership marker cannot be created", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const rest: DirectDeps["rest"] = (request) => {
      if (request.body !== undefined && request.url.endsWith(":batchUpdate")) {
        const body = JSON.parse(request.body) as { requests: Record<string, unknown>[] };
        for (const item of body.requests) {
          if (item["createDeveloperMetadata"] !== undefined)
            item["createDeveloperMetadata"] = { developerMetadata: { location: { sheetId: -1 } } };
        }
        return google.client({ ...request, body: JSON.stringify(body) });
      }
      return google.client(request);
    };
    expect((await writeGridTabs(rest, google.token, workbook.id, [{ title: "Generated", grid: grid() }])).ok).toBe(
      false,
    );
    expect(google.tab(workbook.id, "Generated")).toBeUndefined();
    expect(google.workbooks.get(workbook.id)?.size).toBe(2);
  });
});
