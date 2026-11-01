import type { Decimal } from "../../core/Decimal";
import { parseIsin } from "../../core/Isin";
import { isSafeFundName } from "../../core/Ledger";
import { type EuroCents, addCents } from "../../core/Money";
import { type RawSheet, cellAt, cellRef } from "../../core/RawSheet";
import {
  type Currency,
  type ReadResult,
  isMissing,
  readDate,
  readMoney,
  readPrice,
  readQuantity,
  readRate,
  readRisk,
  resolveFundValues,
  risksEqual,
} from "./FideuramValues";

const COLUMN = { B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12 } as const;
const LAST_COLUMN = COLUMN.M;

const HEADERS: readonly (readonly [number, string])[] = [
  [COLUMN.B, "Categoria / Nome prodotto"],
  [COLUMN.D, "Numero contratto / conto"],
  [COLUMN.E, "Intestatari / ISIN"],
  [COLUMN.F, "Data di sottoscrizione"],
  [COLUMN.G, "Quantità"],
  [COLUMN.H, "Prezzo"],
  [COLUMN.I, "Cambio"],
  [COLUMN.J, "Prezzo medio di carico"],
  [COLUMN.K, "Cambio di carico"],
  [COLUMN.L, "Rischio (VaR)"],
  [COLUMN.M, "Controvalore (€)"],
];
const TOTAL_LABEL = "totale visualizzato";
const FUNDS_LABEL = "fondi";

export interface FundPosition {
  readonly isin: string;
  readonly name: string;
  readonly marketValue: EuroCents;
  readonly quantity: Decimal | null;
  readonly price: Decimal | null;
  readonly priceCurrency: Currency | null;
  readonly exchangeRate: Decimal | null;
}

export interface CategorySummary {
  readonly label: string;
  /** Null only for a category that is not tracked and shows no readable subtotal. */
  readonly subtotal: EuroCents | null;
  /** False for categories this version reads for reconciliation only. */
  readonly tracked: boolean;
}

export interface Adjustment {
  readonly cell: string | null;
  readonly message: string;
}

export type IssueCode =
  | "layout-not-found"
  | "unsupported-layout"
  | "unsupported-structure"
  | "formula-cell"
  | "unreadable-value"
  | "missing-value"
  | "invalid-identifier"
  | "duplicate-identifier"
  | "ambiguous-reading"
  | "currency-mismatch"
  | "does-not-reconcile";

export interface Issue {
  readonly code: IssueCode;
  readonly cell: string | null;
  readonly message: string;
}

export interface CandidateStatement {
  readonly funds: readonly FundPosition[];
  readonly fundsSubtotal: EuroCents;
  readonly categories: readonly CategorySummary[];
  /** The bank's grand total, or null when the file has no total line. */
  readonly total: EuroCents | null;
  /** Every reading that differs from the bank's own form. Shown in the review, never silent. */
  readonly adjustments: readonly Adjustment[];
}

export type InterpretResult =
  | { readonly ok: true; readonly statement: CandidateStatement }
  | { readonly ok: false; readonly issues: readonly Issue[] };

interface ProductSummary {
  readonly row: number;
  readonly value: EuroCents;
  readonly risk: Decimal | null;
}

interface ContractSummary {
  /** True once a row under this contract failed, so follow-on checks would only repeat that problem. */
  incomplete: boolean;
  readonly row: number;
  readonly value: EuroCents;
  readonly risk: Decimal | null;
  readonly products: ProductSummary[];
}

interface CategoryState {
  readonly row: number;
  readonly label: string;
  readonly subtotal: EuroCents | null;
  readonly tracked: boolean;
  readonly contracts: ContractSummary[];
}

function textOf(sheet: RawSheet, row: number, column: number): string {
  const cell = cellAt(sheet, row, column);
  return cell?.kind === "text" ? cell.text.trim() : "";
}

function present(sheet: RawSheet, row: number, column: number): boolean {
  return !isMissing(cellAt(sheet, row, column));
}

function findHeader(sheet: RawSheet): number | null {
  for (let row = 0; row < sheet.rows.length; row++) {
    if (
      HEADERS.every(([column, label]) => textOf(sheet, row, column) === label) &&
      !present(sheet, row, COLUMN.C)
    ) {
      return row;
    }
  }
  return null;
}

function isBlankRow(sheet: RawSheet, row: number): boolean {
  for (let column = 0; column <= LAST_COLUMN; column++) {
    if (present(sheet, row, column) || cellAt(sheet, row, column)?.kind === "formula") return false;
  }
  return true;
}

/**
 * Reads a bank holdings sheet into a candidate statement.
 *
 * Rows are recognised by structure, never by position, so any number of
 * contracts, funds and categories is accepted. Only the funds category is
 * tracked; other categories are reconciled but not interpreted. Every reading
 * that differs from the bank's own form is reported as an adjustment, and every
 * check that fails is reported as an issue. Nothing is guessed.
 */
export function interpretFideuramSheet(sheet: RawSheet): InterpretResult {
  const issues: Issue[] = [];
  const adjustments: Adjustment[] = [];
  const addIssue = (code: IssueCode, cell: string | null, message: string): void => {
    issues.push({ code, cell, message });
  };

  const header = findHeader(sheet);
  if (header === null) {
    return {
      ok: false,
      issues: [
        {
          code: "layout-not-found",
          cell: null,
          message: "The header row of the supported Fideuram holdings layout was not found.",
        },
      ],
    };
  }

  /** Picks the single reading of a read result, recording any adjustment, or reports why not. */
  const pick = <T>(result: ReadResult<T>, row: number, column: number, label: string, required: boolean): T | null => {
    const ref = cellRef(row, column);
    if (result.status === "missing") {
      if (required) addIssue("missing-value", ref, `${label} is missing.`);
      return null;
    }
    if (result.status === "unreadable") {
      addIssue("unreadable-value", ref, `${label} cannot be read in any supported form.`);
      return null;
    }
    const [first, ...others] = result.candidates;
    if (first === undefined) return null;
    if (others.length > 0) {
      addIssue("ambiguous-reading", ref, `${label} has more than one possible reading.`);
      return null;
    }
    if (first.adjustment !== null) adjustments.push({ cell: ref, message: first.adjustment });
    return first.value;
  };

  /** The risk figure is not used in results, so an unreadable one is noted and ignored, never fatal. */
  const lenientRisk = (row: number): Decimal | null => {
    const result = readRisk(cellAt(sheet, row, COLUMN.L));
    if (result.status === "unreadable") {
      adjustments.push({ cell: cellRef(row, COLUMN.L), message: "the risk figure cannot be read and is ignored" });
      return null;
    }
    if (result.status === "missing") return null;
    const [first, ...others] = result.candidates;
    if (first === undefined || others.length > 0) return null;
    if (first.adjustment !== null) adjustments.push({ cell: cellRef(row, COLUMN.L), message: first.adjustment });
    return first.value;
  };

  const categories: CategoryState[] = [];
  const funds: FundPosition[] = [];
  const seenIsins = new Set<string>();
  let current: CategoryState | null = null;
  let contract: ContractSummary | null = null;
  let total: EuroCents | null = null;

  for (let row = header + 1; row < sheet.rows.length; row++) {
    if (isBlankRow(sheet, row)) continue;

    let hasFormula = false;
    for (let column = 0; column <= LAST_COLUMN; column++) {
      if (cellAt(sheet, row, column)?.kind === "formula") {
        hasFormula = true;
        addIssue("formula-cell", cellRef(row, column), "Formula cells are not supported.");
      }
    }
    if (hasFormula) {
      if (contract !== null) contract.incomplete = true;
      continue;
    }

    const label = textOf(sheet, row, COLUMN.B);
    if (label.toLowerCase() === TOTAL_LABEL) {
      const totalRead = readMoney(cellAt(sheet, row, COLUMN.M), true);
      if (totalRead.status === "missing") {
        adjustments.push({ cell: cellRef(row, COLUMN.M), message: "the grand total line has no value" });
      } else {
        total = pick(totalRead, row, COLUMN.M, "The grand total", true);
      }
      break;
    }

    if (present(sheet, row, COLUMN.C) && !present(sheet, row, COLUMN.B)) {
      const name = textOf(sheet, row, COLUMN.C);
      const tracked = name.toLowerCase() === FUNDS_LABEL;
      const subtotalRead = readMoney(cellAt(sheet, row, COLUMN.M), false);
      let subtotal: EuroCents | null;
      if (tracked) {
        subtotal = pick(subtotalRead, row, COLUMN.M, "The funds subtotal", true);
        if (subtotal === null) continue;
      } else if (subtotalRead.status === "ok" && subtotalRead.candidates.length === 1) {
        subtotal = pick(subtotalRead, row, COLUMN.M, `The ${name} subtotal`, false);
      } else {
        subtotal = null;
        adjustments.push({ cell: cellRef(row, COLUMN.M), message: `${name} shows no readable subtotal` });
      }
      current = { row, label: name, subtotal, tracked, contracts: [] };
      categories.push(current);
      contract = null;
      continue;
    }

    if (current === null) {
      addIssue("unsupported-structure", cellRef(row, COLUMN.B), "A data row appears before any category row.");
      continue;
    }

    // Categories other than funds are reconciled through their subtotal only; their rows are not interpreted.
    if (!current.tracked) continue;

    if (present(sheet, row, COLUMN.B) && present(sheet, row, COLUMN.D)) {
      const value = pick(readMoney(cellAt(sheet, row, COLUMN.M), false), row, COLUMN.M, "The contract value", true);
      pick(readDate(cellAt(sheet, row, COLUMN.F), sheet.date1904), row, COLUMN.F, "The subscription date", false);
      const risk = lenientRisk(row);
      if (value === null) {
        contract = null;
        continue;
      }
      contract = { incomplete: false, row, value, risk, products: [] };
      current.contracts.push(contract);
      continue;
    }

    if (present(sheet, row, COLUMN.B) && !present(sheet, row, COLUMN.D) && present(sheet, row, COLUMN.E)) {
      if (contract === null) {
        addIssue("unsupported-structure", cellRef(row, COLUMN.B), "A product row has no contract row above it.");
        continue;
      }
      const product = readProduct(sheet, row, pick, lenientRisk, addIssue, seenIsins);
      if (product === null) {
        contract.incomplete = true;
        continue;
      }
      funds.push(product.fund);
      contract.products.push({ row, value: product.fund.marketValue, risk: product.risk });
      for (const message of product.adjustments) adjustments.push({ cell: cellRef(row, COLUMN.M), message });
      continue;
    }

    if (contract !== null) contract.incomplete = true;
    addIssue("unsupported-structure", cellRef(row, COLUMN.B), "This row does not match any supported row type.");
  }

  const summaries: CategorySummary[] = [];
  for (const category of categories) {
    summaries.push({ label: category.label, subtotal: category.subtotal, tracked: category.tracked });
    checkCategory(category, addIssue, (cell, message) => adjustments.push({ cell, message }));
  }
  const tracked = categories.find((category) => category.tracked);
  if (tracked === undefined) {
    addIssue("unsupported-layout", null, "No funds category was found.");
  }
  if (total === null) {
    adjustments.push({ cell: null, message: "the file has no grand total line" });
  } else {
    const subtotals = summaries.map((entry) => entry.subtotal);
    if (subtotals.some((entry) => entry === null)) {
      adjustments.push({ cell: null, message: "the grand total was not checked because a category has no subtotal" });
    } else if (sumOf(subtotals as EuroCents[]) !== total) {
      addIssue("does-not-reconcile", null, "The category subtotals do not add up to the grand total.");
    }
  }

  if (issues.length > 0 || tracked === undefined || tracked.subtotal === null) return { ok: false, issues };
  return {
    ok: true,
    statement: {
      funds,
      fundsSubtotal: tracked.subtotal,
      categories: summaries,
      total,
      adjustments,
    },
  };
}

function sumOf(values: readonly EuroCents[]): EuroCents | null {
  let sum = 0 as EuroCents | null;
  for (const value of values) {
    if (sum === null) return null;
    sum = addCents(sum, value);
  }
  return sum;
}

function checkCategory(
  category: CategoryState,
  addIssue: (code: IssueCode, cell: string | null, message: string) => void,
  note: (cell: string | null, message: string) => void,
): void {
  if (!category.tracked) return;
  if (sumOf(category.contracts.map((entry) => entry.value)) !== category.subtotal) {
    addIssue(
      "does-not-reconcile",
      cellRef(category.row, COLUMN.M),
      `The contracts in ${category.label} do not add up to its subtotal.`,
    );
  }
  for (const contract of category.contracts) {
    if (contract.incomplete) continue;
    if (contract.products.length === 0) {
      addIssue("unsupported-structure", cellRef(contract.row, COLUMN.B), "A fund contract has no product row.");
      continue;
    }
    if (sumOf(contract.products.map((entry) => entry.value)) !== contract.value) {
      addIssue(
        "does-not-reconcile",
        cellRef(contract.row, COLUMN.M),
        "The products of this contract do not add up to the contract value.",
      );
    }
    const [only, ...others] = contract.products;
    if (
      only !== undefined &&
      others.length === 0 &&
      contract.risk !== null &&
      only.risk !== null &&
      !risksEqual(contract.risk, only.risk)
    ) {
      note(cellRef(contract.row, COLUMN.L), "the contract and its product show different risk figures (risk is not used)");
    }
  }
}

type Pick = <T>(result: ReadResult<T>, row: number, column: number, label: string, required: boolean) => T | null;

function readProduct(
  sheet: RawSheet,
  row: number,
  pick: Pick,
  lenientRisk: (row: number) => Decimal | null,
  addIssue: (code: IssueCode, cell: string | null, message: string) => void,
  seenIsins: Set<string>,
): { fund: FundPosition; risk: Decimal | null; adjustments: readonly string[] } | null {
  const name = textOf(sheet, row, COLUMN.B);
  if (!isSafeFundName(name)) {
    addIssue("unreadable-value", cellRef(row, COLUMN.B), "The product name is empty, too long or starts with a formula character.");
    return null;
  }
  const rawIsin = cellAt(sheet, row, COLUMN.E);
  const isin = rawIsin?.kind === "text" ? parseIsin(rawIsin.text) : null;
  if (isin === null) {
    addIssue("invalid-identifier", cellRef(row, COLUMN.E), "The ISIN is malformed or its check digit is wrong.");
    return null;
  }
  if (seenIsins.has(isin)) {
    addIssue("duplicate-identifier", cellRef(row, COLUMN.E), "This ISIN appears more than once.");
    return null;
  }
  const marketValue = pick(readMoney(cellAt(sheet, row, COLUMN.M), false), row, COLUMN.M, "The market value", true);
  if (marketValue === null) return null;

  const quantity = readQuantity(cellAt(sheet, row, COLUMN.G));
  const price = readPrice(cellAt(sheet, row, COLUMN.H));
  const rate = readRate(cellAt(sheet, row, COLUMN.I));
  for (const [result, column, label] of [
    [quantity, COLUMN.G, "The quantity"],
    [price, COLUMN.H, "The price"],
    [rate, COLUMN.I, "The exchange rate"],
  ] as const) {
    if (result.status === "unreadable") {
      addIssue("unreadable-value", cellRef(row, column), `${label} cannot be read in any supported form.`);
      return null;
    }
  }
  const risk = lenientRisk(row);

  const outcome = resolveFundValues({ quantity, price, rate, marketValue });
  if (outcome.status === "failed") {
    addIssue(outcome.code, cellRef(row, COLUMN.M), outcome.message);
    return null;
  }
  seenIsins.add(isin);
  return {
    fund: {
      isin,
      name,
      marketValue,
      quantity: outcome.values.quantity,
      price: outcome.values.price,
      priceCurrency: outcome.values.currency,
      exchangeRate: outcome.values.exchangeRate,
    },
    risk,
    adjustments: outcome.values.adjustments,
  };
}

