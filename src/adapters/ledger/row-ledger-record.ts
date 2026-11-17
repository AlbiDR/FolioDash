/** One stored record. Every field is plain text so the sheet cannot retype it. */
export interface LedgerRow {
  /** The revision this record belongs to. */
  readonly revision: string;
  readonly type: "META" | "SNAPSHOT" | "TIMELINE" | "SOURCE" | "COMMIT";
  readonly payload: string;
  /** SHA-256 of the payload (for COMMIT, of the whole revision's records). */
  readonly checksum: string;
}

export const SCHEMA = 1;
/** Version 2 stores the complete effective set of sources in each revision. */
export const REVISION_SOURCES_SCHEMA = 2;
