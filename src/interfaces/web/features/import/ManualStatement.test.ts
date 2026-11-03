import { describe, expect, it } from "vitest";
import { prepareManualStatement } from "./ManualStatement";
const row = { name: "Synthetic fund", isin: "IE0004445015", amount: "10.000,25" };
describe("manual statement validation", () => {
  it("uses exact Italian cents and no fabricated bank evidence", () => {
    const result = prepareManualStatement([row]);
    expect(result.ok && result.statement.fundsSubtotal).toBe(1000025);
    expect(result.ok && result.statement.total).toBe(null);
  });
  it("rejects blanks, foreign decimals, negatives, invalid identifiers and duplicate identities", () => {
    for (const amount of ["", "100.25", "-10,00"]) expect(prepareManualStatement([{ ...row, amount }]).ok).toBe(false);
    expect(prepareManualStatement([{ ...row, isin: "IE0004445016" }]).ok).toBe(false);
    expect(prepareManualStatement([row, { ...row, isin: "ie0004445015" }]).ok).toBe(false);
  });
  it("keeps explicit zero distinct from missing and catches total overflow", () => {
    expect(prepareManualStatement([])).toMatchObject({ ok: true, statement: { fundsSubtotal: 0, funds: [] } });
    expect(prepareManualStatement([{ ...row, amount: "0" }]).ok).toBe(true);
    expect(prepareManualStatement([{ ...row, amount: "90071992547409,92" }]).ok).toBe(false);
  });
});
