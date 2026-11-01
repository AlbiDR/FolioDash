import { type IsoDate, parseIsoDate } from "./IsoDate";

export type DateSource = "file-created" | "file-name" | "file-modified";

export interface DateCandidate {
  readonly date: IsoDate;
  readonly source: DateSource;
}

const DATE_IN_NAME = /(\d{4}-\d{2}-\d{2})/u;

/**
 * Proposes the statement date for an exported file. The bank exports only the
 * current state, so the date is the day the export was made. In order of
 * trust: the creation time stored in the file, a date in the file name (present
 * only if the owner renamed it), then the file's last-modified time. Each
 * instant is turned into a date in the user's own time zone by `localDateOf`,
 * because the UTC date can be the previous day shortly after midnight.
 *
 * This is only a proposal. The user confirms the date; a file name or a
 * timestamp is never proof (CleanStack 6.2).
 */
export function statementDateCandidate(input: {
  readonly created: string | null;
  readonly fileName: string;
  readonly lastModified: number | null;
  readonly localDateOf: (milliseconds: number) => IsoDate | null;
}): DateCandidate | null {
  if (input.created !== null) {
    const instant = Date.parse(input.created);
    if (!Number.isNaN(instant)) {
      const date = input.localDateOf(instant);
      if (date !== null) return { date, source: "file-created" };
    }
  }
  const named = DATE_IN_NAME.exec(input.fileName);
  const fromName = named ? parseIsoDate(named[1] ?? "") : null;
  if (fromName !== null) return { date: fromName, source: "file-name" };
  if (input.lastModified !== null) {
    const date = input.localDateOf(input.lastModified);
    if (date !== null) return { date, source: "file-modified" };
  }
  return null;
}
