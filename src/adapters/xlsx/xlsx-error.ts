export type XlsxErrorCode =
  | "not-a-zip"
  | "unsupported-zip"
  | "corrupt"
  | "limit-exceeded"
  | "malformed-xml"
  | "missing-part"
  | "unsupported-content";

/** A typed failure to read a spreadsheet file. The message is safe to show to the user. */
export class XlsxError extends Error {
  readonly code: XlsxErrorCode;

  constructor(code: XlsxErrorCode, message: string) {
    super(message);
    this.name = "XlsxError";
    this.code = code;
  }
}

/** Named, bounded limits. Provisional until measured on real devices (FD-012). */
export interface XlsxLimits {
  readonly maxFileBytes: number;
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxTotalBytes: number;
  readonly maxXmlDepth: number;
  readonly maxXmlElements: number;
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
}

const MEBIBYTE = 1024 * 1024;

export const XLSX_LIMITS: XlsxLimits = {
  maxFileBytes: 15 * MEBIBYTE,
  maxEntries: 500,
  maxEntryBytes: 20 * MEBIBYTE,
  maxTotalBytes: 60 * MEBIBYTE,
  maxXmlDepth: 64,
  maxXmlElements: 500_000,
  maxRows: 20_000,
  maxColumns: 64,
  maxCells: 300_000,
};
