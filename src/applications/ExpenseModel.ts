import type { IsoDate } from "../core/IsoDate";
import type { ExpenseAmounts, ExpenseDay } from "../core/WorkExpenses";

export interface ExpenseConflict {
  readonly date: IsoDate;
  /** Opaque revision of every unresolved sibling; resolution must acknowledge this whole set. */
  readonly revision: string;
  readonly versions: readonly { readonly revision: string; readonly amounts: ExpenseAmounts }[];
}

/** Acknowledged records and a rebuildable view have different success states. */
export type ExpenseSaveOutcome =
  | { readonly status: "saved"; readonly days: readonly ExpenseDay[]; readonly viewUpdated: boolean }
  | { readonly status: "conflict"; readonly days: readonly ExpenseDay[]; readonly conflicts?: readonly ExpenseConflict[]; readonly message: string }
  | { readonly status: "not-saved"; readonly message: string }
  | { readonly status: "unknown"; readonly message: string };

export type ExpenseReadOutcome =
  | { readonly status: "ok"; readonly days: readonly ExpenseDay[] }
  | { readonly status: "absent" }
  | { readonly status: "damaged"; readonly message: string }
  | { readonly status: "unavailable"; readonly message: string };
