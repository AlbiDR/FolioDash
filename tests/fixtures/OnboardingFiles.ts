import { buildXlsx } from "./SyntheticXlsx";
import { COL, FORMULA, ISIN_A, ISIN_B, ROW, number, syntheticSheet, text, withCell } from "./SyntheticFideuramSheet";
import type { RawSheet } from "../../src/core/RawSheet";

function valuedSheet(price: string, fundValue: string, subtotal: string, total: string): RawSheet {
  let sheet = syntheticSheet();
  for (const [row, column, cell] of [
    [ROW.productA, COL.H, text(`${price}€ `)],
    [ROW.productA, COL.M, number(fundValue)],
    [ROW.contractA, COL.M, number(fundValue)],
    [ROW.fundsCategory, COL.M, number(subtotal)],
    [ROW.total, COL.M, text(`${total}  € `)],
  ] as const) sheet = withCell(sheet, row, column, cell);
  return sheet;
}

/** Invented bank exports for manual acceptance. Never reads a financial file or calls Google. */
export async function createOnboardingFixtures(): Promise<ReadonlyMap<string, Uint8Array>> {
  const months = [
    { date: "2026-01-31", sheet: syntheticSheet() },
    { date: "2026-02-28", sheet: valuedSheet("13,000", "1300", "2900", "3.400,00") },
    { date: "2026-03-31", sheet: valuedSheet("14,000", "1400", "3000", "3.500,00") },
  ] as const;
  const files = new Map<string, Uint8Array>();
  for (const month of months) {
    files.set(`individual/synthetic-bank-${month.date}.xlsx`, await buildXlsx([{ name: "Il Mio Patrimonio", sheet: month.sheet }], { created: `${month.date}T12:00:00Z`, deflate: true }));
  }
  const container = { created: "2026-11-04T12:00:00Z", deflate: true };
  files.set("combined/synthetic-history.xlsx", await buildXlsx([
    { name: "Bank 2026-03-31", sheet: months[2].sheet },
    { name: "Bank 31-01-2026", sheet: months[0].sheet },
    { name: "Bank 28-02-2026", sheet: months[1].sheet },
    { name: "Notes", sheet: { date1904: false, rows: [[text("SYNTHETIC ACCEPTANCE DATA ONLY")]] } },
  ], container));
  files.set("validation/synthetic-missing-date.xlsx", await buildXlsx([
    { name: "Bank 2026-01-31", sheet: months[0].sheet },
    { name: "February", sheet: months[1].sheet },
  ], container));
  files.set("validation/synthetic-duplicate-month.xlsx", await buildXlsx([
    { name: "Bank 2026-01-01", sheet: months[0].sheet },
    { name: "Bank 2026-01-31", sheet: months[0].sheet },
  ], container));
  files.set("validation/synthetic-invalid-formula.xlsx", await buildXlsx([
    { name: "Bank 2026-02-28", sheet: withCell(months[1].sheet, ROW.productA, COL.H, FORMULA) },
  ], container));
  return files;
}

export const ONBOARDING_EXPECTED = {
  data: "Invented acceptance data only. Use the isolated acceptance build and test workbook; never import into a real portfolio workbook.",
  steps: "Use EITHER the individual files OR the combined workbook for a fresh-account save. They represent the same history. Set opening net invested to 1.000,00 for each fund, then answer No to cash movements for February and March.",
  dates: ["2026-01-31", "2026-02-28", "2026-03-31"],
  funds: [ISIN_A, ISIN_B],
  fundsSubtotalCents: [285000, 290000, 300000],
  netInvestedCents: [200000, 200000, 200000],
  gainCents: [85000, 90000, 100000],
  validation: {
    missingDate: "February must require a date. Enter 2026-02-28; never 2026-11-04 from container metadata.",
    duplicateMonth: "Two January statements must block review until one is explicitly excluded.",
    invalidFormula: "The formula sheet must be refused. It must never be evaluated or saved.",
  },
} as const;
