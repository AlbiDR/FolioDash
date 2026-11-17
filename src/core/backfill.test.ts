import { describe, expect, it } from "vitest";
import { date, interpret, januarySheet, OPENING, twoSavedMonths } from "../../tests/fixtures/saved-months";
import { prepareBackfill } from "./backfill";
import { toEuroCents, ZERO_CENTS } from "./money";

describe("preparing earlier history", () => {
  it("replays later saved cash from explicitly reviewed boundary decisions", () => {
    const { ledger } = twoSavedMonths(false);
    const statement = interpret(januarySheet());
    if (!statement.ok) throw new Error("fixture is unreadable");
    const earlier = [{ date: date("2025-12-31"), statement: statement.statement, commands: OPENING }];
    const boundary = OPENING.map((command) => ({
      ...command,
      action: "Keep" as const,
      moneyIn: ZERO_CENTS,
      moneyOut: ZERO_CENTS,
    }));
    const result = prepareBackfill(ledger, earlier, boundary, "candidate");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ledger.snapshots.map((snapshot) => snapshot.date)).toEqual([
      "2025-12-31",
      "2026-01-31",
      "2026-02-28",
    ]);
    expect(result.ledger.snapshots[2]).toEqual(ledger.snapshots[1]);
    expect(ledger.snapshots).toHaveLength(2);
  });

  it("refuses a missing boundary decision and an overlapping month", () => {
    const { ledger } = twoSavedMonths(false);
    const statement = interpret(januarySheet());
    if (!statement.ok) throw new Error("fixture is unreadable");
    const item = { date: date("2025-12-31"), statement: statement.statement, commands: OPENING };
    expect(prepareBackfill(ledger, [item], [], "candidate").ok).toBe(false);
    expect(prepareBackfill(ledger, [{ ...item, date: date("2026-01-01") }], [], "candidate").ok).toBe(false);
  });

  it("retains a fund closed before the original first month through later months", () => {
    const { ledger } = twoSavedMonths(false);
    const read = interpret(januarySheet());
    if (!read.ok) throw new Error("unreadable fixture");
    const zero = toEuroCents(0);
    if (zero === null) throw new Error("zero unavailable");
    const fund = { isin: "GB0002634946", name: "Earlier fund", marketValue: zero };
    const statement = { ...read.statement, funds: [...read.statement.funds, fund] };
    const opening = [
      ...OPENING,
      {
        isin: fund.isin,
        action: "Start" as const,
        moneyIn: zero,
        moneyOut: zero,
        openingNetInvested: zero,
        comment: "",
      },
    ];
    const boundary = [
      ...OPENING.map((command) => ({ ...command, action: "Keep" as const })),
      { isin: fund.isin, action: "Close" as const, moneyIn: zero, moneyOut: zero, comment: "" },
    ];
    const result = prepareBackfill(
      ledger,
      [{ date: date("2025-12-31"), statement, commands: opening }],
      boundary,
      "candidate",
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.ledger.snapshots[2]?.holdings[fund.isin]).toMatchObject({
        action: "Closed",
        status: "closed",
        value: zero,
      });
  });

  it("refuses a candidate whose aggregate invested amount cannot be represented", () => {
    const { ledger } = twoSavedMonths(false);
    const read = interpret(januarySheet());
    const maximum = toEuroCents(Number.MAX_SAFE_INTEGER);
    if (!read.ok || maximum === null) throw new Error("fixture failed");
    const opening = OPENING.map((command) => ({ ...command, openingNetInvested: maximum }));
    const boundary = OPENING.map((command) => ({ ...command, action: "Keep" as const }));
    const result = prepareBackfill(
      ledger,
      [{ date: date("2025-12-31"), statement: read.statement, commands: opening }],
      boundary,
      "candidate",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("totals");
  });
});
