import { describe, expect, it } from "vitest";
import { decimalToString } from "../../core/Decimal";
import {
  COL,
  FORMULA,
  ISIN_A,
  ISIN_B,
  ROW,
  number,
  syntheticSheet,
  text,
  withCell,
  withRowsBefore,
  withoutRow,
} from "../../../tests/fixtures/SyntheticFideuramSheet";
import { interpretFideuramSheet } from "./FideuramLayout";
import type { RawSheet } from "../../core/RawSheet";

function interpretOk(sheet: RawSheet) {
  const result = interpretFideuramSheet(sheet);
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.issues)}`);
  return result.statement;
}

function quantityOf(statement: ReturnType<typeof interpretOk>, index: number): string | null {
  const quantity = statement.funds[index]?.quantity;
  return quantity ? decimalToString(quantity) : null;
}

function interpretFailure(sheet: RawSheet) {
  const result = interpretFideuramSheet(sheet);
  if (result.ok) throw new Error("expected failure");
  return result.issues;
}

describe("a clean sheet in the bank's own form", () => {
  it("is read without any adjustment", () => {
    const statement = interpretOk(syntheticSheet());
    expect(statement.adjustments).toEqual([]);
    expect(statement.funds.map((fund) => [fund.isin, fund.marketValue, fund.priceCurrency])).toEqual([
      [ISIN_A, 125000, "EUR"],
      [ISIN_B, 160000, "USD"],
    ]);
    expect(statement.fundsSubtotal).toBe(285000);
    expect(statement.total).toBe(335000);
    expect(statement.categories).toEqual([
      { label: "Fondi", subtotal: 285000, tracked: true },
      { label: "Conti correnti", subtotal: 50000, tracked: false },
    ]);
  });

  it("keeps exact quantities, prices and rates", () => {
    const [euro, dollar] = interpretOk(syntheticSheet()).funds;
    expect(euro?.price ? decimalToString(euro.price) : null).toBe("12.500");
    expect(dollar?.exchangeRate ? decimalToString(dollar.exchangeRate) : null).toBe("1.250");
    expect(euro?.exchangeRate).toBeNull();
  });
});

describe("re-saved variants are accepted only when they reconcile, and are reported", () => {
  it("reads a quantity stored as a time duration", () => {
    const sheet = withCell(syntheticSheet(), ROW.productA, COL.G, number("4.166666666666667", "[h].mm.ss"));
    const statement = interpretOk(sheet);
    expect(quantityOf(statement, 0)).toBe("100.000");
    expect(statement.adjustments).toEqual([{ cell: "M5", message: "quantity stored as a time duration" }]);
  });

  it("reads a dollar fund's duration quantity using the exchange rate", () => {
    const sheet = withCell(syntheticSheet(), ROW.productB, COL.G, number("2.0833333333333335", "[h].mm.ss"));
    expect(quantityOf(interpretOk(sheet), 1)).toBe("50.000");
  });

  it("reads prices and rates stored as plain numbers, inferring the currency from the rate", () => {
    let sheet = withCell(syntheticSheet(), ROW.productA, COL.H, number("12.5"));
    sheet = withCell(sheet, ROW.productB, COL.H, number("40"));
    sheet = withCell(sheet, ROW.productB, COL.I, number("1.25"));
    const statement = interpretOk(sheet);
    expect(statement.funds.map((fund) => fund.priceCurrency)).toEqual(["EUR", "OTHER"]);
    expect(statement.adjustments.map((entry) => entry.message)).toEqual([
      "price stored as a number",
      "price stored as a number",
      "exchange rate stored as a number",
    ]);
  });

  it("reads a US-notation market value stored as text", () => {
    const sheet = withCell(syntheticSheet(), ROW.productA, COL.M, text("1,250.00"));
    const statement = interpretOk(sheet);
    expect(statement.funds[0]?.marketValue).toBe(125000);
    expect(statement.adjustments).toEqual([{ cell: "M5", message: "amount stored as text in US notation" }]);
  });

  it("reads a subscription date stored as a spreadsheet number", () => {
    const sheet = withCell(syntheticSheet(), ROW.contractA, COL.F, number("45689"));
    expect(interpretOk(sheet).adjustments).toEqual([{ cell: "F4", message: "date stored as a number" }]);
  });

  it("accepts a file with no grand total line and says so", () => {
    const statement = interpretOk(withoutRow(syntheticSheet(), ROW.total));
    expect(statement.total).toBeNull();
    expect(statement.adjustments).toEqual([{ cell: null, message: "the file has no grand total line" }]);
  });
});

describe("fields that are not used in results never block an import", () => {
  it("notes an unreadable risk figure and ignores it", () => {
    const statement = interpretOk(withCell(syntheticSheet(), ROW.productA, COL.L, text("abc")));
    expect(statement.adjustments).toEqual([{ cell: "L5", message: "the risk figure cannot be read and is ignored" }]);
  });

  it("notes a contract and product that disagree on risk", () => {
    const statement = interpretOk(withCell(syntheticSheet(), ROW.productA, COL.L, number("0.5")));
    expect(statement.adjustments).toEqual([
      { cell: "L4", message: "the contract and its product show different risk figures (risk is not used)" },
    ]);
  });

  it("accepts a grand total stored as a number and says so", () => {
    const statement = interpretOk(withCell(syntheticSheet(), ROW.total, COL.M, number("3350")));
    expect(statement.total).toBe(335000);
    expect(statement.adjustments).toEqual([{ cell: "M10", message: "amount stored as a number" }]);
  });

  it("accepts an untracked category without a subtotal and skips the total check", () => {
    const sheet = withCell(syntheticSheet(), ROW.accountCategory, COL.M, undefined);
    const statement = interpretOk(sheet);
    expect(statement.categories[1]).toEqual({ label: "Conti correnti", subtotal: null, tracked: false });
    expect(statement.adjustments.map((entry) => entry.message)).toEqual([
      "Conti correnti shows no readable subtotal",
      "the grand total was not checked because a category has no subtotal",
    ]);
  });

  it("accepts a grand total line that has no value", () => {
    const statement = interpretOk(withCell(syntheticSheet(), ROW.total, COL.M, undefined));
    expect(statement.total).toBeNull();
    expect(statement.adjustments).toEqual([{ cell: "M10", message: "the grand total line has no value" }, { cell: null, message: "the file has no grand total line" }]);
  });
});

describe("categories other than funds", () => {
  it("are reconciled and listed as not tracked, without reading their products", () => {
    const sheet = withRowsBefore(syntheticSheet(), ROW.total, [
      { [COL.C]: text("  Shares"), [COL.M]: number("100") },
      {
        [COL.B]: text("EXAMPLE BROKER"),
        [COL.D]: text("000000CC000"),
        [COL.E]: text("EXAMPLE HOLDER"),
        [COL.F]: text("01/02/2025"),
        [COL.L]: text(" "),
        [COL.M]: number("100"),
      },
      { [COL.B]: text("Example Share"), [COL.E]: text("not an isin"), [COL.G]: number("1"), [COL.M]: number("100") },
    ]);
    const statement = interpretOk(withCell(sheet, ROW.total + 3, COL.M, text("3.450,00  € ")));
    expect(statement.categories.map((entry) => [entry.label, entry.tracked])).toEqual([
      ["Fondi", true],
      ["Conti correnti", false],
      ["Shares", false],
    ]);
    expect(statement.funds).toHaveLength(2);
    expect(statement.total).toBe(345000);
  });
});

describe("files that must be rejected", () => {
  it("rejects an unknown layout", () => {
    const sheet = withCell(syntheticSheet(), ROW.header, COL.H, text("Price"));
    expect(interpretFideuramSheet(sheet)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: "layout-not-found" })],
    });
  });

  it("rejects a wrong ISIN check digit", () => {
    const issues = interpretFailure(withCell(syntheticSheet(), ROW.productA, COL.E, text("US0378331006")));
    expect(issues).toContainEqual(expect.objectContaining({ code: "invalid-identifier", cell: "E5" }));
  });

  it("rejects a duplicate ISIN", () => {
    const issues = interpretFailure(withCell(syntheticSheet(), ROW.productB, COL.E, text(ISIN_A)));
    expect(issues).toContainEqual(expect.objectContaining({ code: "duplicate-identifier", cell: "E7" }));
  });

  it("rejects a formula cell", () => {
    const issues = interpretFailure(withCell(syntheticSheet(), ROW.productA, COL.H, FORMULA));
    expect(issues).toContainEqual(expect.objectContaining({ code: "formula-cell", cell: "H5" }));
  });

  it("rejects a subtotal that the contracts do not add up to", () => {
    const issues = interpretFailure(withCell(syntheticSheet(), ROW.fundsCategory, COL.M, number("2851")));
    expect(issues).toContainEqual(expect.objectContaining({ code: "does-not-reconcile", cell: "M3" }));
  });

  it("rejects a grand total that the categories do not add up to", () => {
    const issues = interpretFailure(withCell(syntheticSheet(), ROW.total, COL.M, text("3.351,00  € ")));
    expect(issues).toContainEqual(expect.objectContaining({ code: "does-not-reconcile", cell: null }));
  });

  it("rejects a contract whose value differs from its product", () => {
    const issues = interpretFailure(withCell(syntheticSheet(), ROW.contractA, COL.M, number("1251")));
    expect(issues).toContainEqual(expect.objectContaining({ code: "does-not-reconcile", cell: "M4" }));
  });

  it("rejects a market value that quantity x price does not support", () => {
    const issues = interpretFailure(withCell(syntheticSheet(), ROW.productA, COL.G, number("105")));
    expect(issues).toContainEqual(expect.objectContaining({ code: "does-not-reconcile", cell: "M5" }));
  });

  it("rejects a dollar price with no exchange rate", () => {
    const issues = interpretFailure(withCell(syntheticSheet(), ROW.productB, COL.I, undefined));
    expect(issues).toContainEqual(expect.objectContaining({ code: "currency-mismatch", cell: "M7" }));
  });

  it("rejects an unknown currency symbol", () => {
    const issues = interpretFailure(withCell(syntheticSheet(), ROW.productA, COL.H, text("12,500£ ")));
    expect(issues).toContainEqual(expect.objectContaining({ code: "unreadable-value", cell: "H5" }));
  });

  it("rejects a product name that a spreadsheet would read as a formula", () => {
    const issues = interpretFailure(withCell(syntheticSheet(), ROW.productA, COL.B, text("=cmd")));
    expect(issues).toContainEqual(expect.objectContaining({ code: "unreadable-value", cell: "B5" }));
  });
});
