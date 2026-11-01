import { describe, expect, it } from "vitest";
import { COL, ROW, number, syntheticSheet, text, withCell } from "../../../tests/fixtures/SyntheticFideuramSheet";
import { presentStatement } from "./FideuramPresentation";

/** The grid has one empty row on top and one empty column on the left, so sheet row r, column c sits at r, c in the sheet's own numbering. */
const at = (sheet: ReturnType<typeof syntheticSheet>, row: number, column: number) => presentStatement(sheet).cells[row]?.[column];

describe("presentStatement", () => {
  it("keeps the bank's positions: the data sits where the file had it, with empty first row and column", () => {
    const grid = presentStatement(syntheticSheet());
    expect(grid.cells[0]?.every((cell) => cell.value === "")).toBe(true);
    expect(grid.cells.every((row) => row[0]?.value === "")).toBe(true);
    expect(grid.cells[ROW.header]?.[COL.B]?.value).toBe("Categoria / Nome prodotto");
  });

  it("ends one empty row and one empty column after the data, with narrow margin columns", () => {
    const grid = presentStatement(syntheticSheet());
    expect(grid.cells).toHaveLength(ROW.total + 2);
    expect(grid.cells[grid.cells.length - 1]?.every((cell) => cell.value === "")).toBe(true);
    expect(grid.cells[0]).toHaveLength(COL.M + 2);
    expect(grid.widths[0]).toBe(28);
    expect(grid.widths[grid.widths.length - 1]).toBe(28);
  });

  it("shows header and category rows as such", () => {
    expect(at(syntheticSheet(), ROW.header, COL.B)?.emphasis).toBe("header");
    expect(at(syntheticSheet(), ROW.fundsCategory, COL.C)?.emphasis).toBe("strong");
    expect(at(syntheticSheet(), ROW.total, COL.B)?.emphasis).toBe("strong");
  });

  it("types amounts, quantities, prices and risk with the same formats in every month", () => {
    const sheet = syntheticSheet();
    expect(at(sheet, ROW.productA, COL.M)).toMatchObject({ value: 1250, format: '#,##0.00" €"' });
    expect(at(sheet, ROW.productA, COL.G)).toMatchObject({ value: 100, format: "#,##0.000" });
    expect(at(sheet, ROW.productA, COL.H)).toMatchObject({ value: 12.5, format: '#,##0.000 "€"' });
    expect(at(sheet, ROW.productB, COL.H)).toMatchObject({ value: 40, format: '#,##0.000 "$"' });
    expect(at(sheet, ROW.productB, COL.I)).toMatchObject({ value: 1.25, format: "0.0000" });
    expect(at(sheet, ROW.contractA, COL.L)).toMatchObject({ value: 0.05, format: "0.00%" });
    expect(at(sheet, ROW.total, COL.M)).toMatchObject({ value: 3350, format: '#,##0.00" €"' });
  });

  it("shows a date the same way whether the month's file stored text or a date number", () => {
    const asText = at(syntheticSheet(), ROW.contractA, COL.F);
    // 01/02/2025 is spreadsheet date number 45689.
    const asNumber = at(withCell(syntheticSheet(), ROW.contractA, COL.F, number("45689")), ROW.contractA, COL.F);
    expect(asText).toMatchObject({ value: 45689, format: "dd/mm/yyyy" });
    expect(asNumber).toEqual(asText);
  });

  it("shows an amount the same way whether the month's file stored it as a number or as text", () => {
    const asNumber = at(syntheticSheet(), ROW.productA, COL.M);
    const asText = at(withCell(syntheticSheet(), ROW.productA, COL.M, text("1.250,00 € ")), ROW.productA, COL.M);
    expect(asText).toMatchObject({ value: asNumber?.value, format: asNumber?.format });
  });

  it("shows the real quantity in a month whose file stored it as a time", () => {
    // 100 units typed as hours became the time 4 days 4 hours, which means nothing as a quantity on its own.
    const asTime = withCell(syntheticSheet(), ROW.productA, COL.G, number("4.166666666666667", "[h].mm.ss"));
    expect(at(asTime, ROW.productA, COL.G)).toMatchObject({ value: 100, format: "#,##0.000" });
  });

  it("leaves a cell it cannot read in exactly one way as the file wrote it", () => {
    const odd = at(withCell(syntheticSheet(), ROW.productA, COL.M, text("n/d soon")), ROW.productA, COL.M);
    expect(odd).toMatchObject({ value: "n/d soon", format: null });
  });
});
