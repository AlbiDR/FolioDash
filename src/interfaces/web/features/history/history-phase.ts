import type { HistoryStatement } from "../../../../applications/import/history-import";
import type { RecordResult } from "../../../../applications/import/import-model";

export type Phase =
  | { readonly name: "idle" }
  | { readonly name: "reading" }
  | { readonly name: "problem"; readonly message: string }
  | {
      readonly name: "ready";
      readonly statements: readonly HistoryStatement[];
      readonly alreadyRecorded: number;
      readonly toSave: readonly HistoryStatement[];
    }
  | { readonly name: "attaching" }
  | {
      readonly name: "attach-stopped";
      readonly failure: RecordResult;
      readonly commandId: string;
      readonly statements: readonly HistoryStatement[];
    }
  | { readonly name: "saving"; readonly saved: number; readonly total: number }
  | { readonly name: "done"; readonly saved: number; readonly total: number; readonly attached: number }
  | {
      readonly name: "stopped";
      readonly saved: number;
      readonly statement: HistoryStatement;
      readonly failure: RecordResult;
      readonly statements: readonly HistoryStatement[];
    }
  | { readonly name: "checked"; readonly message: string };

export function describeFailure(failure: RecordResult): string {
  switch (failure.status) {
    case "not-saved":
      return `${failure.message} Nothing from this statement was recorded.`;
    case "stale":
      return "The ledger in the spreadsheet changed while this ran. Nothing from this statement was recorded.";
    case "rejected":
      return `The service did not accept this statement: ${failure.messages.join(" ")} Nothing from it was recorded.`;
    case "damaged":
      return `${failure.message} Do not record anything until the ledger is restored.`;
    case "saved-not-reloaded":
      return "This statement was recorded, but the ledger could not be read back.";
    case "unknown":
      return failure.message;
    case "recorded":
      return "";
  }
}
