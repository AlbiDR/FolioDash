import { describe, expect, it } from "vitest";
import { syntheticHistory } from "../fixtures/SyntheticHistory";
import { validateLedger } from "../../src/core/Ledger";
import { computeMetrics } from "../../src/core/Metrics";
import { overviewFromLedger } from "../../src/interfaces/web/app/overviewFromLedger";

describe("synthetic history growth", () => {
  it("keeps every fund, date and independently calculated baseline through a large projection", () => {
    const ledger = syntheticHistory(1200, 100);
    expect(validateLedger(ledger)).toEqual([]);
    const metrics = computeMetrics(ledger);
    const last = metrics[1199];
    // Every fund opens with 100,000 cents invested. Its value starts 100 cents
    // higher per fund index and rises 10 cents per month, with no cash movement.
    const openingGain = 100 * (99 * 100 / 2);
    const gain = openingGain + 1199 * 10 * 100;
    expect(last).toMatchObject({ invested: 10_000_000, gain, monthlyGain: 1000, yearToDateGain: 11_000, yearOverYearGain: 12_000, estimated: false });
    expect(metrics[0]?.yearToDateGain).toBeNull();
    expect(metrics[12]?.yearToDateGain).toBeNull();
    expect(metrics[12]?.yearOverYearGain).toBe(12_000);
    const model = overviewFromLedger(ledger, "recorded");
    expect(model.dates).toHaveLength(1200);
    expect(model.funds).toHaveLength(100);
    expect(model.funds.every((fund) => fund.values.length === 1200 && fund.netInvested.length === 1200)).toBe(true);
  });
  it.each([[0, 1], [1201, 1], [1, 0], [1, 201], [1.5, 1]])("rejects invalid fixture dimensions %s, %s", (months, funds) => {
    expect(() => syntheticHistory(months, funds)).toThrow();
  });
});
