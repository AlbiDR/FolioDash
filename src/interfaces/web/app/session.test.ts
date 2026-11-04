import type { SignInResult } from "../../../applications/SessionModel";
import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../../tests/fixtures/FakeGoogle";
import { OPENING, februarySheet, januarySheet } from "../../../../tests/fixtures/SavedMonths";
import { ISIN_A, ISIN_B, syntheticSheet } from "../../../../tests/fixtures/SyntheticFideuramSheet";
import type { AttachItem } from "../../../applications/LedgerService";
import { planImport } from "../../../core/ImportPlan";
import { LEDGER_TAB, VIEW_TAB } from "../../../adapters/google/SheetsLayout";
import type { FundCommand, StatementInput } from "../../../core/ImportPlan";
import { type IsoDate, parseIsoDate } from "../../../core/IsoDate";
import { parseIsin } from "../../../core/Isin";
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
    google.faults.push({ match: /:append$/u, network: true, applyFirst: true });
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
    const appends = google.callsMatching(/:append$/u).length;
    const result = await session.save.attach(items, session.save.newCommandId(), session.state.ledger.revision);
    expect(result.status).toBe("recorded");
    expect(google.callsMatching(/:append$/u)).toHaveLength(appends + 1);
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
    google.faults.push({ match: /:append$/u, network: true, applyFirst: true });
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

  it("changes nothing and says so when Google refuses", async () => {
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
    // One batch for both months and one for the summary: never one per save.
    expect(google.callsMatching(/:batchUpdate$/u)).toHaveLength(2);
    expect(google.tab(id, "Bank 2026-01-31")?.rows.length).toBeGreaterThan(5);
    expect(google.tab(id, "Bank 2026-02-28")?.rows.length).toBeGreaterThan(5);
  });

  it("keeps what could not be written, and writes it at the next chance", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    // Google refuses both the summary's batch and the months' batch.
    google.faults.push({ match: /:batchUpdate$/u, status: 429 }, { match: /:batchUpdate$/u, status: 429 });
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
