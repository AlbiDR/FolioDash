import type { ExcelHistoryEntry } from "../../../../applications/import/excel-history";
import type { RecordResult } from "../../../../applications/import/import-model";
import type { IsoDate } from "../../../../core/values/iso-date";

export type Stage = "dates" | "questions" | "confirm" | "saving" | "stopped" | "done";
export type Failure = Exclude<RecordResult, { status: "recorded" }>;
export type DatedEntry = ExcelHistoryEntry & { readonly date: IsoDate };
