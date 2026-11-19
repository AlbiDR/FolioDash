import { describe, expect, it } from "vitest";
import { type Fund, type Holding, type LedgerState, MAX_COMMENT_LENGTH, type Snapshot, validateLedger } from "./ledger";
import { parseIsin } from "../values/isin";
import type { EuroCents } from "../values/money";
import type { IsoDate } from "../values/iso-date";

// A real check digit, found the same way the other ledger tests find one.
const ISIN = (() => {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XSFUNDA0000${String(digit)}`);
    if (candidate !== null) return candidate;
  }
  throw new Error("no check digit");
})();
const OTHER_ISIN = (() => {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XSFUNDB0000${String(digit)}`);
    if (candidate !== null && candidate !== ISIN) return candidate;
  }
  throw new Error("no second check digit");
})();

const cents = (value: number): EuroCents => value as EuroCents;
const date = (text: string): IsoDate => text as IsoDate;

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    value: cents(1000),
    netInvested: cents(1000),
    moneyIn: cents(0),
    moneyOut: cents(0),
    status: "active",
    action: "Start",
    cashVerified: true,
    comment: "",
    ...overrides,
  };
}

function snapshot(text: string, holdings: Record<string, Holding>, subtotal?: number): Snapshot {
  const total = Object.values(holdings).reduce((sum, item) => sum + item.value, 0);
  return { date: date(text), fundsSubtotal: cents(subtotal ?? total), holdings };
}

function fund(isin: string, firstDate = "2026-01-31", name = "Synthetic Fund A"): Fund {
  return { isin, name, fullName: name, firstDate: date(firstDate) };
}

// One fund, started on the first statement: the ledger every case below changes in one place.
function valid(): LedgerState {
  return {
    revision: "r1",
    funds: [fund(ISIN)],
    snapshots: [snapshot("2026-01-31", { [ISIN]: holding() })],
  };
}

const codes = (state: LedgerState): string[] => validateLedger(state).map((issue) => issue.message);

describe("validating a portfolio ledger", () => {
  it("accepts a ledger that satisfies every rule", () => {
    expect(validateLedger(valid())).toEqual([]);
  });

  it.each<[string, LedgerState, string]>([
    ["an invalid ISIN", { ...valid(), funds: [fund("BAD")] }, "invalid or repeated ISIN"],
    ["a repeated ISIN", { ...valid(), funds: [fund(ISIN), fund(ISIN)] }, "invalid or repeated ISIN"],
    ["an invalid first date", { ...valid(), funds: [fund(ISIN, "2026-13-01")] }, "invalid first date"],
    ["an empty fund name", { ...valid(), funds: [fund(ISIN, "2026-01-31", "")] }, "unsafe or empty name"],
    [
      "a name that starts like a formula",
      { ...valid(), funds: [fund(ISIN, "2026-01-31", "=SUM(A1)")] },
      "unsafe or empty name",
    ],
    [
      "a statement on an invalid date",
      { ...valid(), snapshots: [snapshot("2026-02-30", { [ISIN]: holding() })] },
      "statements must be in later calendar months",
    ],
    [
      "two statements in the same month",
      {
        ...valid(),
        snapshots: [
          snapshot("2026-01-31", { [ISIN]: holding() }),
          snapshot("2026-01-30", { [ISIN]: holding({ action: "Keep" }) }),
        ],
      },
      "statements must be in later calendar months",
    ],
    ["a statement missing a fund", { ...valid(), snapshots: [snapshot("2026-01-31", {})] }, "missing or unknown funds"],
    [
      "money that is not whole cents",
      { ...valid(), snapshots: [snapshot("2026-01-31", { [ISIN]: holding({ value: cents(1.5) }) }, 1000)] },
      "money must be whole cents",
    ],
    [
      "a negative value",
      { ...valid(), snapshots: [snapshot("2026-01-31", { [ISIN]: holding({ value: cents(-1) }) }, -1)] },
      "cannot be negative",
    ],
    [
      "a comment that is too long",
      {
        ...valid(),
        snapshots: [snapshot("2026-01-31", { [ISIN]: holding({ comment: "x".repeat(MAX_COMMENT_LENGTH + 1) }) })],
      },
      "the comment is too long",
    ],
    [
      "a closed holding that still has value",
      {
        ...valid(),
        snapshots: [snapshot("2026-01-31", { [ISIN]: holding({ status: "closed", action: "Close" }) })],
      },
      "a closed holding still has value",
    ],
    [
      "a first statement that does not start the fund",
      { ...valid(), snapshots: [snapshot("2026-01-31", { [ISIN]: holding({ action: "Keep" }) })] },
      "the first statement must start each fund",
    ],
    [
      "cash movements on the first statement",
      {
        ...valid(),
        snapshots: [snapshot("2026-01-31", { [ISIN]: holding({ moneyIn: cents(5) }) }, 1000)],
      },
      "uses opening balances, not cash movements",
    ],
    [
      "a fund added later without the Add action",
      {
        revision: "r2",
        funds: [fund(ISIN), fund(OTHER_ISIN, "2026-02-28")],
        snapshots: [
          snapshot("2026-01-31", { [ISIN]: holding() }),
          snapshot("2026-02-28", {
            [ISIN]: holding({ action: "Keep", value: cents(1000) }),
            [OTHER_ISIN]: holding({ action: "Keep" }),
          }),
        ],
      },
      "a new fund must be added",
    ],
    [
      "a closed fund that is kept active without reopening",
      {
        revision: "r3",
        funds: [fund(ISIN)],
        snapshots: [
          snapshot("2026-01-31", { [ISIN]: holding() }),
          snapshot("2026-02-28", { [ISIN]: holding({ status: "closed", action: "Close", value: cents(0) }) }),
          snapshot("2026-03-31", { [ISIN]: holding({ action: "Keep", value: cents(0), netInvested: cents(0) }) }),
        ],
      },
      "a closed fund needs an explicit reopening",
    ],
    [
      "an active fund that is reopened instead of kept",
      {
        revision: "r4",
        funds: [fund(ISIN)],
        snapshots: [
          snapshot("2026-01-31", { [ISIN]: holding() }),
          snapshot("2026-02-28", { [ISIN]: holding({ action: "Reopen" }) }),
        ],
      },
      "an active fund can only stay active or be explicitly closed",
    ],
    [
      "cash that does not explain the net invested figure",
      {
        revision: "r5",
        funds: [fund(ISIN)],
        snapshots: [
          snapshot("2026-01-31", { [ISIN]: holding() }),
          snapshot("2026-02-28", { [ISIN]: holding({ action: "Keep", moneyIn: cents(100) }) }),
        ],
      },
      "cash movements do not explain net invested",
    ],
    [
      "holdings that do not add up to the funds subtotal",
      { ...valid(), snapshots: [snapshot("2026-01-31", { [ISIN]: holding() }, 999)] },
      "do not add up to the bank's funds subtotal",
    ],
    [
      "a fund with no statement at its first date",
      {
        revision: "r6",
        funds: [fund(ISIN), fund(OTHER_ISIN, "2026-03-31")],
        snapshots: [snapshot("2026-01-31", { [ISIN]: holding() })],
      },
      "has no statement at its first date",
    ],
  ])("reports %s", (_label, state, message) => {
    expect(codes(state).some((text) => text.includes(message))).toBe(true);
  });
});
