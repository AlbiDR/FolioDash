import { describe, expect, it } from "vitest";
import { OPENING, februarySheet, januarySheet } from "../../../../../../tests/fixtures/saved-months";
import { ISIN_A, ISIN_B, syntheticSheet } from "../../../../../../tests/fixtures/synthetic-fideuram-sheet";
import type { AttachItem } from "../../../../../applications/ledger/ledger-service";
import { planImport } from "../../../../../core/statements/import-plan";
import type { FundCommand } from "../../../../../core/statements/import-plan";
import { ZERO_CENTS } from "../../../../../core/values/money";
import type { RecordRequest } from "../../../../../applications/import/import-model";
import { interpretStatement } from "../interpret-statement";
import { cents, date, january, world, saved } from "../../../../../../tests/fixtures/session/session-test-support";

describe("the sheet keeps the bank statements, and can prove it", () => {
  /** The synthetic bank statement, read the way the import screen reads it, with the decisions made about it. */
  function withStatement(): RecordRequest {
    const sheet = syntheticSheet();
    const read = interpretStatement(sheet);
    if (!read.ok) throw new Error("setup failed");
    const commands: FundCommand[] = [ISIN_A, ISIN_B].map((isin) => ({
      isin,
      action: "Start",
      moneyIn: ZERO_CENTS,
      moneyOut: ZERO_CENTS,
      openingNetInvested: cents(1000),
      comment: "",
    }));
    return {
      date: date("2026-01-31"),
      statement: read.statement,
      commands,
      source: { sheetName: "Il Mio Patrimonio", sheet },
    };
  }

  it("saves the statement with the month, writes a readable tab for it, and proves the ledger rebuilds from it", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    expect((await saved(session, withStatement())).status).toBe("recorded");
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    expect(google.tab(id, "Bank 2026-01-31")?.rows.length).toBeGreaterThan(5);
    expect(await session.verifyHistory()).toEqual({
      status: "checked",
      report: { months: 1, matching: 1, withoutStatement: 0, differing: [], unreadable: [] },
    });
  });

  it("counts a month saved without its statement as exactly that, not as an error", async () => {
    const { make } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    expect(await session.verifyHistory()).toMatchObject({
      status: "checked",
      report: { months: 1, matching: 0, withoutStatement: 1 },
    });
  });

  it("says plainly that a restored sheet holds the figures but not the statements", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    await saved(session, withStatement());
    google.workbooks.delete(session.state.workbook?.id ?? "");
    await session.refresh();
    expect((await session.restoreFromDevice()).status).toBe("restored");
    expect(await session.verifyHistory()).toMatchObject({
      status: "checked",
      report: { months: 1, matching: 0, withoutStatement: 1 },
    });
  });

  it("reports a stored statement that was altered by hand, and changes nothing", async () => {
    const { google, store, make } = world();
    const session = make();
    await session.connect();
    await saved(session, withStatement());
    const before = store.data.get("foliodash.ledger.v1");
    const piece = (google.tab(session.state.workbook?.id ?? "", "_FolioDash ledger")?.rows ?? []).find(
      (row) => row[1] === "SOURCE",
    );
    if (piece !== undefined) piece[2] = String(piece[2]).replace("EXAMPLE", "EXAMPLX");
    expect(await session.verifyHistory()).toMatchObject({ status: "needs-attention" });
    expect(store.data.get("foliodash.ledger.v1")).toBe(before);
  });

  it("joins concurrent history checks into one read and fetches again for a later check", async () => {
    const { make, google } = world();
    let hold = false;
    let reads = 0;
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const session = make({
      rest: async (request) => {
        if (hold && request.method === "GET" && request.url.includes("/values/")) {
          reads++;
          entered?.();
          await barrier;
        }
        return google.client(request);
      },
    });
    await session.connect();
    await saved(session, january);
    await session.idle();
    hold = true;
    const first = session.verifyHistory();
    const second = session.verifyHistory();
    expect(second).toBe(first);
    await started;
    expect(reads).toBe(1);
    release?.();
    expect(await first).toMatchObject({ status: "checked", report: { months: 1, withoutStatement: 1 } });
    await second;
    expect(await session.verifyHistory()).toMatchObject({ status: "checked" });
    expect(reads).toBe(2);
  });

  it("releases a failed history check so a later explicit check can recover", async () => {
    const { make, google, store } = world();
    let fail = false;
    const session = make({
      rest: (request) =>
        fail && request.method === "GET" && request.url.includes("/values/")
          ? Promise.resolve({ status: 503, json: () => Promise.resolve({}) })
          : google.client(request),
    });
    await session.connect();
    await saved(session, january);
    await session.idle();
    const copy = store.data.get("foliodash.ledger.v1");
    fail = true;
    expect(await session.verifyHistory()).toMatchObject({ status: "failed" });
    expect(store.data.get("foliodash.ledger.v1")).toBe(copy);
    fail = false;
    expect(await session.verifyHistory()).toMatchObject({ status: "checked", report: { months: 1 } });
  });

  it("discards an old account's pending history report and lets the new context check independently", async () => {
    const { make, google } = world();
    let hold = false;
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const session = make({
      rest: async (request) => {
        if (hold && request.method === "GET" && request.url.includes("/values/")) {
          entered?.();
          await barrier;
        }
        return google.client(request);
      },
    });
    await session.connect();
    await saved(session, january);
    await session.idle();
    hold = true;
    const checking = session.verifyHistory();
    await started;
    session.forget();
    const next = session.verifyHistory();
    expect(next).not.toBe(checking);
    expect(await next).toMatchObject({ status: "failed" });
    release?.();
    const result = await checking;
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.message).toContain("account changed");
    expect(session.state.ledger.snapshots).toEqual([]);
  });

  it("needs a sheet before it can check anything", async () => {
    const { make } = world();
    expect(await make().verifyHistory()).toMatchObject({ status: "failed" });
  });
});

describe("attaching statements to months saved earlier, through the session", () => {
  /** Two months saved the way the first version saved them: figures and decisions, no bank statement. */
  async function twoMonthsWithoutStatements() {
    const w = world();
    const session = w.make();
    await session.connect();
    const read = (sheet: ReturnType<typeof januarySheet>) => {
      const result = interpretStatement(sheet);
      if (!result.ok) throw new Error("setup failed");
      return result.statement;
    };
    await saved(session, { date: date("2026-01-31"), statement: read(januarySheet()), commands: OPENING });
    const keeps = planImport(session.state.ledger, read(februarySheet())).map((row): FundCommand => ({
      isin: row.isin,
      action: "Keep",
      moneyIn: ZERO_CENTS,
      moneyOut: ZERO_CENTS,
      comment: "",
    }));
    await saved(session, { date: date("2026-02-28"), statement: read(februarySheet()), commands: keeps });
    const items: AttachItem[] = [
      {
        date: date("2026-01-31"),
        statement: read(januarySheet()),
        commands: OPENING,
        source: { sheetName: "Il Mio Patrimonio", sheet: januarySheet() },
      },
      {
        date: date("2026-02-28"),
        statement: read(februarySheet()),
        commands: keeps,
        source: { sheetName: "Il Mio Patrimonio", sheet: februarySheet() },
      },
    ];
    return { ...w, session, items };
  }

  it("attaches every statement in one step, writes the monthly tabs together once, and the history then rebuilds", async () => {
    const { google, session, items } = await twoMonthsWithoutStatements();
    expect(await session.save.statementDates()).toEqual(new Set());
    expect(await session.verifyHistory()).toMatchObject({ report: { months: 2, matching: 0, withoutStatement: 2 } });
    const appends = google.requests.filter((request) => request["appendCells"] !== undefined).length;
    const result = await session.save.attach(items, session.save.newCommandId(), session.state.ledger.revision);
    expect(result.status).toBe("recorded");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(appends + 1);
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    expect(google.tab(id, "Bank 2026-01-31")?.rows.length).toBeGreaterThan(5);
    expect(google.tab(id, "Bank 2026-02-28")?.rows.length).toBeGreaterThan(5);
    expect(await session.save.statementDates()).toEqual(new Set(["2026-01-31", "2026-02-28"]));
    expect(await session.verifyHistory()).toEqual({
      status: "checked",
      report: { months: 2, matching: 2, withoutStatement: 0, differing: [], unreadable: [] },
    });
  });

  it("refuses a statement for the wrong month and leaves the sheet as it was", async () => {
    const { google, session, items } = await twoMonthsWithoutStatements();
    const swapped: AttachItem[] = [
      {
        ...(items[0] as AttachItem),
        source: (items[1] as AttachItem).source,
        statement: (items[1] as AttachItem).statement,
      },
    ];
    const rows = google.tab(session.state.workbook?.id ?? "", "_FolioDash ledger")?.rows.length;
    const result = await session.save.attach(swapped, session.save.newCommandId(), session.state.ledger.revision);
    expect(result.status).toBe("rejected");
    expect(google.tab(session.state.workbook?.id ?? "", "_FolioDash ledger")?.rows.length).toBe(rows);
  });

  it("a lost answer is unknown, the check finds it, and a repeat cannot attach twice", async () => {
    const { google, session, items } = await twoMonthsWithoutStatements();
    const id = session.save.newCommandId();
    google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
    expect((await session.save.attach(items, id, session.state.ledger.revision)).status).toBe("unknown");
    expect((await session.save.check(id)).status).toBe("recorded");
    expect((await session.save.attach(items, id, "whatever")).status).toBe("recorded");
    expect(await session.save.statementDates()).toEqual(new Set(["2026-01-31", "2026-02-28"]));
  });

  it("says plainly that nothing was attached when nobody is connected", async () => {
    const { items } = await twoMonthsWithoutStatements();
    const stranger = world().make();
    expect(await stranger.save.attach(items, "id-1", "")).toMatchObject({ status: "not-saved" });
    expect(await stranger.save.statementDates()).toBeNull();
  });
});
