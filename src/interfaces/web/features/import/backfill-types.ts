import type { ManualRow } from "./manual-statement";

export interface DraftRow extends ManualRow {
  readonly id: number;
}
export type Stage = "values" | "opening" | "more" | "boundary" | "preview" | "saving" | "unknown" | "restart" | "done";
