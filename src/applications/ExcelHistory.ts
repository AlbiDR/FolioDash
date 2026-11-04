import type { ImportFile, ImportPreparer, ReviewedSheet } from "./ImportModel";
import { MAX_HISTORY_STATEMENTS } from "./HistoryImport";
import { parseIsoDate, type IsoDate } from "../core/IsoDate";
import type { LedgerState } from "../core/Ledger";
import { statementDateIssue } from "../core/ImportPlan";

/** Provisional device-memory bounds, separate from each XLSX reader's limits. */
export const EXCEL_HISTORY_LIMITS = { files: 240, bytes: 60 * 1024 * 1024, sheets: MAX_HISTORY_STATEMENTS, cells: 300_000 } as const;

/** Full dates only: a month without its day/year cannot establish a statement date. */
export function dateInSheetName(name: string): IsoDate | null {
  const dates = [...name.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)|(?<!\d)(\d{2})[./-](\d{2})[./-](\d{4})(?!\d)/gu)]
    .map((match) => parseIsoDate(match[1] === undefined ? `${match[6] ?? ""}-${match[5] ?? ""}-${match[4] ?? ""}` : match[0]));
  return dates.length === 1 ? (dates[0] ?? null) : null;
}

export interface ExcelHistoryEntry {
  readonly id: string;
  readonly fileName: string;
  readonly sheet: ReviewedSheet;
  readonly date: string;
  readonly selected: boolean;
}

export interface ExcelHistoryReview {
  readonly entries: readonly ExcelHistoryEntry[];
  readonly problems: readonly string[];
  readonly notices: readonly string[];
}

/** Sequential parsing bounds peak decompression and keeps all failures visible before any write. */
export async function prepareExcelHistory(files: readonly ImportFile[], prepare: ImportPreparer): Promise<ExcelHistoryReview> {
  if (files.length === 0 || files.length > EXCEL_HISTORY_LIMITS.files || files.reduce((sum, file) => sum + file.size, 0) > EXCEL_HISTORY_LIMITS.bytes) {
    return { entries: [], notices: [], problems: ["Choose up to 240 Excel files totalling no more than 60 MiB."] };
  }
  const entries: ExcelHistoryEntry[] = [];
  const problems: string[] = [];
  const notices: string[] = [];
  let cells = 0;
  for (const [fileIndex, file] of files.entries()) {
    try {
      const review = await prepare(file);
      if (review.status === "unreadable-file") {
        problems.push(`${file.name}: ${review.message}`);
        continue;
      }
      if (review.sheets.length === 0) problems.push(`${file.name}: no supported Fideuram holdings sheet was found.`);
      for (const name of review.ignoredSheets ?? []) notices.push(`${file.name} / ${name}: no supported holdings layout; this sheet is not included.`);
      for (const [sheetIndex, sheet] of review.sheets.entries()) {
        cells += sheet.raw.rows.reduce((count, row) => count + row.length, 0);
        if (entries.length >= EXCEL_HISTORY_LIMITS.sheets || cells > EXCEL_HISTORY_LIMITS.cells) {
          return { entries: [], notices, problems: ["This selection exceeds 240 statements or 300,000 cells. Choose a smaller group of files."] };
        }
        entries.push({
          id: `${String(fileIndex)}-${String(sheetIndex)}`,
          fileName: file.name,
          sheet,
          // A combined workbook's metadata dates the container, not its individual statements.
          date: sheet.dateCandidate ?? ((review.workbookSheetCount ?? review.sheets.length) === 1 ? review.dateCandidate?.date : null) ?? "",
          selected: true,
        });
      }
    } catch {
      problems.push(`${file.name}: the file could not be read. Choose a fresh bank export.`);
    }
  }
  return { entries, problems, notices };
}

export type ExcelHistoryPlan =
  | { readonly ok: true; readonly entries: readonly (ExcelHistoryEntry & { readonly date: IsoDate })[] }
  | { readonly ok: false; readonly messages: readonly string[] };

/** Refuse ambiguity before collecting cash decisions. No financial state is changed here. */
export function planExcelHistory(entries: readonly ExcelHistoryEntry[], ledger: LedgerState): ExcelHistoryPlan {
  const messages: string[] = [];
  const dates = new Set<string>();
  const latest = ledger.snapshots.at(-1)?.date;
  const selected = entries.filter((entry) => entry.selected);
  if (selected.length === 0) messages.push("Select at least one statement.");
  const ready: (ExcelHistoryEntry & { readonly date: IsoDate })[] = [];
  for (const entry of selected) {
    const label = `${entry.fileName} / ${entry.sheet.name}`;
    const date = parseIsoDate(entry.date);
    if (!entry.sheet.outcome.ok) messages.push(`${label}: fix the reported sheet problems or exclude this statement.`);
    if (date === null) messages.push(`${label}: choose a complete statement date.`);
    else {
      if (dates.has(date)) messages.push(`${date}: more than one statement has this date. Correct the dates or exclude a duplicate.`);
      if (latest !== undefined && date <= latest) messages.push(`${label}: ${date} is on or before your latest recorded statement (${latest}). Exclude it; earlier history cannot be inserted through this import.`);
      dates.add(date);
      ready.push({ ...entry, date });
    }
  }
  ready.sort((a, b) => a.date.localeCompare(b.date));
  let previous = latest;
  for (const entry of ready) {
    if (statementDateIssue(entry.date, previous) !== null) messages.push(`${entry.fileName} / ${entry.sheet.name}: choose only one statement per calendar month, after the latest saved month.`);
    previous = entry.date;
  }
  return messages.length > 0 ? { ok: false, messages } : { ok: true, entries: ready };
}
