import { describe, expect, it } from "vitest";
import { date, interpret, januarySheet, OPENING, twoSavedMonths } from "../../tests/fixtures/SavedMonths";
import { toEuroCents, ZERO_CENTS } from "../core/Money";
import { applyImport, type FundCommand, type StatementInput } from "../core/ImportPlan";
import { EMPTY_LEDGER } from "../core/Ledger";
import { toStoredSheet, type RawSheet } from "../core/RawSheet";
import { prepareBackfillReview } from "./BackfillReview";

describe("reviewing an earlier history", () => {
  it("updates the former opening source decisions and replays both bank sources", () => {
    const { ledger, sources } = twoSavedMonths();
    const read = interpret(januarySheet());
    if (!read.ok) throw new Error("unreadable fixture");
    const boundary = OPENING.map(item => ({ ...item, action: "Keep" as const, moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS }));
    const earlier = [{ date: date("2025-12-31"), statement: read.statement, commands: OPENING, source: { sheetName: "December", sheet: januarySheet() } }];
    const review = prepareBackfillReview(ledger, sources, earlier, boundary, "candidate", "command", interpret);
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.sources).toHaveLength(3);
    expect(review.sources.find(source => source.date === "2026-01-31")?.commands).toEqual(boundary);
    expect(sources[0]?.commands).toEqual(OPENING);
  });

  it("rejects a damaged original source and a statement that does not match its uploaded source", () => {
    const { ledger, sources } = twoSavedMonths();
    const read = interpret(januarySheet());
    if (!read.ok) throw new Error("unreadable fixture");
    const boundary = OPENING.map(item => ({ ...item, action: "Keep" as const }));
    const earlier = [{ date: date("2025-12-31"), statement: read.statement, commands: OPENING, source: { sheetName: "December", sheet: { date1904: false, rows: [] } } }];
    expect(prepareBackfillReview(ledger, sources, earlier, boundary, "candidate", "command", interpret).ok).toBe(false);
    const first = sources[0];
    if (first === undefined) throw new Error("missing source");
    expect(prepareBackfillReview(ledger, [...sources, first], earlier, boundary, "candidate", "command", interpret).ok).toBe(false);
  });

  it("replays retained bank sources when a fund existed only in the inserted history", () => {
    const { ledger, sources } = twoSavedMonths();
    const read = interpret(januarySheet());
    if (!read.ok) throw new Error("unreadable fixture");
    const isin = "GB0002634946";
    const statement = { ...read.statement, funds: [...read.statement.funds, { isin, name: "Earlier fund", marketValue: ZERO_CENTS }] };
    const start = { isin, action: "Start" as const, moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, openingNetInvested: ZERO_CENTS, comment: "" };
    const close = { isin, action: "Close" as const, moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" };
    const boundary = [...OPENING.map(item => ({ ...item, action: "Keep" as const })), close];
    const result = prepareBackfillReview(ledger, sources, [{ date: date("2025-12-31"), statement, commands: [...OPENING, start] }], boundary, "candidate", "command", interpret);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sources.find(source => source.date === "2026-02-28")?.commands).toContainEqual({ isin, action: "Closed", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" });
  });

  it("replays a later fund addition as a reopening when the inserted past shows an earlier closed episode", () => {
    const hundred = toEuroCents(10000);
    if (hundred === null) throw new Error("invalid fixture amount");
    const a = { isin: "US0378331005", name: "Fund A", marketValue: hundred };
    const b = { isin: "AU0000XVGZA3", name: "Fund B", marketValue: hundred };
    const jan: StatementInput = { funds: [a], fundsSubtotal: hundred };
    const total = toEuroCents(20000);
    if (total === null) throw new Error("invalid fixture total");
    const feb: StatementInput = { funds: [a, b], fundsSubtotal: total };
    const opening = (isin: string): FundCommand => ({ isin, action: "Start", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, openingNetInvested: hundred, comment: "" });
    const keep: FundCommand = { isin: a.isin, action: "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" };
    const add: FundCommand = { isin: b.isin, action: "Add", moneyIn: hundred, moneyOut: ZERO_CENTS, comment: "" };
    const first = applyImport(EMPTY_LEDGER, jan, date("2026-01-31"), [opening(a.isin)], "one");
    if (!first.ok) throw new Error("initial fixture failed");
    const second = applyImport(first.state, feb, date("2026-02-28"), [keep, add], "two");
    if (!second.ok) throw new Error("second fixture failed");
    const raw = (label: string): RawSheet => ({ date1904: false, rows: [[{ kind: "text", text: label }]] });
    const sources = [
      { date: date("2026-01-31"), commandId: "one", sheetName: "January", sheet: toStoredSheet(raw("jan")), commands: [opening(a.isin)] },
      { date: date("2026-02-28"), commandId: "two", sheetName: "February", sheet: toStoredSheet(raw("feb")), commands: [keep, add] },
    ];
    const read = (sheet: RawSheet) => sheet.rows[0]?.[0]?.kind === "text" && sheet.rows[0][0].text === "jan" ? { ok: true as const, statement: jan } : { ok: true as const, statement: feb };
    const close: FundCommand = { isin: b.isin, action: "Close", moneyIn: ZERO_CENTS, moneyOut: hundred, comment: "" };
    const result = prepareBackfillReview(second.state, sources, [{ date: date("2025-12-31"), statement: feb, commands: [opening(a.isin), opening(b.isin)] }], [keep, close], "candidate", "backfill", read);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ledger.snapshots[2]?.holdings[b.isin]).toMatchObject({ action: "Reopen", status: "active", netInvested: hundred });
    expect(result.sources.find(source => source.date === "2026-02-28")?.commands.find(command => command.isin === b.isin)?.action).toBe("Reopen");
    const zeroFebruary: StatementInput = { funds: [a, { ...b, marketValue: ZERO_CENTS }], fundsSubtotal: hundred };
    const zeroAddition: FundCommand = { ...add, moneyIn: ZERO_CENTS };
    const ambiguous = applyImport(first.state, zeroFebruary, date("2026-02-28"), [keep, zeroAddition], "zero");
    if (!ambiguous.ok) throw new Error("zero-value fixture failed");
    const januarySource = sources[0];
    const februarySource = sources[1];
    if (januarySource === undefined || februarySource === undefined) throw new Error("missing sources");
    const zeroSources = [januarySource, { ...februarySource, commands: [keep, zeroAddition] }];
    const zeroRead = (sheet: RawSheet) => sheet.rows[0]?.[0]?.kind === "text" && sheet.rows[0][0].text === "jan" ? { ok: true as const, statement: jan } : { ok: true as const, statement: zeroFebruary };
    expect(prepareBackfillReview(ambiguous.state, zeroSources, [{ date: date("2025-12-31"), statement: feb, commands: [opening(a.isin), opening(b.isin)] }], [keep, close], "candidate", "backfill", zeroRead).ok).toBe(false);
  });
});
