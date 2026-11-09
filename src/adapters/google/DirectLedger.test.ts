import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../tests/fixtures/FakeGoogle";
import type { CommitRequest } from "../../applications/LedgerService";
import { rawGrid } from "../../applications/SheetGrid";
import type { FundCommand, StatementInput } from "../../core/ImportPlan";
import { type IsoDate, parseIsoDate, toSpreadsheetSerial } from "../../core/IsoDate";
import { parseIsin } from "../../core/Isin";
import { EMPTY_LEDGER } from "../../core/Ledger";
import type { RawSheet } from "../../core/RawSheet";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "../../core/Money";
import { type DirectDeps, attachDirect, commitDirect, ensureWorkbook, mirrorStatements, outcomeDirect, readAllDirect, readDirect, refreshView, restoreDirect, statementTabTitle, tidyLedgerTab } from "./DirectLedger";
import { LEDGER_TAB, VIEW_TAB } from "./SheetsLayout";
import { writeGridTabs } from "./GoogleWorkbook";

const cents = (value: number): EuroCents => toEuroCents(Math.round(value * 100)) ?? ZERO_CENTS;
const date = (text: string): IsoDate => parseIsoDate(text) as IsoDate;
const ISIN = (() => {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XSFUNDA0000${String(digit)}`);
    if (candidate !== null) return candidate;
  }
  throw new Error("no check digit");
})();

function statement(value: number): StatementInput {
  return { funds: [{ isin: ISIN, name: "Synthetic Fund A", marketValue: cents(value) }], fundsSubtotal: cents(value) };
}
const start: FundCommand = { isin: ISIN, action: "Start", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, openingNetInvested: cents(1000), comment: "" };
const keep: FundCommand = { isin: ISIN, action: "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" };

function first(revision = "", commandId = "command-first-0001"): CommitRequest {
  return { commandId, expectedRevision: revision, statement: statement(1000), date: date("2026-01-31"), commands: [start] };
}
function second(revision: string, commandId = "command-second-001"): CommitRequest {
  return { commandId, expectedRevision: revision, statement: statement(1100), date: date("2026-02-28"), commands: [keep] };
}

function setup() {
  const google = new FakeGoogle();
  let counter = 0;
  const deps: DirectDeps = { rest: google.client, newRevision: () => `revision-${String(++counter).padStart(4, "0")}` };
  return { google, deps, token: google.token };
}

async function readyWorkbook(google: FakeGoogle) {
  const ensured = await ensureWorkbook(google.client, google.token);
  if (ensured.status !== "ready") throw new Error("setup failed");
  return ensured.workbook;
}

describe("ensureWorkbook: starting from scratch", () => {
  it("creates and rediscovers an isolated synthetic workbook without selecting or changing the normal workbook", async () => {
    const { google } = setup();
    const normal = await readyWorkbook(google);
    const before = JSON.stringify([...(google.workbooks.get(normal.id) ?? [])]);
    const identity = { title: "FolioDash SYNTHETIC ACCEPTANCE", propertyKey: "foliodash-synthetic-acceptance", propertyValue: "ledger-v1" };
    const synthetic = await ensureWorkbook(google.client, google.token, identity);
    expect(synthetic).toMatchObject({ status: "ready", created: true });
    if (synthetic.status !== "ready") throw new Error("Synthetic setup failed");
    expect(synthetic.workbook.id).not.toBe(normal.id);
    expect(google.files.get(synthetic.workbook.id)?.name).toBe(identity.title);
    expect(google.files.get(synthetic.workbook.id)?.appProperties).toEqual({ [identity.propertyKey]: identity.propertyValue });
    const again = await ensureWorkbook(google.client, google.token, identity);
    expect(again).toMatchObject({ status: "ready", created: false, workbook: synthetic.workbook });
    expect(await ensureWorkbook(google.client, google.token)).toMatchObject({ status: "ready", created: false, workbook: normal });
    expect(JSON.stringify([...(google.workbooks.get(normal.id) ?? [])])).toBe(before);
  });

  it("uses the synthetic name fallback if tagging fails, never the normal workbook name", async () => {
    const { google } = setup();
    const normal = await readyWorkbook(google);
    const identity = { title: "FolioDash SYNTHETIC ACCEPTANCE", propertyKey: "foliodash-synthetic-acceptance", propertyValue: "ledger-v1" };
    google.faults.push({ match: /^PATCH \/drive/u, status: 500 });
    const synthetic = await ensureWorkbook(google.client, google.token, identity);
    expect(synthetic).toMatchObject({ status: "ready", created: true, tagged: false });
    if (synthetic.status !== "ready") throw new Error("Synthetic setup failed");
    const again = await ensureWorkbook(google.client, google.token, identity);
    expect(again).toMatchObject({ status: "ready", created: false, workbook: synthetic.workbook });
    expect(synthetic.workbook.id).not.toBe(normal.id);
  });
  it("creates a tagged spreadsheet with a readable tab and a hidden ledger tab, in one sign-in", async () => {
    const { google } = setup();
    const result = await ensureWorkbook(google.client, google.token);
    expect(result).toMatchObject({ status: "ready", created: true, tagged: true });
    if (result.status !== "ready") return;
    expect(google.tab(result.workbook.id, VIEW_TAB)?.hidden).toBe(false);
    expect(google.tab(result.workbook.id, LEDGER_TAB)?.hidden).toBe(true);
    expect(google.tab(result.workbook.id, LEDGER_TAB)?.rows).toEqual([["revision", "type", "payload", "checksum"]]);
    expect(result.workbook.url).toContain(result.workbook.id);
  });

  it("names the new spreadsheet simply FolioDash", async () => {
    const { google } = setup();
    await readyWorkbook(google);
    expect([...google.files.values()].map((file) => file.name)).toEqual(["FolioDash"]);
  });

  it("finds the same spreadsheet again instead of creating another, on any device", async () => {
    const { google } = setup();
    const created = await readyWorkbook(google);
    const again = await ensureWorkbook(google.client, google.token);
    expect(again).toMatchObject({ status: "ready", created: false });
    if (again.status === "ready") expect(again.workbook.id).toBe(created.id);
    expect(google.files.size).toBe(1);
  });

  it("still finds a spreadsheet whose tag did not complete, by its name", async () => {
    const { google } = setup();
    google.faults.push({ match: /^PATCH \/drive/u, status: 500 });
    const created = await ensureWorkbook(google.client, google.token);
    expect(created).toMatchObject({ status: "ready", created: true, tagged: false });
    const again = await ensureWorkbook(google.client, google.token);
    expect(again).toMatchObject({ status: "ready", created: false });
    expect(google.files.size).toBe(1);
  });

  it("reports a refused sign-in without creating anything", async () => {
    const { google } = setup();
    google.token = "someone-else";
    const result = await ensureWorkbook(google.client, "stale-token");
    expect(result).toEqual({ status: "call-failed", failure: "unauthorised" });
    expect(google.files.size).toBe(0);
  });

  it("creates the header with the workbook, even when the creation response is lost", async () => {
    const { google } = setup();
    google.faults.push({ match: /^POST \/v4\/spreadsheets$/u, network: true, applyFirst: true });
    expect(await ensureWorkbook(google.client, google.token)).toEqual({ status: "call-failed", failure: "network" });
    expect(google.files.size).toBe(1);
    const again = await ensureWorkbook(google.client, google.token);
    expect(again).toMatchObject({ status: "ready", created: false });
    if (again.status !== "ready") throw new Error("setup failed");
    expect((await readDirect(google.client, google.token, again.workbook.id)).status).toBe("ok");
    expect(google.files.size).toBe(1);
    expect(google.callsMatching(/^PUT /u)).toHaveLength(0);
  });

  it("recovers discovery after the header verification is interrupted without creating another workbook", async () => {
    const { google } = setup();
    google.faults.push({ match: /^GET .*\/values\//u, network: true });
    expect((await ensureWorkbook(google.client, google.token)).status).toBe("call-failed");
    const again = await ensureWorkbook(google.client, google.token);
    expect(again).toMatchObject({ status: "ready", created: false });
    if (again.status !== "ready") throw new Error("setup failed");
    expect((await readDirect(google.client, google.token, again.workbook.id)).status).toBe("ok");
    expect(google.files.size).toBe(1);
  });

  it("preserves an older incomplete workbook instead of guessing its missing header", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const tab = google.tab(workbook.id, LEDGER_TAB);
    if (tab === undefined) throw new Error("setup failed");
    tab.rows = [["unrecognised existing records"]];
    await ensureWorkbook(google.client, google.token);
    expect((await readDirect(google.client, google.token, workbook.id)).status).toBe("refused");
    expect(tab.rows).toEqual([["unrecognised existing records"]]);
    expect(google.files.size).toBe(1);
  });

  it("does not report successful creation when the returned workbook has an invalid header", async () => {
    const { google } = setup();
    const rest: DirectDeps["rest"] = async (request) => {
      const response = await google.client(request);
      if (request.method === "POST" && request.url.endsWith("/v4/spreadsheets")) {
        for (const tabs of google.workbooks.values()) {
          const ledger = tabs.get(LEDGER_TAB);
          if (ledger !== undefined) ledger.rows = [["unexpected header"]];
        }
      }
      return response;
    };
    expect(await ensureWorkbook(rest, google.token)).toEqual({ status: "call-failed", failure: "unexpected" });
    expect(google.callsMatching(/^PUT /u)).toHaveLength(0);
  });
});

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
      expect((await writeGridTabs(google.client, google.token, workbook.id, [{ title: VIEW_TAB, grid: grid() }])).ok).toBe(false);
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
      expect((await writeGridTabs(google.client, google.token, workbook.id, [{ title: VIEW_TAB, grid: grid() }])).ok).toBe(true);
    }
    expect(view.developerMetadata).toHaveLength(1);
    expect(google.workbooks.get(workbook.id)?.size).toBe(2);
    expect(JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows)).toBe(records);
  });

  it("recognizes sheet zero when Google omits default-valued scalar IDs", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const rest: DirectDeps["rest"] = async (request) => {
      const answer = await google.client(request);
      if (request.method !== "GET" || request.url.includes("/values")) return answer;
      const body = await answer.json() as { sheets?: { properties: Record<string, unknown>; developerMetadata?: (Record<string, unknown> & { location: Record<string, unknown> })[] }[] };
      for (const sheet of body.sheets ?? []) {
        if (sheet.properties["sheetId"] === 0) delete sheet.properties["sheetId"];
        for (const marker of sheet.developerMetadata ?? []) {
          if (marker.location["sheetId"] === 0) { delete marker.location["sheetId"]; marker.location["locationType"] = "SHEET"; }
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
      { title: "Bank 2026-03-31", grid: grid() }, { title: "Work expenses", grid: grid() },
    ]);
    await writeGridTabs(google.client, google.token, workbook.id, [{ title: "Bank 2026-01-31", grid: grid() }]);
    expect([...google.workbooks.get(workbook.id)?.keys() ?? []]).toEqual([VIEW_TAB, "Work expenses", "Bank 2026-03-31", "Bank 2026-01-31", LEDGER_TAB]);
    expect(google.tab(workbook.id, "Bank 2026-03-31")?.tabColorStyle).toEqual(google.tab(workbook.id, "Bank 2026-01-31")?.tabColorStyle);
    expect(google.tab(workbook.id, "Work expenses")?.tabColorStyle).not.toEqual(google.tab(workbook.id, VIEW_TAB)?.tabColorStyle);
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
    expect((await writeGridTabs(google.client, google.token, workbook.id, [{ title: VIEW_TAB, grid: grid() }])).ok).toBe(true);
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
    other.developerMetadata = view.developerMetadata.map((metadata) => ({ ...metadata, location: { sheetId: other.id } }));
    const calls = google.callsMatching(/:batchUpdate$/u).length;
    expect((await writeGridTabs(google.client, google.token, workbook.id, [{ title: "New view", grid: grid() }, { title: VIEW_TAB, grid: grid() }])).ok).toBe(false);
    expect(google.callsMatching(/:batchUpdate$/u)).toHaveLength(calls);
    expect(google.tab(workbook.id, "New view")).toBeUndefined();
  });

  it("never lets a generated view erase the ledger or repeat a role", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const before = JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows);
    expect((await writeGridTabs(google.client, google.token, workbook.id, [{ title: LEDGER_TAB, grid: grid() }])).ok).toBe(false);
    expect((await writeGridTabs(google.client, google.token, workbook.id, [{ title: VIEW_TAB, grid: grid() }, { title: VIEW_TAB, grid: grid() }])).ok).toBe(false);
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
    const duplicate = { ...original, id: 2000, rows: original.rows.map((row) => [...row]), developerMetadata: original.developerMetadata.map((marker) => ({ ...marker, location: { sheetId: 2000 } })) };
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
    expect(await writeGridTabs(google.client, google.token, workbook.id, [view])).toMatchObject({ ok: true, consolidatedTabs: 0, preservedTabs: 1 });
    expect(google.tab(workbook.id, `${title} (2)`)?.rows).toEqual([["=1+1"]]);
  });

  it("resolves a lost view-write response by finding the marker, without making duplicate tabs", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
    expect((await writeGridTabs(google.client, google.token, workbook.id, [{ title: "Generated", grid: grid() }])).ok).toBe(false);
    expect((await writeGridTabs(google.client, google.token, workbook.id, [{ title: "Generated", grid: grid() }])).ok).toBe(true);
    expect(google.workbooks.get(workbook.id)?.size).toBe(3);
  });

  it("rolls back a new tab when its ownership marker cannot be created", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const rest: DirectDeps["rest"] = (request) => {
      if (request.body !== undefined && request.url.endsWith(":batchUpdate")) {
        const body = JSON.parse(request.body) as { requests: Record<string, unknown>[] };
        for (const item of body.requests) {
          if (item["createDeveloperMetadata"] !== undefined) item["createDeveloperMetadata"] = { developerMetadata: { location: { sheetId: -1 } } };
        }
        return google.client({ ...request, body: JSON.stringify(body) });
      }
      return google.client(request);
    };
    expect((await writeGridTabs(rest, google.token, workbook.id, [{ title: "Generated", grid: grid() }])).ok).toBe(false);
    expect(google.tab(workbook.id, "Generated")).toBeUndefined();
    expect(google.workbooks.get(workbook.id)?.size).toBe(2);
  });
});

describe("readDirect", () => {
  it("reads an empty ledger as a ledger with no statements", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const read = await readDirect(google.client, google.token, workbook.id);
    expect(read).toMatchObject({ status: "ok", ignoredTrailingRows: 0 });
    if (read.status === "ok") expect(read.state).toEqual(EMPTY_LEDGER);
  });

  it("refuses a spreadsheet that is not a ledger, and one that is gone", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const tab = google.tab(workbook.id, LEDGER_TAB);
    if (tab !== undefined) tab.rows = [["Date", "Amount"]];
    expect((await readDirect(google.client, google.token, workbook.id)).status).toBe("refused");
    expect((await readDirect(google.client, google.token, "no-such-workbook")).status).toBe("workbook-unavailable");
  });

  it("reports a record that was altered by hand as damaged and never shows it", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("committed");
    const rows = google.tab(workbook.id, LEDGER_TAB)?.rows ?? [];
    const snapshot = rows.find((row) => row[1] === "SNAPSHOT");
    if (snapshot !== undefined) snapshot[2] = String(snapshot[2]).replace("1000", "9999");
    expect((await readDirect(google.client, google.token, workbook.id)).status).toBe("damaged");
  });
});

describe("commitDirect: saving", () => {
  it("saves a statement in one request and reads back exactly what was saved, as text", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const result = await commitDirect(deps, google.token, workbook.id, first());
    expect(result).toMatchObject({ status: "committed" });
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(1);
    const rows = google.tab(workbook.id, LEDGER_TAB)?.rows ?? [];
    expect(rows.slice(1).every((row) => row.every((cell) => typeof cell === "string"))).toBe(true);
    expect(rows[rows.length - 1]?.[1]).toBe("COMMIT");
    const read = await readDirect(google.client, google.token, workbook.id);
    expect(read.status === "ok" && read.state.snapshots.map((snapshot) => snapshot.date)).toEqual(["2026-01-31"]);
  });

  it("builds on the previous revision and keeps every earlier statement", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const one = await commitDirect(deps, google.token, workbook.id, first());
    const revision = one.status === "committed" ? one.revision : "";
    expect((await commitDirect(deps, google.token, workbook.id, second(revision))).status).toBe("committed");
    const read = await readDirect(google.client, google.token, workbook.id);
    expect(read.status === "ok" && read.state.snapshots).toHaveLength(2);
  });

  it("records the same save once: a repeat with the same id writes nothing, a different content with that id is refused", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    const appendsBefore = google.requests.filter((request) => request["appendCells"] !== undefined).length;
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("already-committed");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(appendsBefore);
    const different = { ...first(), statement: statement(1234) };
    expect((await commitDirect(deps, google.token, workbook.id, different)).status).toBe("rejected");
  });

  it("refuses a review made against an older revision, and writes nothing", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    const appends = google.requests.filter((request) => request["appendCells"] !== undefined).length;
    expect((await commitDirect(deps, google.token, workbook.id, second("a-revision-nobody-has"))).status).toBe("stale");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(appends);
  });

  it("notices another writer arriving between the read and the write, and writes nothing", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.afterRead = {
      count: google.calls.filter((call) => call.startsWith("GET ") && call.includes("/values/")).length + 1,
      run: () => {
        google.tab(workbook.id, LEDGER_TAB)?.rows.push(["x", "SNAPSHOT", "{}", "x"]);
      },
    };
    const result = await commitDirect(deps, google.token, workbook.id, first());
    expect(result.status).toBe("stale");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(0);
  });

  it("detects same-length content edits between reads without appending", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    google.afterRead = { count: google.calls.filter(call => call.startsWith("GET ") && call.includes("/values/")).length + 1, run: () => {
      const rows = google.tab(workbook.id, LEDGER_TAB)?.rows;
      if (rows?.[1] !== undefined) rows[1][2] = "changed without adding rows";
    } };
    const before = google.requests.filter((request) => request["appendCells"] !== undefined).length;
    expect((await commitDirect(deps, google.token, workbook.id, second("revision-0001"))).status).toBe("stale");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(before);
  });

  it("does not call an acknowledged append successful when verification cannot be read", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    let appended = false;
    const rest: DirectDeps["rest"] = async request => {
      if (appended && request.method === "GET") throw new Error("verification connection lost");
      const response = await google.client(request);
      if (request.method === "POST" && request.url.includes(":batchUpdate")) appended = true;
      return response;
    };
    expect((await commitDirect({ ...deps, rest }, google.token, workbook.id, first())).status).toBe("unknown");
    expect((await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).status).toBe("committed");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(1);
  });

  it("reconciles an unexpected response against the original command receipt before reporting success", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:batchUpdate$/u, status: 418, applyFirst: true });
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("already-committed");
    expect((await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).status).toBe("committed");
  });

  it("treats a refusal Google made before doing anything as not written, and the retry then works", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:batchUpdate$/u, status: 403 });
    expect(await commitDirect(deps, google.token, workbook.id, first())).toEqual({ status: "not-sent", failure: "forbidden" });
    expect((await readDirect(google.client, google.token, workbook.id)).status === "ok").toBe(true);
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("committed");
  });

  it("calls a lost answer unknown, resolves it by reading, and a retry cannot record it twice", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
    const lost = await commitDirect(deps, google.token, workbook.id, first());
    expect(lost.status).toBe("unknown");
    expect(await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).toEqual({ status: "committed" });
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("already-committed");
    const read = await readDirect(google.client, google.token, workbook.id);
    expect(read.status === "ok" && read.state.snapshots).toHaveLength(1);
  });

  it("calls a busy answer unknown too, because Google may have applied it; reading shows the truth", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:batchUpdate$/u, status: 503 });
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("unknown");
    expect(await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).toEqual({ status: "not-found" });
  });

  it("refuses to add to a damaged ledger", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    const snapshot = (google.tab(workbook.id, LEDGER_TAB)?.rows ?? []).find((row) => row[1] === "SNAPSHOT");
    if (snapshot !== undefined) snapshot[2] = "{}";
    const appends = google.requests.filter((request) => request["appendCells"] !== undefined).length;
    expect((await commitDirect(deps, google.token, workbook.id, second("anything"))).status).toBe("damaged");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(appends);
  });

  it("does not use the token anywhere but the authorisation header", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    expect(google.calls.join("\n")).not.toContain(google.token);
  });
});

describe("restoreDirect: the loop closes both ways", () => {
  async function savedCopy() {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const one = await commitDirect(deps, google.token, workbook.id, first());
    await commitDirect(deps, google.token, workbook.id, second(one.status === "committed" ? one.revision : ""));
    const read = await readDirect(google.client, google.token, workbook.id);
    if (read.status !== "ok") throw new Error("setup failed");
    return read.state;
  }

  it("re-creates a lost spreadsheet from the device copy and reads it back", async () => {
    const copy = await savedCopy();
    const { google, deps } = setup();
    const restored = await restoreDirect(deps, google.token, copy, null);
    expect(restored.status).toBe("restored");
    if (restored.status !== "restored") return;
    expect(restored.ledger.snapshots.map((snapshot) => snapshot.date)).toEqual(copy.snapshots.map((snapshot) => snapshot.date));
    const read = await readDirect(google.client, google.token, restored.workbook.id);
    expect(read.status === "ok" && read.state.snapshots).toHaveLength(2);
  });

  it("fills an existing empty spreadsheet, but never one that already holds statements", async () => {
    const copy = await savedCopy();
    const { google, deps } = setup();
    const empty = await readyWorkbook(google);
    const into = await restoreDirect(deps, google.token, copy, empty);
    expect(into.status).toBe("restored");
    expect((await restoreDirect(deps, google.token, copy, empty)).status).toBe("not-empty");
  });

  it("refuses a copy that fails the ledger rules or holds no statements", async () => {
    const { google, deps } = setup();
    expect((await restoreDirect(deps, google.token, EMPTY_LEDGER, null)).status).toBe("invalid");
    const broken = { revision: "r", funds: [{ isin: "NOT-AN-ISIN", name: "A", fullName: "A", firstDate: "2026-01-31" }], snapshots: [] };
    expect((await restoreDirect(deps, google.token, broken as never, null)).status).toBe("invalid");
    expect(google.files.size).toBe(0);
  });
});

describe("refreshView", () => {
  it("writes a readable summary with a notice that it is rebuilt, and survives a failure without touching the records", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    const read = await readDirect(google.client, google.token, workbook.id);
    if (read.status !== "ok") throw new Error("setup failed");
    expect(await refreshView(google.client, google.token, workbook.id, read.state)).toBe(true);
    const lines = google.tab(workbook.id, VIEW_TAB)?.rows ?? [];
    expect(String(lines[2]?.[1])).toContain("rebuilt");
    expect(lines.some((line) => line[1] === "Latest statement" && line[2] === toSpreadsheetSerial(date("2026-01-31")))).toBe(true);
    const ledgerBefore = JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows);
    google.faults.push({ match: /:batchUpdate$/u, status: 500 });
    expect(await refreshView(google.client, google.token, workbook.id, read.state)).toBe(false);
    expect(JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows)).toBe(ledgerBefore);
  });
});

describe("saving the bank statement with the month", () => {
  const sheet: RawSheet = {
    date1904: false,
    rows: [
      [undefined, { kind: "text", text: "Categoria / Nome prodotto" }],
      [{ kind: "number", text: "652.289", format: null }, { kind: "text", text: "Synthetic Fund A" }],
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
    expect(await mirrorStatements(google.client, google.token, workbook.id, [{ date: date("2026-01-31"), sheet }], rawGrid)).toBe(true);
    const title = statementTabTitle(date("2026-01-31"));
    expect(title).toBe("Bank 2026-01-31");
    // The data keeps its place, with one empty row and column around it.
    expect(google.tab(workbook.id, title)?.rows).toEqual([
      ["", "", "", ""],
      ["", "", "Categoria / Nome prodotto", ""],
      ["", 652.289, "Synthetic Fund A", ""],
      ["", "", "", ""],
    ]);
    expect(await mirrorStatements(google.client, google.token, workbook.id, [{ date: date("2026-01-31"), sheet }], rawGrid)).toBe(true);
    expect([...(google.workbooks.get(workbook.id)?.keys() ?? [])].filter((name) => name === title)).toHaveLength(1);
  });

  it("lets a failed readable tab pass without touching the saved records", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, withSource());
    const before = JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows);
    google.faults.push({ match: /:batchUpdate$/u, status: 503 });
    expect(await mirrorStatements(google.client, google.token, workbook.id, [{ date: date("2026-01-31"), sheet }], rawGrid)).toBe(false);
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
    const months = Array.from({ length: 17 }, (_, index) => ({ date: date(`2026-${String((index % 12) + 1).padStart(2, "0")}-${index < 12 ? "15" : "16"}`), sheet: sheetFor(`Month ${String(index)}`) }));
    const before = google.calls.length;
    expect(await mirrorStatements(google.client, google.token, workbook.id, months, rawGrid)).toBe(true);
    // List the tabs, then one batch that adds, fits, formats and fills them all.
    expect(google.calls.length - before).toBe(2);
    expect([...(google.workbooks.get(workbook.id)?.keys() ?? [])].filter((name) => name.startsWith("Bank "))).toHaveLength(17);
    expect(google.tab(workbook.id, "Bank 2026-03-15")?.rows).toEqual([["", "", ""], ["", "Month 2", ""], ["", "", ""]]);
  });

  it("rewrites tabs that exist and adds only the missing ones", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    await mirrorStatements(google.client, google.token, workbook.id, [{ date: date("2026-01-31"), sheet: sheetFor("old") }], rawGrid);
    await mirrorStatements(google.client, google.token, workbook.id, [
      { date: date("2026-01-31"), sheet: sheetFor("new") },
      { date: date("2026-02-28"), sheet: sheetFor("second") },
    ], rawGrid);
    expect(google.tab(workbook.id, "Bank 2026-01-31")?.rows).toEqual([["", "", ""], ["", "new", ""], ["", "", ""]]);
    expect(google.tab(workbook.id, "Bank 2026-02-28")?.rows).toEqual([["", "", ""], ["", "second", ""], ["", "", ""]]);
    expect([...(google.workbooks.get(workbook.id)?.keys() ?? [])].filter((name) => name === "Bank 2026-01-31")).toHaveLength(1);
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
  const sheet = (): RawSheet => ({ date1904: false, rows: [[], [undefined, { kind: "text", text: "Header" }, { kind: "number", text: "5", format: null }], [], []] });

  it("cuts a tab down to its data plus one empty row and column, deleting what was there", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    await mirrorStatements(google.client, google.token, workbook.id, [{ date: date("2026-01-31"), sheet: sheet() }], rawGrid);
    const tab = google.tab(workbook.id, "Bank 2026-01-31");
    expect([tab?.rowCount, tab?.columnCount]).toEqual([3, 4]);
    // Rewriting with a bigger tab in place first (as a person might) still ends lean.
    if (tab !== undefined) {
      tab.rowCount = 1000;
      tab.columnCount = 26;
      tab.rows[500] = ["stray"];
    }
    await mirrorStatements(google.client, google.token, workbook.id, [{ date: date("2026-01-31"), sheet: sheet() }], rawGrid);
    expect([tab?.rowCount, tab?.columnCount]).toEqual([3, 4]);
    expect(tab?.rows).toHaveLength(3);
  });

  it("applies the whole write or none of it, so a refused batch leaves the old tab alone", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    await mirrorStatements(google.client, google.token, workbook.id, [{ date: date("2026-01-31"), sheet: sheet() }], rawGrid);
    const before = JSON.stringify(google.tab(workbook.id, "Bank 2026-01-31")?.rows);
    google.faults.push({ match: /:batchUpdate$/u, status: 400 });
    expect(await mirrorStatements(google.client, google.token, workbook.id, [{ date: date("2026-01-31"), sheet: { date1904: false, rows: [[{ kind: "text", text: "Other" }]] } }], rawGrid)).toBe(false);
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
    const patterns = (view?.formats ?? []).flat().map((format) => (format?.["numberFormat"] as { pattern?: string } | undefined)?.pattern);
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

describe("attachDirect: statements for months saved earlier", () => {
  it("attaches in one request, leaves the figures as they were, and a repeat writes nothing", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const one = await commitDirect(deps, google.token, workbook.id, first());
    const revision = one.status === "committed" ? one.revision : "";
    const sheet: RawSheet = { date1904: false, rows: [[{ kind: "text", text: "Fondi" }]] };
    // The earlier save had no statement; this statement must reproduce the saved month, so it is the same funds and figures.
    const request = { commandId: "attach-0001", expectedRevision: revision, items: [{ date: date("2026-01-31"), statement: statement(1000), commands: [start], source: { sheetName: "Il Mio Patrimonio", sheet } }] };
    const appendsBefore = google.requests.filter((request) => request["appendCells"] !== undefined).length;
    expect((await attachDirect(deps, google.token, workbook.id, request)).status).toBe("committed");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(appendsBefore + 1);
    const all = await readAllDirect(google.client, google.token, workbook.id);
    expect(all.status === "ok" && [all.state.snapshots.length, all.sources.length]).toEqual([1, 1]);
    expect((await attachDirect(deps, google.token, workbook.id, request)).status).toBe("already-committed");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(appendsBefore + 1);
  });

  it("refuses a statement that does not reproduce the saved month, and writes nothing", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const one = await commitDirect(deps, google.token, workbook.id, first());
    const revision = one.status === "committed" ? one.revision : "";
    const sheet: RawSheet = { date1904: false, rows: [] };
    const request = { commandId: "attach-0002", expectedRevision: revision, items: [{ date: date("2026-01-31"), statement: statement(999), commands: [start], source: { sheetName: "S", sheet } }] };
    const appendsBefore = google.requests.filter((request) => request["appendCells"] !== undefined).length;
    expect((await attachDirect(deps, google.token, workbook.id, request)).status).toBe("rejected");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(appendsBefore);
  });
});

describe("atomic predecessor guard", () => {
  it.each([
    { command: "device-two", value: 1200, statuses: ["committed", "stale"], receipt: "not-found" },
    { command: "device-one", value: 1000, statuses: ["already-committed", "committed"], receipt: "committed" },
  ])("coordinates two devices past the final read ($command), preserving one valid save", async ({ command, value, statuses, receipt }) => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let waiting = 0;
    const rest: DirectDeps["rest"] = async (request) => {
      if (request.body?.includes('"appendCells"')) {
        waiting++;
        if (waiting === 2) release?.();
        await gate;
      }
      return google.client(request);
    };
    const results = await Promise.all([
      commitDirect({ ...deps, rest }, google.token, workbook.id, first("", "device-one")),
      commitDirect({ ...deps, rest }, google.token, workbook.id, { ...first("", command), statement: statement(value) }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(statuses);
    expect(google.namedRanges.get(workbook.id)?.size).toBe(1);
    const read = await readDirect(google.client, google.token, workbook.id);
    expect(read).toMatchObject({ status: "ok", ignoredTrailingRows: 0 });
    if (read.status !== "ok") throw new Error("ledger must stay readable");
    expect(read.state.snapshots).toHaveLength(1);
    expect((await outcomeDirect(google.client, google.token, workbook.id, "device-one")).status).toBe("committed");
    expect((await outcomeDirect(google.client, google.token, workbook.id, command)).status).toBe(receipt);
  });

  it("does not mark an acknowledged save uncertain when a legitimate successor arrives before read-back", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    let followed = false;
    const rest: DirectDeps["rest"] = async (request) => {
      const response = await google.client(request);
      if (!followed && request.body?.includes('"appendCells"')) {
        followed = true;
        expect((await commitDirect(deps, google.token, workbook.id, second("revision-0001"))).status).toBe("committed");
      }
      return response;
    };
    expect((await commitDirect({ ...deps, rest }, google.token, workbook.id, first())).status).toBe("committed");
    const read = await readDirect(google.client, google.token, workbook.id);
    expect(read.status === "ok" && read.state.snapshots).toHaveLength(2);
  });

  it("rolls back the predecessor marker if the append in its batch is invalid", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const rest: DirectDeps["rest"] = (request) => {
      if (!request.body?.includes('"appendCells"')) return google.client(request);
      const body = JSON.parse(request.body) as { requests: { appendCells?: { sheetId: number } }[] };
      const append = body.requests.find((item) => item.appendCells !== undefined)?.appendCells;
      if (append !== undefined) append.sheetId = -999;
      return google.client({ ...request, body: JSON.stringify(body) });
    };
    expect((await commitDirect({ ...deps, rest }, google.token, workbook.id, first())).status).toBe("unknown");
    expect(google.namedRanges.get(workbook.id)?.size ?? 0).toBe(0);
    expect(await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).toEqual({ status: "not-found" });
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("committed");
  });
});
