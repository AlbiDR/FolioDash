import { interpretFideuramSheet } from "../../../adapters/fideuram/FideuramLayout";
import { XLSX_LIMITS } from "../../../adapters/xlsx/XlsxError";
import { readXlsx } from "../../../adapters/xlsx/XlsxReader";
import { type IsoDate, toIsoDate } from "../../../core/IsoDate";
import { statementDateCandidate } from "../../../core/StatementDate";
import type { ImportFile, ImportPreparer, ImportReview, ReviewedSheet } from "../features/import/ImportModel";

/** The user's own calendar date for an instant, using the browser's time zone. */
export function browserLocalDate(milliseconds: number): IsoDate | null {
  const moment = new Date(milliseconds);
  return toIsoDate(moment.getFullYear(), moment.getMonth() + 1, moment.getDate());
}

/**
 * The composition root's import port: reads a spreadsheet, finds the sheets that
 * look like a bank holdings sheet, checks each one, and proposes a statement
 * date. Pure of storage and network, so it is testable with synthetic files.
 */
export function createImportPreparer(localDateOf: (milliseconds: number) => IsoDate | null): ImportPreparer {
  return async (file: ImportFile): Promise<ImportReview> => {
    if (file.size > XLSX_LIMITS.maxFileBytes) {
      return { status: "unreadable-file", message: "This file is larger than the supported size." };
    }
    const result = await readXlsx(await file.read());
    if (!result.ok) return { status: "unreadable-file", message: result.message };

    const sheets: ReviewedSheet[] = [];
    for (const entry of result.sheets) {
      const interpreted = interpretFideuramSheet(entry.sheet);
      if (!interpreted.ok && interpreted.issues.every((issue) => issue.code === "layout-not-found")) continue;
      sheets.push({
        name: entry.name,
        outcome: interpreted.ok
          ? { ok: true, statement: interpreted.statement }
          : { ok: false, issues: interpreted.issues },
      });
    }
    return {
      status: "reviewed",
      sheets,
      dateCandidate: statementDateCandidate({
        created: result.created,
        fileName: file.name,
        lastModified: file.lastModified,
        localDateOf,
      }),
    };
  };
}

export const prepareImport: ImportPreparer = createImportPreparer(browserLocalDate);
