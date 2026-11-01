import { describe, expect, it } from "vitest";
import { EMPTY_LEDGER } from "../../../core/Ledger";
import { demoPortfolio } from "./demoPortfolio";
import { overviewFromLedger } from "./overviewFromLedger";

describe("overviewFromLedger", () => {
  it("shows nothing for an empty ledger", () => {
    const model = overviewFromLedger(EMPTY_LEDGER, "recorded");
    expect(model).toMatchObject({ dates: [], funds: [], totals: [], kpis: [], source: "recorded" });
  });

  it("shows no value before a fund was held nor after the statement that closed it", () => {
    const model = demoPortfolio("typical");
    const closed = model.funds.find((fund) => fund.name === "Demo Tech Growth");
    const bonds = model.funds.find((fund) => fund.name === "Demo Euro Bonds");
    expect(model.funds).toHaveLength(3);
    // Held for statements 0 to 4, closed on statement 5 (value zero), absent afterwards.
    expect(closed?.values.map((value) => value === null)).toEqual([false, false, false, false, false, false, true, true]);
    expect(closed?.values[5]).toBe(0);
    expect(closed?.status).toBe("closed");
    // Added on statement 2.
    expect(bonds?.values.slice(0, 3).map((value) => value === null)).toEqual([true, true, false]);
  });

  it("keeps a closed fund's realised result in the totals while its own percentage may be unavailable", () => {
    const model = demoPortfolio("typical");
    const latest = model.totals[model.totals.length - 1];
    const sumNet = model.funds.reduce((sum, fund) => sum + (fund.latest?.netInvested ?? 0), 0);
    expect(latest?.invested).toBe(sumNet);
  });

  it("reports six labelled figures and marks cash-dependent percentages as estimates", () => {
    const model = demoPortfolio("typical");
    expect(model.kpis.map((kpi) => kpi.label)).toEqual([
      "Fund value", "Net invested", "Current gain", "Month on month", "Year to date", "Year on year",
    ]);
    expect(model.estimated).toBe(true);
    expect(model.kpis.every((kpi) => kpi.note.length > 0)).toBe(true);
  });

  it("builds every demo variant from the real ledger rules, for any number of funds", () => {
    expect(demoPortfolio("single").funds).toHaveLength(1);
    expect(demoPortfolio("many").funds).toHaveLength(12);
    expect(demoPortfolio("different").funds.map((fund) => fund.name)).toContain("Example Climate Fund");
    expect(demoPortfolio("empty").funds).toEqual([]);
  });
});
