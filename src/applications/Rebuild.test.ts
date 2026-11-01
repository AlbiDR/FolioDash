import { describe, expect, it } from "vitest";
import { cents, interpret, twoSavedMonths } from "../../tests/fixtures/SavedMonths";
import { rebuildLedger, verifyRebuild } from "./Rebuild";

describe("verifyRebuild", () => {
  it("confirms every month rebuilds exactly from its stored statement and decisions", () => {
    const { ledger, sources } = twoSavedMonths();
    expect(verifyRebuild(ledger, sources, interpret)).toEqual({ months: 2, matching: 2, withoutStatement: 0, differing: [], unreadable: [] });
  });

  it("counts months saved before statements were kept, rather than calling them wrong", () => {
    const { ledger } = twoSavedMonths(false);
    expect(verifyRebuild(ledger, [], interpret)).toEqual({ months: 2, matching: 0, withoutStatement: 2, differing: [], unreadable: [] });
  });

  it("flags a month whose saved figures no longer match what its statement produces", () => {
    const { ledger, sources } = twoSavedMonths();
    const tampered = { ...ledger, snapshots: ledger.snapshots.map((snapshot, index) => (index === 1 ? { ...snapshot, fundsSubtotal: cents(1) } : snapshot)) };
    const report = verifyRebuild(tampered, sources, interpret);
    expect(report.differing).toEqual(["2026-02-28"]);
    expect(report.matching).toBe(1);
  });

  it("flags a stored statement that can no longer be read, without hiding the other months", () => {
    const { ledger, sources } = twoSavedMonths();
    const broken = sources.map((source, index) => (index === 0 ? { ...source, sheet: { date1904: false, rows: [] } } : source));
    const report = verifyRebuild(ledger, broken, interpret);
    expect(report.unreadable).toEqual(["2026-01-31"]);
    expect(report.matching).toBe(1);
  });

  it("checks one month even when an earlier month has no statement", () => {
    const { ledger, sources } = twoSavedMonths();
    const report = verifyRebuild(ledger, sources.slice(1), interpret);
    expect(report).toMatchObject({ months: 2, matching: 1, withoutStatement: 1 });
  });
});

describe("rebuildLedger: the sheet is complete", () => {
  it("re-creates the whole ledger from nothing but the stored statements and decisions", () => {
    const { ledger, sources } = twoSavedMonths();
    let counter = 0;
    const rebuilt = rebuildLedger(sources, interpret, () => `rebuild-${String(++counter)}`);
    expect(rebuilt.status).toBe("rebuilt");
    if (rebuilt.status !== "rebuilt") return;
    expect(rebuilt.ledger.snapshots).toEqual(ledger.snapshots);
    expect(rebuilt.ledger.funds.map((fund) => fund.isin)).toEqual(ledger.funds.map((fund) => fund.isin));
  });

  it("stops and names the month when a statement cannot be rebuilt", () => {
    const { sources } = twoSavedMonths();
    const broken = sources.map((source, index) => (index === 1 ? { ...source, sheet: { date1904: false, rows: [] } } : source));
    const result = rebuildLedger(broken, interpret, () => "r");
    expect(result).toMatchObject({ status: "failed", date: "2026-02-28" });
  });
});
