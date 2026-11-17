import type { ExpenseConflict, ExpenseSaveOutcome } from "../../../../applications/session/expense-model";
import type { IsoDate } from "../../../../core/values/iso-date";
import type { ExpenseAmounts, ExpenseCommand, ExpenseDay } from "../../../../core/expenses/work-expenses";
import type { ExpenseDraft } from "./expense-draft";

export type SaveRequest = Pick<ExpenseCommand, "date" | "amounts" | "expectedRevision">;
export interface ExpensesViewProps {
  readonly days: readonly ExpenseDay[];
  readonly history?: readonly ExpenseCommand[];
  readonly conflicts?: readonly ExpenseConflict[];
  readonly today: IsoDate;
  readonly mode: "signed-out" | "device-copy" | "online";
  readonly ready: boolean;
  readonly message?: string;
  readonly pending?: boolean;
  readonly onCheckPending?: () => Promise<ExpenseSaveOutcome>;
  readonly onSave: (request: SaveRequest) => Promise<ExpenseSaveOutcome>;
  readonly onRefresh?: () => Promise<void>;
  readonly onConnect?: () => Promise<void>;
  readonly onRevealAmounts?: () => void;
  readonly onDirtyChange?: (locked: boolean) => void;
}

export interface Editor {
  readonly date: IsoDate;
  readonly original: ExpenseAmounts;
  readonly revision: string | null;
  readonly draft: ExpenseDraft;
  readonly resolving: boolean;
}
