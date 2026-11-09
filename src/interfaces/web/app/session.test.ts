import { createGoogleSessionStore } from "../../../adapters/browser/GoogleSession";
import type { RenewalCoordination, SignInOptions, SignInResult } from "../../../applications/SessionModel";
import { createAccountHintStore } from "../../../adapters/browser/ConnectionMemory";
import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../../tests/fixtures/FakeGoogle";
import { rawGrid } from "../../../applications/SheetGrid";
import { OPENING, februarySheet, januarySheet } from "../../../../tests/fixtures/SavedMonths";
import { ISIN_A, ISIN_B, syntheticSheet } from "../../../../tests/fixtures/SyntheticFideuramSheet";
import type { AttachItem } from "../../../applications/LedgerService";
import { planImport } from "../../../core/ImportPlan";
import { LEDGER_TAB, VIEW_TAB, ORGANIZATION_METADATA_KEY, ORGANIZATION_VERSION } from "../../../adapters/google/SheetsLayout";
import type { FundCommand, StatementInput } from "../../../core/ImportPlan";
import { type IsoDate, parseIsoDate } from "../../../core/IsoDate";
import { parseIsin } from "../../../core/Isin";
import { parseExpenseAmounts } from "../../../core/WorkExpenses";
import { saveExpense, EXPENSE_LOG_TITLE, EXPENSE_VIEW_TITLE } from "../../../adapters/google/DirectExpenses";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "../../../core/Money";
import type { RecordRequest } from "../../../applications/ImportModel";
import { presentStatement } from "../../../adapters/fideuram/FideuramPresentation";
import { interpretStatement } from "./interpretStatement";
import { type KeyValueStore, createLedgerCache } from "../../../adapters/browser/LedgerCache";
import { type SessionDeps, Session } from "./session";

const cents = (value: number): EuroCents => toEuroCents(Math.round(value * 100)) ?? ZERO_CENTS;
const date = (text: string): IsoDate => parseIsoDate(text) as IsoDate;
const ISIN = (() => {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XSFUNDA0000${String(digit)}`);
    if (candidate !== null) return candidate;
  }
  throw new Error("no check digit");
})();
const statement = (value: number): StatementInput => ({ funds: [{ isin: ISIN, name: "Synthetic Fund A", marketValue: cents(value) }], fundsSubtotal: cents(value) });
const start: FundCommand = { isin: ISIN, action: "Start", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, openingNetInvested: cents(1000), comment: "" };
const keep: FundCommand = { isin: ISIN, action: "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" };
const january: RecordRequest = { date: date("2026-01-31"), statement: statement(1000), commands: [start] };
const february: RecordRequest = { date: date("2026-02-28"), statement: statement(1100), commands: [keep] };

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
};

function world(overrides: { google?: FakeGoogle; store?: ReturnType<typeof memory> } = {}) {
  const google = overrides.google ?? new FakeGoogle();
  const store = overrides.store ?? memory();
  const log = { signIns: 0, revoked: [] as string[], clock: 1_700_000_000_000, ids: 0 };
  const make = (extra: Partial<SessionDeps> = {}): Session =>
    new Session({
      clientId: "client",
      interpret: interpretStatement,
      present: presentStatement,
      signIn: (): Promise<SignInResult> => {
        log.signIns++;
        return Promise.resolve({ ok: true, accessToken: google.token, expiresInSeconds: 3600 });
      },
      revoke: (token) => log.revoked.push(token),
      rest: google.client,
      cache: createLedgerCache(() => store),
      now: () => log.clock,
      newId: () => `id-${String(++log.ids).padStart(6, "0")}`,
      ...extra,
    });
  return { google, store, log, make };
}

async function saved(session: Session, request: RecordRequest) {
  return session.save.record(request, session.save.newCommandId(), session.state.ledger.revision);
}

describe("starting from scratch", () => {
  it("connects a synthetic session without loading the normal workbook or device copy", async () => {
    const { google, make, store } = world();
    const normal = make();
    await normal.connect();
    await saved(normal, january);
    const normalCopy = store.data.get("foliodash.ledger.v1");
    const synthetic = make({
      workbookIdentity: { title: "FolioDash SYNTHETIC ACCEPTANCE", propertyKey: "foliodash-synthetic-acceptance", propertyValue: "ledger-v1" },
      cache: createLedgerCache(() => store, "foliodash.synthetic-acceptance.ledger.v1"),
    });
    expect(synthetic.state.mode).toBe("signed-out");
    await synthetic.connect();
    expect(synthetic.state.ledger.snapshots).toHaveLength(0);
    expect(synthetic.state.workbook?.id).not.toBe(normal.state.workbook?.id);
    expect(google.files.size).toBe(2);
    expect(store.data.get("foliodash.ledger.v1")).toBe(normalCopy);
    await normal.idle();
    await synthetic.idle();
  });

  it("keeps synthetic workbook identity when restoring a missing test workbook", async () => {
    const { google, make, store } = world();
    const identity = { title: "FolioDash SYNTHETIC ACCEPTANCE", propertyKey: "foliodash-synthetic-acceptance", propertyValue: "ledger-v1" };
    const session = make({ workbookIdentity: identity, cache: createLedgerCache(() => store, "foliodash.synthetic-acceptance.ledger.v1") });
    await session.connect();
    await saved(session, january);
    await session.idle();
    const original = session.state.workbook;
    if (original === null) throw new Error("Synthetic setup failed");
    google.workbooks.delete(original.id);
    const file = google.files.get(original.id);
    if (file !== undefined) file.trashed = true;
    await session.refresh();
    expect(session.state.sheet).toBe("missing");
    const result = await session.restoreFromDevice();
    expect(result.status).toBe("restored");
    const restored = session.state.workbook;
    if (restored === null) throw new Error("Synthetic restoration failed");
    expect(restored.id).not.toBe(original.id);
    expect(google.files.get(restored.id)?.name).toBe(identity.title);
    expect(google.files.get(restored.id)?.appProperties).toEqual({ [identity.propertyKey]: identity.propertyValue });
    expect(store.data.has("foliodash.ledger.v1")).toBe(false);
    await session.idle();
  });
  it("one connect signs in once, creates the sheet, and leaves the person ready to import", async () => {
    const { google, log, make } = world();
    const session = make();
    expect(session.state.mode).toBe("signed-out");
    const outcome = await session.connect();
    expect(outcome).toMatchObject({ status: "connected", created: true, statements: 0 });
    expect(session.state).toMatchObject({ mode: "online", sheet: "ok" });
    expect(session.state.workbook).not.toBeNull();
    expect(log.signIns).toBe(1);
    expect(google.files.size).toBe(1);
  });

  it("a second device finds the same sheet and loads what was saved, with nothing remembered in advance", async () => {
    const { google, make } = world();
    const first = make();
    await first.connect();
    expect((await saved(first, january)).status).toBe("recorded");
    const otherDevice = world({ google }).make();
    expect(otherDevice.state.mode).toBe("signed-out");
    expect(await otherDevice.connect()).toMatchObject({ status: "connected", created: false, statements: 1 });
    expect(google.files.size).toBe(1);
  });

  it("a refused sign-in changes nothing and touches no network", async () => {
    const { google, make } = world();
    const session = make({ signIn: () => Promise.resolve({ ok: false, reason: "denied" }) });
    expect(await session.connect()).toEqual({ status: "sign-in-failed", reason: "denied" });
    expect(session.state.mode).toBe("signed-out");
    expect(google.calls).toEqual([]);
  });
});

describe("the device copy", () => {
  it("opens instantly from the saved copy with no network call and no sign-in", async () => {
    const { google, store, log, make } = world();
    const first = make();
    await first.connect();
    await saved(first, january);
    const callsBefore = google.calls.length;
    const signInsBefore = log.signIns;
    const next = world({ google, store }).make();
    expect(next.state).toMatchObject({ mode: "device-copy", sheet: "unchecked" });
    expect(next.state.ledger.snapshots).toHaveLength(1);
    expect(google.calls.length).toBe(callsBefore);
    expect(log.signIns).toBe(signInsBefore);
  });

  it("keeps the copy current after every save, so a reload shows what was just saved", async () => {
    const { google, store, make } = world();
    const first = make();
    await first.connect();
    await saved(first, january);
    await saved(first, february);
    expect(world({ google, store }).make().state.ledger.snapshots).toHaveLength(2);
  });

  it("refresh confirms an unchanged copy without replacing it, and reports that nothing changed", async () => {
    const { log, make } = world();
    const first = make();
    await first.connect();
    await saved(first, january);
    const returning = make();
    const before = returning.state.ledger;
    log.clock += 60_000;
    expect(await returning.refresh()).toMatchObject({ status: "connected", changed: false, statements: 1 });
    expect(returning.state.mode).toBe("online");
    expect(returning.state.syncedAt).toBe(log.clock);
    expect(returning.state.ledger.revision).toBe(before.revision);
  });

  it("refresh picks up a statement saved on another device", async () => {
    const { google, make } = world();
    const phone = make();
    await phone.connect();
    await saved(phone, january);
    // A different device generates different ids, as real ones (random) would.
    let laptopIds = 0;
    const laptop = world({ google, store: memory() }).make({ newId: () => `laptop-${String(++laptopIds).padStart(6, "0")}` });
    await laptop.connect();
    expect((await saved(laptop, february)).status).toBe("recorded");
    expect(await phone.refresh()).toMatchObject({ status: "connected", changed: true, statements: 2 });
  });

  it("reuses one sign-in for a run of actions while the token is valid", async () => {
    const { log, make } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    await session.refresh();
    expect(log.signIns).toBe(1);
  });

  it("writes the readable tab after a save without letting its failure matter", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    google.faults.push({ match: /:clear$/u, status: 500 });
    expect((await saved(session, january)).status).toBe("recorded");
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    expect(google.tab(id, LEDGER_TAB)?.rows.length).toBeGreaterThan(1);
    expect(session.state.ledger.snapshots).toHaveLength(1);
    expect(google.tab(id, VIEW_TAB)).toBeDefined();
  });
});

describe("when the sheet and the device copy disagree, the copy is protected", () => {
  async function withCopy() {
    const w = world();
    const session = w.make();
    await session.connect();
    await saved(session, january);
    await saved(session, february);
    return { ...w, session };
  }

  it("a deleted sheet is reported, the copy is kept, and a confirmed restore re-creates it", async () => {
    const { google, session } = await withCopy();
    const id = session.state.workbook?.id ?? "";
    google.workbooks.delete(id);
    const outcome = await session.refresh();
    expect(outcome).toMatchObject({ status: "needs-attention", sheet: "missing" });
    expect(session.state.ledger.snapshots).toHaveLength(2);
    const restored = await session.restoreFromDevice();
    expect(restored.status).toBe("restored");
    expect(session.state).toMatchObject({ sheet: "ok", mode: "online" });
    expect(session.state.workbook?.id).not.toBe(id);
    expect(session.state.ledger.snapshots).toHaveLength(2);
  });

  it("an emptied sheet is reported, the copy is kept, and a restore refills that same sheet", async () => {
    const { google, session } = await withCopy();
    const id = session.state.workbook?.id ?? "";
    const tab = google.tab(id, LEDGER_TAB);
    if (tab !== undefined) tab.rows = tab.rows.slice(0, 1);
    expect(await session.refresh()).toMatchObject({ status: "needs-attention", sheet: "emptied" });
    expect(session.state.ledger.snapshots).toHaveLength(2);
    expect((await session.restoreFromDevice()).status).toBe("restored");
    expect(session.state.workbook?.id).toBe(id);
    expect(google.files.size).toBe(1);
  });

  it("a damaged sheet is never shown or copied over the saved copy", async () => {
    const { google, store, session } = await withCopy();
    const stored = store.data.get("foliodash.ledger.v1");
    const id = session.state.workbook?.id ?? "";
    const snapshot = (google.tab(id, LEDGER_TAB)?.rows ?? []).find((row) => row[1] === "SNAPSHOT");
    if (snapshot !== undefined) snapshot[2] = "{}";
    expect(await session.refresh()).toMatchObject({ status: "needs-attention", sheet: "damaged" });
    expect(store.data.get("foliodash.ledger.v1")).toBe(stored);
    expect(session.state.ledger.snapshots).toHaveLength(2);
  });

  it("will not restore when nothing is wrong, and has nothing to restore from an empty device", async () => {
    const { session } = await withCopy();
    expect((await session.restoreFromDevice()).status).toBe("not-needed");
    expect((await world().make().restoreFromDevice()).status).toBe("nothing-to-restore");
  });

  it("a network failure leaves the copy and the mode as they were", async () => {
    const { google, session } = await withCopy();
    google.faults.push({ match: /./u, network: true });
    expect(await session.refresh()).toMatchObject({ status: "call-failed", failure: "network" });
    expect(session.state.ledger.snapshots).toHaveLength(2);
  });
});

describe("saving through the session", () => {
  it("says plainly that nothing was saved when nobody is connected", async () => {
    const { make } = world();
    const session = make();
    expect(await saved(session, january)).toMatchObject({ status: "not-saved" });
  });

  it("a lost answer is unknown, the check finds the save, and saving again cannot duplicate it", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
    const request = { ...january };
    const id = session.save.newCommandId();
    expect((await session.save.record(request, id, "")).status).toBe("unknown");
    expect((await session.save.check(id)).status).toBe("recorded");
    expect((await session.save.record(request, id, "")).status).toBe("recorded");
    expect(session.state.ledger.snapshots).toHaveLength(1);
  });

  it("a check on a save that never happened says so", async () => {
    const { make } = world();
    const session = make();
    await session.connect();
    expect(await session.save.check("never-sent-id")).toEqual({ status: "not-recorded" });
  });
});

describe("forgetting this device", () => {
  it("wipes the copy, signs out and revokes the token, but leaves the spreadsheet in Google alone", async () => {
    const { google, store, log, make } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    const filesBefore = google.files.size;
    session.forget();
    expect(session.state).toMatchObject({ mode: "signed-out", workbook: null, syncedAt: null });
    expect(session.state.ledger.snapshots).toHaveLength(0);
    expect(store.data.size).toBe(0);
    expect(log.revoked).toEqual([google.token]);
    expect(google.files.size).toBe(filesBefore);
    expect(world({ google, store }).make().state.mode).toBe("signed-out");
  });

  it("tells listeners when the state changes", async () => {
    const { make } = world();
    const session = make();
    let notified = 0;
    const stop = session.subscribe(() => {
      notified++;
    });
    await session.connect();
    expect(notified).toBeGreaterThan(0);
    stop();
    const before = notified;
    session.forget();
    expect(notified).toBe(before);
  });
});

describe("the sheet keeps the bank statements, and can prove it", () => {
  /** The invented bank statement, read the way the import screen reads it, with the decisions made about it. */
  function withStatement(): RecordRequest {
    const sheet = syntheticSheet();
    const read = interpretStatement(sheet);
    if (!read.ok) throw new Error("setup failed");
    const commands: FundCommand[] = [ISIN_A, ISIN_B].map((isin) => ({ isin, action: "Start", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, openingNetInvested: cents(1000), comment: "" }));
    return { date: date("2026-01-31"), statement: read.statement, commands, source: { sheetName: "Il Mio Patrimonio", sheet } };
  }

  it("saves the statement with the month, writes a readable tab for it, and proves the ledger rebuilds from it", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    expect((await saved(session, withStatement())).status).toBe("recorded");
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    expect(google.tab(id, "Bank 2026-01-31")?.rows.length).toBeGreaterThan(5);
    expect(await session.verifyHistory()).toEqual({ status: "checked", report: { months: 1, matching: 1, withoutStatement: 0, differing: [], unreadable: [] } });
  });

  it("counts a month saved without its statement as exactly that, not as an error", async () => {
    const { make } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    expect(await session.verifyHistory()).toMatchObject({ status: "checked", report: { months: 1, matching: 0, withoutStatement: 1 } });
  });

  it("says plainly that a restored sheet holds the figures but not the statements", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    await saved(session, withStatement());
    google.workbooks.delete(session.state.workbook?.id ?? "");
    await session.refresh();
    expect((await session.restoreFromDevice()).status).toBe("restored");
    expect(await session.verifyHistory()).toMatchObject({ status: "checked", report: { months: 1, matching: 0, withoutStatement: 1 } });
  });

  it("reports a stored statement that was altered by hand, and changes nothing", async () => {
    const { google, store, make } = world();
    const session = make();
    await session.connect();
    await saved(session, withStatement());
    const before = store.data.get("foliodash.ledger.v1");
    const piece = (google.tab(session.state.workbook?.id ?? "", "_FolioDash ledger")?.rows ?? []).find((row) => row[1] === "SOURCE");
    if (piece !== undefined) piece[2] = String(piece[2]).replace("EXAMPLE", "EXAMPLX");
    expect(await session.verifyHistory()).toMatchObject({ status: "needs-attention" });
    expect(store.data.get("foliodash.ledger.v1")).toBe(before);
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
    const keeps = planImport(session.state.ledger, read(februarySheet())).map((row): FundCommand => ({ isin: row.isin, action: "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" }));
    await saved(session, { date: date("2026-02-28"), statement: read(februarySheet()), commands: keeps });
    const items: AttachItem[] = [
      { date: date("2026-01-31"), statement: read(januarySheet()), commands: OPENING, source: { sheetName: "Il Mio Patrimonio", sheet: januarySheet() } },
      { date: date("2026-02-28"), statement: read(februarySheet()), commands: keeps, source: { sheetName: "Il Mio Patrimonio", sheet: februarySheet() } },
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
    expect(await session.verifyHistory()).toEqual({ status: "checked", report: { months: 2, matching: 2, withoutStatement: 0, differing: [], unreadable: [] } });
  });

  it("refuses a statement for the wrong month and leaves the sheet as it was", async () => {
    const { google, session, items } = await twoMonthsWithoutStatements();
    const swapped: AttachItem[] = [{ ...(items[0] as AttachItem), source: (items[1] as AttachItem).source, statement: (items[1] as AttachItem).statement }];
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

describe("tidying the sheet", () => {
  it("rewrites every month's tab lean and typed, from the kept statements, leaving the records alone", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    const sheet = syntheticSheet();
    const read = interpretStatement(sheet);
    if (!read.ok) throw new Error("setup failed");
    await saved(session, { date: date("2026-01-31"), statement: read.statement, commands: OPENING, source: { sheetName: "S", sheet } });
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
    const patterns = (tab?.formats ?? []).flat().map((format) => (format?.["numberFormat"] as { pattern?: string } | undefined)?.pattern);
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
    expect((await saveExpense(google.client, google.token, id, { id: "expense", date: date("2023-11-13"), expectedRevision: null, amounts })).status).toBe("saved");
    const before = [LEDGER_TAB, EXPENSE_LOG_TITLE].map((title) => JSON.stringify(google.tab(id, title)?.rows));
    const count = google.workbooks.get(id)?.size;
    const batches = google.batches.length;
    for (let run = 0; run < 3; run++) expect((await session.tidySheet()).status).toBe("tidied");
    expect(google.batches.length - batches).toBe(3);
    expect(google.workbooks.get(id)?.size).toBe(count);
    expect([LEDGER_TAB, EXPENSE_LOG_TITLE].map((title) => JSON.stringify(google.tab(id, title)?.rows))).toEqual(before);
    expect(google.tab(id, EXPENSE_VIEW_TITLE)?.rows.flat()).toContain("Work expenses");
    expect(google.tab(id, EXPENSE_LOG_TITLE)?.hidden).toBe(true);
    expect([...google.workbooks.get(id)?.keys() ?? []]).toEqual([VIEW_TAB, EXPENSE_VIEW_TITLE, LEDGER_TAB, EXPENSE_LOG_TITLE]);
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
    await saveExpense(google.client, google.token, id, { id: "expense", date: date("2023-11-13"), expectedRevision: null, amounts });
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
    await saved(session, { date: date("2026-01-31"), statement: read.statement, commands: OPENING, source: { sheetName: "S", sheet } });
    await session.idle();
    google.faults.push({ match: /:batchUpdate$/u, status: 503 });
    expect((await session.tidySheet()).status).toBe("failed");
  });
});

describe("automatic spreadsheet organization", () => {
  it("upgrades on connection once, persists the version, and avoids repeated rebuilds", async () => {
    const { google, make, log } = world();
    const session = make();
    await session.connect();
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    expect(google.spreadsheetMetadata.get(id)).toContainEqual(expect.objectContaining({ metadataKey: ORGANIZATION_METADATA_KEY, metadataValue: ORGANIZATION_VERSION }));
    expect(session.state.organization?.status).toBe("current");
    const batches = google.batches.length;
    await session.refresh();
    await session.idle();
    expect(google.batches.length).toBe(batches);
    const returning = make();
    await returning.connect();
    await returning.idle();
    expect(google.batches.filter((batch) => batch.some((request) => request["updateCells"] !== undefined))).toHaveLength(1);
    const signIns = log.signIns;
    log.clock += 31_000;
    await returning.refreshIfNeeded();
    await returning.idle();
    expect(log.signIns).toBe(signIns);
  });

  it("automatically consolidates existing Bank copies from retained sources during a layout upgrade", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    const sheet = syntheticSheet();
    const interpreted = interpretStatement(sheet);
    if (!interpreted.ok) throw new Error("setup failed");
    await saved(session, { date: date("2026-01-31"), statement: interpreted.statement, commands: OPENING, source: { sheetName: "S", sheet } });
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    const title = "Bank 2026-01-31";
    const original = google.tab(id, title);
    const tabs = google.workbooks.get(id);
    if (original === undefined || tabs === undefined) throw new Error("setup failed");
    tabs.set(`${title} (2)`, { ...original, id: 2000, developerMetadata: original.developerMetadata.map((marker) => ({ ...marker, location: { sheetId: 2000 } })) });
    original.developerMetadata = [];
    // The legacy original still contains the bank's raw strings and padding.
    original.rows = rawGrid(sheet).cells.map((row) => row.map((cell) => cell.value));
    const records = JSON.stringify(google.tab(id, LEDGER_TAB)?.rows);
    const guards = [...google.namedRanges.get(id) ?? []];
    google.spreadsheetMetadata.set(id, []);
    const returning = make();
    await returning.connect();
    await returning.idle();
    expect(tabs.has(`${title} (2)`)).toBe(false);
    expect(google.tab(id, title)?.id).toBe(original.id);
    expect(JSON.stringify(google.tab(id, LEDGER_TAB)?.rows)).toBe(records);
    expect([...google.namedRanges.get(id) ?? []]).toEqual(guards);
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
    expect((await session.expenses.save({ date: date("2023-11-13"), amounts, expectedRevision: null })).status).toBe("saved");
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
    const session = make({ rest: async (request) => {
      if (hold && request.method === "POST" && request.body?.includes(ORGANIZATION_METADATA_KEY)) {
        await new Promise<void>((resolve) => { release = resolve; });
      }
      return google.client(request);
    } });
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
    expect((await session.expenses.save({ date: date("2023-11-14"), amounts: second, expectedRevision: null })).status).toBe("saved");
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

describe("the readable tabs and summary are written once after a run of saves", () => {
  it("two saves in a row write both monthly tabs and the summary together, in one batch, not once per save", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    const first = interpretStatement(januarySheet());
    const second = interpretStatement(februarySheet());
    if (!first.ok || !second.ok) throw new Error("setup failed");
    await saved(session, { date: date("2026-01-31"), statement: first.statement, commands: OPENING, source: { sheetName: "S", sheet: januarySheet() } });
    const keeps = planImport(session.state.ledger, second.statement).map((row): FundCommand => ({ isin: row.isin, action: "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" }));
    await saved(session, { date: date("2026-02-28"), statement: second.statement, commands: keeps, source: { sheetName: "S", sheet: februarySheet() } });
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    // Both months and the summary share one batch after the run of saves.
    expect(google.batches.filter((batch) => batch.some((request) => request["updateCells"] !== undefined))).toHaveLength(1);
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
    await saved(session, { date: date("2026-01-31"), statement: read.statement, commands: OPENING, source: { sheetName: "S", sheet } });
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    expect(google.tab(id, "Bank 2026-01-31")?.rows ?? []).toHaveLength(0);
    await session.idle();
    expect(google.tab(id, "Bank 2026-01-31")?.rows.length).toBeGreaterThan(5);
  });
});


describe("connection authentication resilience", () => {
  it("shares concurrent connection attempts and creates only one workbook", async () => {
    const { make, google, log } = world();
    const session = make();
    const outcomes = await Promise.all([session.connect(), session.connect(), session.refresh()]);
    expect(outcomes.every((outcome) => outcome.status === "connected")).toBe(true);
    expect(log.signIns).toBe(1);
    expect(google.files.size).toBe(1);
  });

  it("shares one renewal across simultaneous actions after expiry", async () => {
    const { make, log } = world();
    const session = make();
    await session.connect();
    log.clock += 3_600_000;
    await Promise.all([session.refresh(), session.verifyHistory()]);
    expect(log.signIns).toBe(2);
  });

  it("drops a rejected token and renews on the next user action without replaying the failed call", async () => {
    const { make, log, google } = world();
    const session = make();
    await session.connect();
    await session.idle();
    google.faults.push({ match: /./u, status: 401 });
    expect(await session.refresh()).toMatchObject({ status: "call-failed", failure: "unauthorised" });
    expect(log.signIns).toBe(1);
    expect(await session.refresh()).toMatchObject({ status: "connected" });
    expect(log.signIns).toBe(2);
  });

  it("explicitly reconnects with another account without deleting either saved copy", async () => {
    const { make, google, store, log } = world();
    const storage = memory();
    const googleSession = createGoogleSessionStore(() => storage);
    const initial = make({ googleSession });
    await initial.connect();
    await saved(initial, january);
    await initial.idle();
    const cached = store.data.get("foliodash.ledger.v1");
    const calls = google.calls.length;
    let selectedAccount = false;
    const reloaded = make({ googleSession, signIn: (_client, _scope, options) => {
      log.signIns++;
      selectedAccount = options?.prompt === "select_account";
      // Reconnection removes access only, before requesting its replacement.
      expect(storage.data.size).toBe(0);
      expect(store.data.get("foliodash.ledger.v1")).toBe(cached);
      return Promise.resolve({ ok: true, accessToken: google.token, expiresInSeconds: 3600 });
    } });
    expect(await reloaded.reconnect({ differentAccount: true })).toMatchObject({ status: "connected" });
    expect(selectedAccount).toBe(true);
    expect(log.signIns).toBe(2);
    expect(reloaded.state.ledger.snapshots).toHaveLength(1);
    expect(google.files.size).toBe(1);
    expect(storage.data.size).toBe(1);
    expect(google.calls.slice(calls).some(call => call === "POST /v4/spreadsheets")).toBe(false);
    await reloaded.idle();
  });

  it("retains the workbook and saved history if explicit reconnection is cancelled", async () => {
    const { make, store, google } = world();
    const initial = make();
    await initial.connect();
    await saved(initial, january);
    await initial.idle();
    const cached = store.data.get("foliodash.ledger.v1");
    const calls = google.calls.length;
    const session = make({ signIn: () => Promise.resolve({ ok: false, reason: "closed" }) });
    expect(await session.reconnect()).toEqual({ status: "sign-in-failed", reason: "closed" });
    expect(store.data.get("foliodash.ledger.v1")).toBe(cached);
    expect(session.state.ledger.snapshots).toHaveLength(1);
    expect(session.state.workbook).toEqual(initial.state.workbook);
    expect(google.calls).toHaveLength(calls);
  });

  it("survives a throwing sign-in provider and allows another attempt", async () => {
    const { make } = world();
    let attempts = 0;
    const session = make({ signIn: () => {
      attempts++;
      if (attempts === 1) throw new Error("unavailable");
      return Promise.resolve({ ok: false, reason: "closed" });
    } });
    expect(await session.connect()).toEqual({ status: "sign-in-failed", reason: "unavailable" });
    expect(await session.connect()).toEqual({ status: "sign-in-failed", reason: "closed" });
  });

  it("does not accept a sign-in that completes after forgetting the device", async () => {
    const { make } = world();
    let complete: ((result: SignInResult) => void) | undefined;
    const session = make({ signIn: () => new Promise((resolve) => { complete = resolve; }) });
    const connection = session.connect();
    session.forget();
    complete?.({ ok: true, accessToken: "synthetic-token", expiresInSeconds: 3600 });
    expect(await connection).toEqual({ status: "sign-in-failed", reason: "closed" });
    expect(session.state.mode).toBe("signed-out");
  });
});


describe("persistent Google access and two-device freshness", () => {
  it("reuses the tab session after reload and refreshes another device's saved history without signing in", async () => {
    const { make, google, log } = world();
    const storage = memory();
    const googleSession = createGoogleSessionStore(() => storage);
    const phone = make({ googleSession });
    await phone.connect();
    await saved(phone, january);
    await phone.idle();
    const laptopWorld = world({ google, store: memory() });
    const laptop = laptopWorld.make({ newId: () => `laptop-${String(++laptopWorld.log.ids).padStart(6, "0")}` });
    await laptop.connect();
    expect((await saved(laptop, february)).status).toBe("recorded");
    const reloaded = make({ googleSession });
    expect(reloaded.state.ledger.snapshots).toHaveLength(1);
    await reloaded.refreshIfNeeded();
    expect(reloaded.state.ledger.snapshots).toHaveLength(2);
    expect(reloaded.state.connection).toBe("connected");
    expect(log.signIns).toBe(1);
  });

  it("throttles repeated foreground events and never opens sign-in when access expires", async () => {
    const { make, google, log } = world();
    const session = make();
    await session.connect();
    await session.idle();
    await session.refreshIfNeeded();
    const calls = google.calls.length;
    await Promise.all([session.refreshIfNeeded(), session.refreshIfNeeded()]);
    expect(google.calls).toHaveLength(calls);
    log.clock += 3_600_000;
    await session.refreshIfNeeded();
    expect(session.state.connection).toBe("waiting");
    expect(log.signIns).toBe(1);
  });

  it("clears persisted access on rejection and forgetting, while preserving the workbook", async () => {
    const { make, google } = world();
    const storage = memory();
    const googleSession = createGoogleSessionStore(() => storage);
    const session = make({ googleSession });
    await session.connect();
    await session.idle();
    expect(storage.data.size).toBe(1);
    google.faults.push({ match: /./u, status: 401 });
    await session.refreshIfNeeded();
    expect(storage.data.size).toBe(0);
    expect(session.state.connection).toBe("waiting");
    await session.refresh();
    expect(storage.data.size).toBe(1);
    session.forget();
    expect(storage.data.size).toBe(0);
    expect(google.files.size).toBe(1);
  });

  it("keeps a checked device copy after a failed background check", async () => {
    const { make, google } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    await session.idle();
    google.faults.push({ match: /./u, network: true });
    await session.refreshIfNeeded();
    expect(session.state.connection).toBe("offline");
    expect(session.state.ledger.snapshots).toHaveLength(1);
  });
});

describe("out-of-order Google reads", () => {
  it("does not misreport a successful manual read as rejected sign-in when a newer background check wins", async () => {
    const { google, make } = world();
    let delayNext = false;
    let entered: (() => void) | undefined;
    let release: (() => void) | undefined;
    const reading = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const session = make({ rest: async request => {
      const response = await google.client(request);
      if (delayNext && request.method === "GET" && request.url.includes("/values/")) {
        delayNext = false;
        entered?.();
        await gate;
      }
      return response;
    } });
    await session.connect();
    await session.idle();
    delayNext = true;
    const manual = session.refresh();
    await reading;
    await session.refreshIfNeeded();
    release?.();
    expect(await manual).toEqual({ status: "superseded" });
    expect(session.state.connection).toBe("connected");
  });

  it("does not let an older background response replace a newer manual refresh", async () => {
    const { google, make } = world();
    let delayNext = false;
    let entered: (() => void) | undefined;
    let release: (() => void) | undefined;
    const reading = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const session = make({ rest: async (request) => {
      const response = await google.client(request);
      if (delayNext && request.method === "GET" && request.url.includes("/values/")) {
        delayNext = false;
        entered?.();
        await gate;
      }
      return response;
    } });
    await session.connect();
    await saved(session, january);
    await session.idle();
    delayNext = true;
    const background = session.refreshIfNeeded();
    await reading;
    const other = world({ google, store: memory() });
    const laptop = other.make({ newId: () => `laptop-${String(++other.log.ids).padStart(6, "0")}` });
    await laptop.connect();
    expect((await saved(laptop, february)).status).toBe("recorded");
    expect((await session.refresh()).status).toBe("connected");
    release?.();
    await background;
    expect(session.state.ledger.snapshots).toHaveLength(2);
    expect(session.state.connection).toBe("connected");
  });
});


describe("a remembered connection that stays connected", () => {
  const TOKEN_KEY = "foliodash.google-session.v1";
  const HOUR = 3_600_000;

  /** A browser's kept state: what survives closing the app. */
  function browser() {
    const w = world();
    const storage = memory();
    const googleSession = createGoogleSessionStore(() => storage);
    const accountHint = createAccountHintStore(() => storage, "hint");
    const asked: (SignInOptions | undefined)[] = [];
    const answering = (answer: (index: number) => SignInResult) => (_client: string, _scope: string, options?: SignInOptions): Promise<SignInResult> => {
      w.log.signIns++;
      asked.push(options);
      return Promise.resolve(answer(asked.length - 1));
    };
    const granted = (): SignInResult => ({ ok: true, accessToken: w.google.token, expiresInSeconds: 3600 });
    return { ...w, storage, googleSession, accountHint, asked, answering, granted };
  }

  async function connectedWithHistory(b: ReturnType<typeof browser>) {
    const first = b.make({ googleSession: b.googleSession, accountHint: b.accountHint });
    await first.connect();
    await saved(first, january);
    await first.idle();
    return first;
  }

  it("renews quietly on the next click after a restart, naming the remembered account, with no chooser and no new workbook", async () => {
    const b = browser();
    await connectedWithHistory(b);
    expect(b.storage.data.get("hint")).toContain("person@example.test");
    b.log.clock += 2 * HOUR;
    const reopened = b.make({ googleSession: b.googleSession, accountHint: b.accountHint, signIn: b.answering(b.granted) });
    // The saved copy opens at once, and the connection says what the next tap will do.
    expect(reopened.state).toMatchObject({ mode: "device-copy", connection: "waiting" });
    expect(reopened.state.ledger.snapshots).toHaveLength(1);
    expect(reopened.needsRenewal()).toBe(true);
    const calls = b.google.calls.length;
    expect(await reopened.renewFromGesture({ sync: true })).toBe(true);
    expect(b.asked).toEqual([{ prompt: "", loginHint: "person@example.test" }]);
    expect(reopened.state).toMatchObject({ mode: "online", connection: "connected" });
    expect(b.google.calls.slice(calls).includes("POST /v4/spreadsheets")).toBe(false);
    expect(b.storage.data.has(TOKEN_KEY)).toBe(true);
    await reopened.idle();
  });

  it("reuses unexpired access across a restart without asking Google at all", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.log.clock += 5 * 60_000;
    const reopened = b.make({ googleSession: b.googleSession, accountHint: b.accountHint, signIn: b.answering(b.granted) });
    expect(reopened.needsRenewal()).toBe(false);
    await reopened.refreshIfNeeded();
    expect(reopened.state).toMatchObject({ mode: "online", connection: "connected" });
    expect(b.asked).toHaveLength(0);
  });

  it("renews ahead of expiry on a click, leaving the working connection undisturbed", async () => {
    const b = browser();
    let finish: ((result: SignInResult) => void) | undefined;
    let gate: Promise<SignInResult> | null = null;
    const session = b.make({ signIn: () => { b.log.signIns++; return gate ?? Promise.resolve(b.granted()); } });
    await session.connect();
    await session.idle();
    // Six minutes of access left: inside the ten-minute window, outside the eight needed to save.
    b.log.clock += 3_480_000 - 360_000;
    expect(session.needsRenewal()).toBe(true);
    gate = new Promise((resolve) => { finish = resolve; });
    const renewing = session.renewFromGesture({ sync: false });
    expect(session.state.connection).toBe("connected");
    expect(session.needsRenewal()).toBe(false);
    finish?.(b.granted());
    expect(await renewing).toBe(true);
    expect(b.log.signIns).toBe(2);
    expect(session.needsRenewal()).toBe(false);
  });

  it("does nothing when signed out, mid-connection or when access is plentiful", async () => {
    const b = browser();
    const fresh = b.make({ signIn: b.answering(b.granted) });
    expect(fresh.needsRenewal()).toBe(false);
    expect(await fresh.renewFromGesture({ sync: true })).toBe(false);
    await fresh.connect();
    expect(fresh.needsRenewal()).toBe(false);
    expect(b.asked).toHaveLength(1);
  });

  it("gives up quiet renewal after two closed windows with a pause between, then lets the person choose an account on request", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.log.clock += 2 * HOUR;
    const reopened = b.make({ googleSession: b.googleSession, accountHint: b.accountHint, signIn: b.answering(() => ({ ok: false, reason: "closed" })) });
    expect(await reopened.renewFromGesture({ sync: true })).toBe(false);
    expect(reopened.state.connection).toBe("waiting");
    expect(reopened.needsRenewal()).toBe(false);
    b.log.clock += 31_000;
    expect(reopened.needsRenewal()).toBe(true);
    expect(await reopened.renewFromGesture({ sync: true })).toBe(false);
    expect(reopened.state.connection).toBe("reconnect");
    b.log.clock += 3 * HOUR;
    expect(reopened.needsRenewal()).toBe(false);
    await reopened.reconnect();
    expect(b.asked.map((options) => options?.prompt)).toEqual(["", "", "select_account"]);
    expect(b.asked[0]).toEqual({ prompt: "", loginHint: "person@example.test" });
  });

  it("stops quiet attempts at once when the browser blocked Google's window", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.log.clock += 2 * HOUR;
    const reopened = b.make({ googleSession: b.googleSession, accountHint: b.accountHint, signIn: b.answering(() => ({ ok: false, reason: "blocked" })) });
    expect(await reopened.renewFromGesture({ sync: true })).toBe(false);
    expect(reopened.state.connection).toBe("reconnect");
    expect(reopened.needsRenewal()).toBe(false);
    expect(reopened.state.ledger.snapshots).toHaveLength(1);
  });

  it("forgives a failure that was only the network once it is back", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.log.clock += 2 * HOUR;
    const reopened = b.make({ googleSession: b.googleSession, signIn: b.answering(() => ({ ok: false, reason: "unavailable" })) });
    await reopened.renewFromGesture({ sync: true });
    b.log.clock += 31_000;
    await reopened.renewFromGesture({ sync: true });
    expect(reopened.state.connection).toBe("reconnect");
    reopened.resumeRenewal();
    expect(reopened.needsRenewal()).toBe(true);
  });

  it("learns the account from a chooser sign-in, so later renewals name it", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.google.account = "other@example.test";
    const session = b.make({ googleSession: b.googleSession, accountHint: b.accountHint, signIn: b.answering(b.granted) });
    await session.reconnect({ differentAccount: true });
    await session.idle();
    expect(b.asked[0]).toEqual({ prompt: "select_account" });
    expect(b.storage.data.get("hint")).toContain("other@example.test");
  });

  it("never lets a save straddle expiry: it renews first, and refuses to start if the replacement fails", async () => {
    const b = browser();
    const session = b.make({ googleSession: b.googleSession, signIn: b.answering(b.granted) });
    await session.connect();
    await saved(session, january);
    await session.idle();
    // Five minutes left: fine for a read, too little for a save.
    b.log.clock += 3_480_000 - 300_000;
    expect((await saved(session, february)).status).toBe("recorded");
    expect(b.asked).toHaveLength(2);

    b.log.clock += 3_480_000 - 300_000;
    const calls = b.google.calls.length;
    const refusing = b.make({ googleSession: b.googleSession, signIn: b.answering(() => ({ ok: false, reason: "closed" })) });
    expect(refusing.state.ledger.snapshots).toHaveLength(2);
    const march: RecordRequest = { date: date("2026-03-31"), statement: statement(1200), commands: [keep] };
    const refused = await saved(refusing, march);
    expect(refused.status).toBe("not-saved");
    expect(refused.status === "not-saved" ? refused.message : "").toContain("nothing was saved");
    expect(b.google.calls).toHaveLength(calls);
    // The access that is still valid keeps serving reads.
    expect(await refusing.refresh()).toMatchObject({ status: "connected" });
  });

  it("a rejected token does not erase newer access another window stored", async () => {
    const b = browser();
    const session = await connectedWithHistory(b);
    b.google.faults.push({ match: /./u, status: 401 });
    const newer = { clientId: "client", workbookId: session.state.workbook?.id ?? "", scope: "https://www.googleapis.com/auth/drive.file", accessToken: "newer-token", validUntil: b.log.clock + 3_000_000 };
    b.googleSession.save(newer);
    await session.refresh();
    expect(b.googleSession.load("client", newer.workbookId, b.log.clock)).toEqual(newer);
  });

  it("adopts newer access stored by another window of the same browser", async () => {
    const b = browser();
    const session = await connectedWithHistory(b);
    b.log.clock += 2 * HOUR;
    const reopened = b.make({ googleSession: b.googleSession, signIn: b.answering(b.granted) });
    expect(reopened.state.connection).toBe("waiting");
    expect(reopened.adoptStoredAccess()).toBe(false);
    b.googleSession.save({ clientId: "client", workbookId: session.state.workbook?.id ?? "", scope: "https://www.googleapis.com/auth/drive.file", accessToken: b.google.token, validUntil: b.log.clock + 3_000_000 });
    expect(reopened.adoptStoredAccess()).toBe(true);
    expect(reopened.state.connection).toBeUndefined();
    expect(reopened.adoptStoredAccess()).toBe(false);
    await reopened.refreshIfNeeded();
    expect(reopened.state).toMatchObject({ mode: "online", connection: "connected" });
    expect(b.asked).toHaveLength(0);
  });

  it("leaves automatic renewal to the window already asking Google, but never holds back what the person chose", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.log.clock += 2 * HOUR;
    let elsewhere = true;
    const events: string[] = [];
    const coordination: RenewalCoordination = { heldElsewhere: () => elsewhere, claim: () => { events.push("claim"); }, release: () => { events.push("release"); }, announceForgotten: () => { events.push("forgotten"); } };
    const reopened = b.make({ googleSession: b.googleSession, coordination, signIn: b.answering(b.granted) });
    expect(reopened.needsRenewal()).toBe(false);
    expect(await reopened.renewFromGesture({ sync: true })).toBe(false);
    expect(b.asked).toHaveLength(0);
    expect(await reopened.refresh()).toMatchObject({ status: "connected" });
    expect(events).toEqual(["claim", "release"]);
    elsewhere = false;
  });

  it("announces a forgotten device, and a device forgotten elsewhere is dropped without revoking or announcing again", async () => {
    const b = browser();
    await connectedWithHistory(b);
    const events: string[] = [];
    const coordination: RenewalCoordination = { heldElsewhere: () => false, claim: () => undefined, release: () => undefined, announceForgotten: () => { events.push("forgotten"); } };
    const here = b.make({ googleSession: b.googleSession, accountHint: b.accountHint, coordination });
    await here.refresh();
    here.forget();
    expect(events).toEqual(["forgotten"]);
    expect(b.log.revoked).toHaveLength(1);
    expect(b.storage.data.has("hint")).toBe(false);

    const other = await connectedWithHistory(browser());
    other.forgetFromElsewhere();
    expect(other.state.mode).toBe("signed-out");
  });

  it("does not revoke access or announce when a device is forgotten from another window", async () => {
    const b = browser();
    const events: string[] = [];
    const coordination: RenewalCoordination = { heldElsewhere: () => false, claim: () => undefined, release: () => undefined, announceForgotten: () => { events.push("forgotten"); } };
    const session = b.make({ googleSession: b.googleSession, accountHint: b.accountHint, coordination });
    await session.connect();
    await session.idle();
    session.forgetFromElsewhere();
    expect(events).toEqual([]);
    expect(b.log.revoked).toEqual([]);
    expect(b.storage.data.size).toBe(0);
    expect(session.state.mode).toBe("signed-out");
  });
});
