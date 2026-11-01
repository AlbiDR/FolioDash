import { describe, expect, it } from "vitest";
import { OPENING, date, februarySheet, interpret, januarySheet, twoSavedMonths } from "../../tests/fixtures/SavedMonths";
import { type AttachItem, type AttachRequest, attachStatements } from "./LedgerService";
import { verifyRebuild } from "./Rebuild";

function itemFor(which: "january" | "february", keeps: AttachItem["commands"]): AttachItem {
  const sheet = which === "january" ? januarySheet() : februarySheet();
  const read = interpret(sheet);
  if (!read.ok) throw new Error("setup failed");
  return {
    date: date(which === "january" ? "2026-01-31" : "2026-02-28"),
    statement: read.statement,
    commands: which === "january" ? OPENING : keeps,
    source: { sheetName: "Il Mio Patrimonio", sheet },
  };
}

function setup(withStatements: boolean) {
  const saved = twoSavedMonths(withStatements);
  const request = (items: readonly AttachItem[], overrides: Partial<AttachRequest> = {}): AttachRequest => ({
    commandId: "attach-0001",
    expectedRevision: saved.ledger.revision,
    items,
    ...overrides,
  });
  const both = [itemFor("january", saved.keeps), itemFor("february", saved.keeps)];
  return { ...saved, request, both };
}

const count = (rows: readonly { readonly type: string }[], type: string): number => rows.filter((row) => row.type === type).length;

describe("attachStatements: statements for months that are already saved", () => {
  it("adds every statement in one new revision, leaving the saved figures exactly as they were", () => {
    const { sheet, store, environment, ledger, request, both } = setup(false);
    const snapshotsBefore = count(sheet.rows, "SNAPSHOT");
    const commitsBefore = count(sheet.rows, "COMMIT");
    const outcome = attachStatements(environment, request(both));
    expect(outcome).toMatchObject({ status: "attached", count: 2 });
    const after = store.load();
    expect(after.status === "ok" && after.state.snapshots).toEqual(ledger.snapshots);
    expect(after.status === "ok" && after.state.revision).not.toBe(ledger.revision);
    expect(count(sheet.rows, "COMMIT")).toBe(commitsBefore + 1);
    // The saved months are referenced, not written again.
    expect(count(sheet.rows, "SNAPSHOT")).toBe(snapshotsBefore);
    const sources = store.loadSources();
    expect(sources.status === "ok" && sources.sources.map((source) => source.date)).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("makes the history rebuildable: every month then replays to its saved figures", () => {
    const { store, environment, request, both } = setup(false);
    const before = store.load();
    const sourcesBefore = store.loadSources();
    if (before.status !== "ok" || sourcesBefore.status !== "ok") throw new Error("setup failed");
    expect(verifyRebuild(before.state, sourcesBefore.sources, interpret)).toMatchObject({ matching: 0, withoutStatement: 2 });
    attachStatements(environment, request(both));
    const after = store.load();
    const sources = store.loadSources();
    if (after.status !== "ok" || sources.status !== "ok") throw new Error("setup failed");
    expect(verifyRebuild(after.state, sources.sources, interpret)).toEqual({ months: 2, matching: 2, withoutStatement: 0, differing: [], unreadable: [] });
  });

  it("records the same action once, and refuses the same id for different content", () => {
    const { sheet, environment, request, both } = setup(false);
    expect(attachStatements(environment, request(both)).status).toBe("attached");
    const rows = sheet.rows.length;
    expect(attachStatements(environment, request(both)).status).toBe("already-attached");
    expect(sheet.rows.length).toBe(rows);
    expect(attachStatements(environment, request([both[0] as AttachItem])).status).toBe("rejected");
  });

  it("refuses a statement that does not produce the figures already saved for that month, and writes nothing", () => {
    const { sheet, environment, request, keeps } = setup(false);
    const wrong: AttachItem = { ...itemFor("february", keeps), date: date("2026-01-31"), commands: OPENING };
    const rows = sheet.rows.length;
    const outcome = attachStatements(environment, request([wrong]));
    expect(outcome).toMatchObject({ status: "rejected" });
    expect(outcome.status === "rejected" && outcome.messages[0]).toContain("does not produce the figures");
    expect(sheet.rows.length).toBe(rows);
  });

  it("attaches all or none: one bad statement refuses the whole request", () => {
    const { store, environment, request, keeps } = setup(false);
    const bad: AttachItem = { ...itemFor("february", keeps), commands: OPENING };
    expect(attachStatements(environment, request([itemFor("january", keeps), bad])).status).toBe("rejected");
    const sources = store.loadSources();
    expect(sources.status === "ok" && sources.sources).toEqual([]);
  });

  it("refuses a month that already has its statement, and a month that was never saved", () => {
    const withStatements = setup(true);
    const again = attachStatements(withStatements.environment, withStatements.request([itemFor("january", withStatements.keeps)]));
    expect(again.status === "rejected" && again.messages[0]).toContain("already has its bank statement");
    const none = setup(false);
    const unknownMonth: AttachItem = { ...itemFor("january", none.keeps), date: date("2026-03-31") };
    const outcome = attachStatements(none.environment, none.request([unknownMonth]));
    expect(outcome.status === "rejected" && outcome.messages[0]).toContain("no month is saved");
  });

  it("refuses a review made against an older revision, an empty request, and a damaged ledger", () => {
    const stale = setup(false);
    expect(attachStatements(stale.environment, stale.request(stale.both, { expectedRevision: "an-older-revision" })).status).toBe("stale");
    expect(attachStatements(stale.environment, stale.request([])).status).toBe("rejected");
    const damaged = setup(false);
    const snapshot = damaged.sheet.rows.findIndex((row) => row.type === "SNAPSHOT");
    const row = damaged.sheet.rows[snapshot];
    if (row !== undefined) damaged.sheet.rows[snapshot] = { ...row, payload: "{}" };
    expect(attachStatements(damaged.environment, damaged.request(damaged.both)).status).toBe("damaged");
  });
});
