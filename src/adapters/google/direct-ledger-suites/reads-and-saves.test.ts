import { describe, expect, it } from "vitest";
import { toSpreadsheetSerial } from "../../../core/values/iso-date";
import { EMPTY_LEDGER } from "../../../core/portfolio/ledger";
import { type DirectDeps, commitDirect, outcomeDirect, readDirect, refreshView, restoreDirect } from "../direct-ledger";
import { LEDGER_TAB, VIEW_TAB } from "../sheets-layout";
import {
  date,
  statement,
  first,
  second,
  setup,
  readyWorkbook,
} from "../../../../tests/fixtures/google-adapters/direct-ledger-support";

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
    google.afterRead = {
      count: google.calls.filter((call) => call.startsWith("GET ") && call.includes("/values/")).length + 1,
      run: () => {
        const rows = google.tab(workbook.id, LEDGER_TAB)?.rows;
        if (rows?.[1] !== undefined) rows[1][2] = "changed without adding rows";
      },
    };
    const before = google.requests.filter((request) => request["appendCells"] !== undefined).length;
    expect((await commitDirect(deps, google.token, workbook.id, second("revision-0001"))).status).toBe("stale");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(before);
  });

  it("does not call an acknowledged append successful when verification cannot be read", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    let appended = false;
    const rest: DirectDeps["rest"] = async (request) => {
      if (appended && request.method === "GET") throw new Error("verification connection lost");
      const response = await google.client(request);
      if (request.method === "POST" && request.url.includes(":batchUpdate")) appended = true;
      return response;
    };
    expect((await commitDirect({ ...deps, rest }, google.token, workbook.id, first())).status).toBe("unknown");
    expect((await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).status).toBe(
      "committed",
    );
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(1);
  });

  it("reconciles an unexpected response against the original command receipt before reporting success", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:batchUpdate$/u, status: 418, applyFirst: true });
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("already-committed");
    expect((await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).status).toBe(
      "committed",
    );
  });

  it("treats a refusal Google made before doing anything as not written, and the retry then works", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:batchUpdate$/u, status: 403 });
    expect(await commitDirect(deps, google.token, workbook.id, first())).toEqual({
      status: "not-sent",
      failure: "forbidden",
    });
    expect((await readDirect(google.client, google.token, workbook.id)).status === "ok").toBe(true);
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("committed");
  });

  it("calls a lost answer unknown, resolves it by reading, and a retry cannot record it twice", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
    const lost = await commitDirect(deps, google.token, workbook.id, first());
    expect(lost.status).toBe("unknown");
    expect(await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).toEqual({
      status: "committed",
    });
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("already-committed");
    const read = await readDirect(google.client, google.token, workbook.id);
    expect(read.status === "ok" && read.state.snapshots).toHaveLength(1);
  });

  it("calls a busy answer unknown too, because Google may have applied it; reading shows the truth", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    google.faults.push({ match: /:batchUpdate$/u, status: 503 });
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("unknown");
    expect(await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).toEqual({
      status: "not-found",
    });
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
    expect(restored.ledger.snapshots.map((snapshot) => snapshot.date)).toEqual(
      copy.snapshots.map((snapshot) => snapshot.date),
    );
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

  it("restores past interrupted rows without moving or overwriting their evidence", async () => {
    const copy = await savedCopy();
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const tab = google.tab(workbook.id, LEDGER_TAB);
    if (tab === undefined) throw new Error("Synthetic ledger tab missing");
    const interrupted = ["interrupted", "META", "{}", "incomplete"];
    tab.rows.push(interrupted);
    const restored = await restoreDirect(deps, google.token, copy, workbook);
    expect(restored.status).toBe("restored");
    expect(tab.rows[1]).toEqual(interrupted);
    const read = await readDirect(google.client, google.token, workbook.id);
    expect(read.status).toBe("ok");
    if (read.status === "ok") expect(read.state.snapshots).toEqual(copy.snapshots);
  });

  it("refuses a copy that fails the ledger rules or holds no statements", async () => {
    const { google, deps } = setup();
    expect((await restoreDirect(deps, google.token, EMPTY_LEDGER, null)).status).toBe("invalid");
    const broken = {
      revision: "r",
      funds: [{ isin: "NOT-AN-ISIN", name: "A", fullName: "A", firstDate: "2026-01-31" }],
      snapshots: [],
    };
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
    expect(
      lines.some((line) => line[1] === "Latest statement" && line[2] === toSpreadsheetSerial(date("2026-01-31"))),
    ).toBe(true);
    const ledgerBefore = JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows);
    google.faults.push({ match: /:batchUpdate$/u, status: 500 });
    expect(await refreshView(google.client, google.token, workbook.id, read.state)).toBe(false);
    expect(JSON.stringify(google.tab(workbook.id, LEDGER_TAB)?.rows)).toBe(ledgerBefore);
  });
});
