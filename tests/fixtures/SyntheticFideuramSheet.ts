import type { RawCell, RawSheet } from "../../src/core/RawSheet";

/** Every value here is invented. Nothing comes from a real statement. */

const QUANTITY_FORMAT = "#,###,##0.000 ";
const RISK_FORMAT = "0.00% ";

export function text(value: string): RawCell {
  return { kind: "text", text: value };
}

export function number(value: string, format: string | null = null): RawCell {
  return { kind: "number", text: value, format };
}

export const FORMULA: RawCell = { kind: "formula" };

/** Zero-based column indexes, B = 1 ... M = 12. */
export const COL = { B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12 } as const;

/** Zero-based row indexes of the baseline sheet. */
export const ROW = {
  header: 1,
  fundsCategory: 2,
  contractA: 3,
  productA: 4,
  contractB: 5,
  productB: 6,
  accountCategory: 7,
  accountContract: 8,
  total: 9,
} as const;

export const ISIN_A = "US0378331005";
export const ISIN_B = "AU0000XVGZA3";

function row(cells: Readonly<Record<number, RawCell>>): (RawCell | undefined)[] {
  const result: (RawCell | undefined)[] = Array.from({ length: 13 }, () => undefined);
  for (const [column, cell] of Object.entries(cells)) result[Number(column)] = cell;
  return result;
}

/**
 * A clean sheet in the bank's own form: a euro fund (100 units at 12.500 =
 * 1,250.00), a dollar fund (50 units at 40.000 USD, rate 1.250 = 1,600.00), and a
 * current account of 500.00. Funds 2,850.00, total 3,350.00.
 */
export function syntheticSheet(): RawSheet {
  return {
    date1904: false,
    rows: [
      row({}),
      row({
        [COL.B]: text("Categoria / Nome prodotto"),
        [COL.D]: text("Numero contratto / conto"),
        [COL.E]: text("Intestatari / ISIN"),
        [COL.F]: text("Data di sottoscrizione"),
        [COL.G]: text("Quantità"),
        [COL.H]: text("Prezzo"),
        [COL.I]: text("Cambio "),
        [COL.J]: text("Prezzo medio di carico "),
        [COL.K]: text("Cambio di carico "),
        [COL.L]: text("Rischio (VaR) "),
        [COL.M]: text("Controvalore (€) "),
      }),
      row({ [COL.C]: text("  Fondi"), [COL.M]: number("2850") }),
      row({
        [COL.B]: text("EXAMPLE FUND HOUSE A"),
        [COL.D]: text("000000AA000"),
        [COL.E]: text("EXAMPLE HOLDER"),
        [COL.F]: text("01/02/2025"),
        [COL.L]: number("0.05", RISK_FORMAT),
        [COL.M]: number("1250"),
      }),
      row({
        [COL.B]: text("Example Fund A Acc EUR"),
        [COL.E]: text(ISIN_A),
        [COL.G]: number("100", QUANTITY_FORMAT),
        [COL.H]: text("12,500€ "),
        [COL.J]: text("12,0000€ "),
        [COL.L]: number("0.05", RISK_FORMAT),
        [COL.M]: number("1250"),
      }),
      row({
        [COL.B]: text("EXAMPLE FUND HOUSE B"),
        [COL.D]: text("000000BB000"),
        [COL.E]: text("EXAMPLE HOLDER"),
        [COL.F]: text("01/02/2025"),
        [COL.L]: number("0.1", RISK_FORMAT),
        [COL.M]: number("1600"),
      }),
      row({
        [COL.B]: text("Example Fund B Acc USD"),
        [COL.E]: text(ISIN_B),
        [COL.G]: number("50", QUANTITY_FORMAT),
        [COL.H]: text("40,000$ "),
        [COL.I]: text("1,250 "),
        [COL.J]: text("36,0000$ "),
        [COL.K]: text("1,2000 "),
        [COL.L]: number("0.1", RISK_FORMAT),
        [COL.M]: number("1600"),
      }),
      row({ [COL.C]: text("  Conti correnti"), [COL.M]: number("500") }),
      row({
        [COL.B]: text("CURRENT ACCOUNT"),
        [COL.D]: text("0000/00000000"),
        [COL.E]: text("EXAMPLE HOLDER"),
        [COL.F]: text("01/02/2025"),
        [COL.L]: text(" "),
        [COL.M]: number("500"),
      }),
      row({ [COL.B]: text("  Totale visualizzato"), [COL.M]: text("3.350,00  € ") }),
    ],
  };
}

/** A copy of the sheet with one cell replaced (or removed with `undefined`). */
export function withCell(sheet: RawSheet, rowIndex: number, column: number, cell: RawCell | undefined): RawSheet {
  return {
    ...sheet,
    rows: sheet.rows.map((existing, index) => {
      if (index !== rowIndex) return existing;
      const copy = [...existing];
      copy[column] = cell;
      return copy;
    }),
  };
}

/** A copy of the sheet with extra rows inserted before the given row index. */
export function withRowsBefore(
  sheet: RawSheet,
  rowIndex: number,
  rows: readonly Readonly<Record<number, RawCell>>[],
): RawSheet {
  return {
    ...sheet,
    rows: [...sheet.rows.slice(0, rowIndex), ...rows.map((cells) => row(cells)), ...sheet.rows.slice(rowIndex)],
  };
}

export function withoutRow(sheet: RawSheet, rowIndex: number): RawSheet {
  return { ...sheet, rows: sheet.rows.filter((_, index) => index !== rowIndex) };
}
