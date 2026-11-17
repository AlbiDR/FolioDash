import type { Decimal } from "../../core/values/decimal";
import { type EuroCents, addCents } from "../../core/values/money";
import { cellRef } from "../../core/statements/raw-sheet";
import { risksEqual } from "./fideuram-values";

export const COLUMN = { B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12 } as const;

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

export interface ProductSummary {
  readonly row: number;
  readonly value: EuroCents;
  readonly risk: Decimal | null;
}

export interface ContractSummary {
  /** True once a row under this contract failed, so follow-on checks would only repeat that problem. */
  incomplete: boolean;
  readonly row: number;
  readonly value: EuroCents;
  readonly risk: Decimal | null;
  readonly products: ProductSummary[];
}

export interface CategoryState {
  readonly row: number;
  readonly label: string;
  readonly subtotal: EuroCents | null;
  readonly tracked: boolean;
  readonly contracts: ContractSummary[];
}

export function sumOf(values: readonly EuroCents[]): EuroCents | null {
  let sum = 0 as EuroCents | null;
  for (const value of values) {
    if (sum === null) return null;
    sum = addCents(sum, value);
  }
  return sum;
}

export function checkCategory(
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
      note(
        cellRef(contract.row, COLUMN.L),
        "the contract and its product show different risk figures (risk is not used)",
      );
    }
  }
}
