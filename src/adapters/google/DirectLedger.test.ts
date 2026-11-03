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
    expect(google.callsMatching(/:append$/u)).toHaveLength(1);
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
    const appendsBefore = google.callsMatching(/:append$/u).length;
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("already-committed");
    expect(google.callsMatching(/:append$/u)).toHaveLength(appendsBefore);
    const different = { ...first(), statement: statement(1234) };
    expect((await commitDirect(deps, google.token, workbook.id, different)).status).toBe("rejected");
  });

  it("refuses a review made against an older revision, and writes nothing", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    const appends = google.callsMatching(/:append$/u).length;
    expect((await commitDirect(deps, google.token, workbook.id, second("a-revision-nobody-has"))).status).toBe("stale");
    expect(google.callsMatching(/:append$/u)).toHaveLength(appends);
  });

  it("notices another writer arriving between the read and the write, and writes nothing", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.afterRead = {
      count: 1,
      run: () => {
        google.tab(workbook.id, LEDGER_TAB)?.rows.push(["x", "SNAPSHOT", "{}", "x"]);
      },
    };
    const result = await commitDirect(deps, google.token, workbook.id, first());
    expect(result.status).toBe("stale");
    expect(google.callsMatching(/:append$/u)).toHaveLength(0);
  });

  it("detects same-length content edits between reads without appending", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    google.afterRead = { count: google.calls.filter(call => call.startsWith("GET ") && call.includes("/values/")).length + 1, run: () => {
      const rows = google.tab(workbook.id, LEDGER_TAB)?.rows;
      if (rows?.[1] !== undefined) rows[1][2] = "changed without adding rows";
    } };
    const before = google.callsMatching(/:append$/u).length;
    expect((await commitDirect(deps, google.token, workbook.id, second("revision-0001"))).status).toBe("stale");
    expect(google.callsMatching(/:append$/u)).toHaveLength(before);
  });

  it("does not call an acknowledged append successful when verification cannot be read", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    let appended = false;
    const rest: DirectDeps["rest"] = async request => {
      if (appended && request.method === "GET") throw new Error("verification connection lost");
      const response = await google.client(request);
      if (request.method === "POST" && request.url.includes(":append?")) appended = true;
      return response;
    };
    expect((await commitDirect({ ...deps, rest }, google.token, workbook.id, first())).status).toBe("unknown");
    expect((await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).status).toBe("committed");
    expect(google.callsMatching(/:append$/u)).toHaveLength(1);
  });

  it("treats an unexpected response after an applied append as unknown", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:append$/u, status: 418, applyFirst: true });
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("unknown");
    expect((await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).status).toBe("committed");
  });

  it("treats a refusal Google made before doing anything as not written, and the retry then works", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:append$/u, status: 403 });
    expect(await commitDirect(deps, google.token, workbook.id, first())).toEqual({ status: "not-sent", failure: "forbidden" });
    expect((await readDirect(google.client, google.token, workbook.id)).status === "ok").toBe(true);
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("committed");
  });

  it("calls a lost answer unknown, resolves it by reading, and a retry cannot record it twice", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:append$/u, network: true, applyFirst: true });
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
    google.faults.push({ match: /:append$/u, status: 503 });
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("unknown");
    expect(await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).toEqual({ status: "not-found" });
  });

  it("refuses to add to a damaged ledger", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    await commitDirect(deps, google.token, workbook.id, first());
    const snapshot = (google.tab(workbook.id, LEDGER_TAB)?.rows ?? []).find((row) => row[1] === "SNAPSHOT");
    if (snapshot !== undefined) snapshot[2] = "{}";
    const appends = google.callsMatching(/:append$/u).length;
    expect((await commitDirect(deps, google.token, workbook.id, second("anything"))).status).toBe("damaged");
    expect(google.callsMatching(/:append$/u)).toHaveLength(appends);
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
    expect(google.callsMatching(/:append$/u)).toHaveLength(1);
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
    const appendsBefore = google.callsMatching(/:append$/u).length;
    expect((await attachDirect(deps, google.token, workbook.id, request)).status).toBe("committed");
    expect(google.callsMatching(/:append$/u)).toHaveLength(appendsBefore + 1);
    const all = await readAllDirect(google.client, google.token, workbook.id);
    expect(all.status === "ok" && [all.state.snapshots.length, all.sources.length]).toEqual([1, 1]);
    expect((await attachDirect(deps, google.token, workbook.id, request)).status).toBe("already-committed");
    expect(google.callsMatching(/:append$/u)).toHaveLength(appendsBefore + 1);
  });

  it("refuses a statement that does not reproduce the saved month, and writes nothing", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const one = await commitDirect(deps, google.token, workbook.id, first());
    const revision = one.status === "committed" ? one.revision : "";
    const sheet: RawSheet = { date1904: false, rows: [] };
    const request = { commandId: "attach-0002", expectedRevision: revision, items: [{ date: date("2026-01-31"), statement: statement(999), commands: [start], source: { sheetName: "S", sheet } }] };
    const appendsBefore = google.callsMatching(/:append$/u).length;
    expect((await attachDirect(deps, google.token, workbook.id, request)).status).toBe("rejected");
    expect(google.callsMatching(/:append$/u)).toHaveLength(appendsBefore);
  });
});
