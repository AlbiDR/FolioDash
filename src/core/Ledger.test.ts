import { describe, expect, it } from "vitest";
import { parseLedgerState } from "./Ledger";

const holding = {
  value: 0,
  netInvested: 0,
  moneyIn: 0,
  moneyOut: 0,
  status: "closed",
  action: "Closed",
  cashVerified: true,
  comment: "",
};
const fund = { isin: "IE00000000000", name: "Fund", fullName: "Fund", firstDate: "2026-01-31" };

describe("parseLedgerState", () => {
  it.each([
    ["a null fund", { revision: "r", funds: [null], snapshots: [] }],
    ["a snapshot without holdings", { revision: "r", funds: [], snapshots: [{ date: "2026-01-31", fundsSubtotal: 0 }] }],
    ["a numeric snapshot date", { revision: "r", funds: [], snapshots: [{ date: 5, fundsSubtotal: 0, holdings: {} }] }],
    ["a null holding", { revision: "r", funds: [], snapshots: [{ date: "2026-01-31", fundsSubtotal: 0, holdings: { X: null } }] }],
    ["a holding without a comment", { revision: "r", funds: [], snapshots: [{ date: "2026-01-31", fundsSubtotal: 0, holdings: { X: { ...holding, comment: undefined } } }] }],
    ["a numeric fund ISIN", { revision: "r", funds: [{ ...fund, isin: 5 }], snapshots: [] }],
  ])("refuses %s without throwing", (_label, value) => {
    expect(() => parseLedgerState(value)).not.toThrow();
    expect(parseLedgerState(value)).toBeNull();
  });

  it("refuses a snapshot date with surrounding spaces, because stored dates must be exact", () => {
    const value = { revision: "r", funds: [], snapshots: [{ date: " 2026-01-31", fundsSubtotal: 0, holdings: {} }] };
    expect(parseLedgerState(value)).toBeNull();
  });

  it("accepts an empty ledger", () => {
    expect(parseLedgerState({ revision: "", funds: [], snapshots: [] })).toEqual({ revision: "", funds: [], snapshots: [] });
  });
});
