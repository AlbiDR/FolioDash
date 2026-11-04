import type { SourceRecord } from "../../applications/StatementSource";
import type { CommandReceipt, LedgerStore, LoadResult, SourcesResult } from "../../applications/LedgerService";
import { canonicalJson } from "../../core/CanonicalJson";
import { type FundCommand } from "../../core/ImportPlan";
import { parseIsoDate } from "../../core/IsoDate";
import { type Fund, type LedgerState, type Snapshot, EMPTY_LEDGER, validateLedger } from "../../core/Ledger";
import { type StoredSheet, parseStoredSheet } from "../../core/RawSheet";
import { sha256Hex } from "../../core/Sha256";

/** One stored record. Every field is plain text so the sheet cannot retype it. */
export interface LedgerRow {
  /** The revision this record belongs to. */
  readonly revision: string;
  readonly type: "META" | "SNAPSHOT" | "TIMELINE" | "SOURCE" | "COMMIT";
  readonly payload: string;
  /** SHA-256 of the payload (for COMMIT, of the whole revision's records). */
  readonly checksum: string;
}

/** The minimal sheet-like surface the store needs. Append-only: it can read all rows and add rows. */
export interface RowSheet {
  readRows(): readonly LedgerRow[];
  appendRows(rows: readonly LedgerRow[]): void;
  /** Forces pending writes to be durable before returning. */
  flush(): void;
}

export const SCHEMA = 1;
// A single Google Sheets cell holds at most 50,000 characters; stay well inside it.
const MAX_PAYLOAD_LENGTH = 45_000;
const TIMELINE_PAGE = 250;
// A statement is written as pieces this long, so each stays well inside one cell even after JSON escaping.
const SOURCE_PIECE = 20_000;

type Reference = readonly [index: number, checksum: string];

interface Meta {
  readonly schema: number;
  readonly funds: readonly Fund[];
}

interface CommitPayload {
  readonly count: number;
  readonly commandId: string;
  readonly requestHash: string;
}

interface Decoded {
  readonly state: LedgerState;
  readonly references: readonly Reference[];
  readonly trailing: number;
}

class DamagedLedger extends Error {}

function damaged(message: string): never {
  throw new DamagedLedger(message);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return damaged("A stored record is not valid JSON.");
  }
}

function recordsChecksum(rows: readonly { readonly type: string; readonly payload: string }[]): string {
  return sha256Hex(canonicalJson(rows.map((row) => [row.type, row.payload])));
}

function decodeRows(rows: readonly LedgerRow[]): Decoded {
  let commitIndex = -1;
  rows.forEach((row, index) => {
    if (row.type === "COMMIT") commitIndex = index;
  });
  if (commitIndex < 0) return { state: EMPTY_LEDGER, references: [], trailing: rows.length };

  const commit = rows[commitIndex];
  if (commit === undefined) return damaged("The commit record is missing.");
  let start = commitIndex - 1;
  while (start >= 0 && rows[start]?.revision === commit.revision) start--;
  const payload = rows.slice(start + 1, commitIndex);

  for (const row of payload) {
    if (row.checksum !== sha256Hex(row.payload)) return damaged("A committed record failed its checksum.");
  }
  const first = payload[0];
  if (first?.type !== "META") return damaged("The committed revision has no header record.");
  if (!payload.slice(1).every((row) => row.type === "SNAPSHOT" || row.type === "TIMELINE" || row.type === "SOURCE") || !payload.some((row) => row.type === "TIMELINE")) {
    return damaged("The committed revision has an invalid structure.");
  }
  const commitPayload = parseJson(commit.payload) as CommitPayload;
  if (commitPayload.count !== payload.length || commit.checksum !== recordsChecksum(payload)) {
    return damaged("The commit record does not match the revision it closes.");
  }

  const meta = parseJson(first.payload) as Meta;
  if (meta.schema !== SCHEMA) return damaged("The ledger uses an unsupported format version.");
  const references = payload
    .filter((row) => row.type === "TIMELINE")
    .flatMap((row) => parseJson(row.payload) as Reference[]);
  const snapshots: Snapshot[] = references.map(([index, checksum]) => {
    const row = rows[index];
    // References point only at earlier snapshot records that were committed.
    if (!Number.isInteger(index) || index < 0 || index >= commitIndex || row?.type !== "SNAPSHOT") {
      return damaged("A snapshot reference is invalid.");
    }
    if (row.checksum !== checksum || sha256Hex(row.payload) !== checksum) return damaged("A snapshot record failed its checksum.");
    return parseJson(row.payload) as Snapshot;
  });

  const state: LedgerState = { revision: commit.revision, funds: meta.funds, snapshots };
  const issues = validateLedger(state);
  if (issues.length > 0) return damaged("The committed ledger breaks its own rules.");
  return { state, references, trailing: rows.length - commitIndex - 1 };
}

function decodeSources(rows: readonly LedgerRow[]): SourceRecord[] {
  const found: SourceRecord[] = [];
  rows.forEach((commit, commitIndex) => {
    if (commit.type !== "COMMIT") return;
    let start = commitIndex - 1;
    while (start >= 0 && rows[start]?.revision === commit.revision) start--;
    const block = rows.slice(start + 1, commitIndex);
    const pieces = block.filter((row) => row.type === "SOURCE");
    if (pieces.length === 0) return;
    // The revision these pieces belong to must itself be intact.
    for (const row of block) {
      if (row.checksum !== sha256Hex(row.payload)) return damaged("A stored statement failed its checksum.");
    }
    const commitPayload = parseJson(commit.payload) as CommitPayload;
    if (commitPayload.count !== block.length || commit.checksum !== recordsChecksum(block)) {
      return damaged("A stored statement belongs to a revision that does not match its commit record.");
    }
    const parsed = pieces.map((row) => parseJson(row.payload) as { readonly d?: unknown; readonly k?: unknown; readonly n?: unknown });
    // A revision can hold several statements, each as consecutive pieces numbered from zero.
    let at = 0;
    while (at < parsed.length) {
      const count = parsed[at]?.n;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || at + count > parsed.length) return damaged("A stored statement is missing a piece.");
      const group = parsed.slice(at, at + count);
      if (!group.every((piece, index) => piece.k === index && piece.n === count && typeof piece.d === "string")) return damaged("A stored statement is missing a piece.");
      at += count;
      const value = parseJson(group.map((piece) => String(piece.d)).join("")) as Record<string, unknown>;
      const date = typeof value["date"] === "string" ? parseIsoDate(value["date"]) : null;
      const sheet = parseStoredSheet(value["sheet"]);
      if (date === null || sheet === null || typeof value["commandId"] !== "string" || typeof value["sheetName"] !== "string" || !Array.isArray(value["commands"])) {
        return damaged("A stored statement is not in the expected form.");
      }
      found.push({ date, commandId: value["commandId"], sheetName: value["sheetName"], commands: value["commands"] as FundCommand[], sheet: value["sheet"] as StoredSheet });
    }
  });
  return found;
}

/**
 * Stores the ledger as append-only checksummed rows in a sheet. A revision is a
 * header record, any new snapshot records, a timeline of references and finally
 * one commit record. Readers only trust a revision whose commit record matches;
 * rows after the last commit are an interrupted write and are ignored.
 */
export class RowLedgerStore implements LedgerStore {
  private readonly sheet: RowSheet;

  constructor(sheet: RowSheet) {
    this.sheet = sheet;
  }

  load(): LoadResult {
    try {
      const decoded = decodeRows(this.sheet.readRows());
      return { status: "ok", state: decoded.state, ignoredTrailingRows: decoded.trailing };
    } catch (error) {
      if (error instanceof DamagedLedger) return { status: "damaged", message: error.message };
      throw error;
    }
  }

  /**
   * Reads back every stored bank statement. Each piece must pass its checksum and
   * belong to a revision that was committed whole; anything else is reported as
   * damaged and nothing is returned.
   */
  loadSources(): SourcesResult {
    try {
      return { status: "ok", sources: decodeSources(this.sheet.readRows()) };
    } catch (error) {
      if (error instanceof DamagedLedger) return { status: "damaged", message: error.message };
      throw error;
    }
  }

  findCommand(commandId: string): CommandReceipt | null {
    for (const row of this.sheet.readRows()) {
      if (row.type !== "COMMIT") continue;
      const payload = parseJson(row.payload) as CommitPayload;
      if (payload.commandId === commandId) return { commandId, revision: row.revision, requestHash: payload.requestHash };
    }
    return null;
  }

  publish(next: LedgerState, receipt: CommandReceipt, sources: readonly SourceRecord[] = []): void {
    const existing = this.sheet.readRows();
    const decoded = decodeRows(existing);
    const previousByDate = new Map(decoded.state.snapshots.map((snapshot, index) => [snapshot.date, { snapshot, reference: decoded.references[index] }]));

    const records: { type: LedgerRow["type"]; payload: string }[] = [
      { type: "META", payload: canonicalJson({ schema: SCHEMA, funds: next.funds }) },
    ];
    const references: Reference[] = [];
    for (const snapshot of next.snapshots) {
      const json = canonicalJson(snapshot);
      const previous = previousByDate.get(snapshot.date);
      if (previous?.reference !== undefined && canonicalJson(previous.snapshot) === json) {
        references.push(previous.reference);
        continue;
      }
      references.push([existing.length + records.length, sha256Hex(json)]);
      records.push({ type: "SNAPSHOT", payload: json });
    }
    if (references.length === 0) records.push({ type: "TIMELINE", payload: "[]" });
    for (let offset = 0; offset < references.length; offset += TIMELINE_PAGE) {
      records.push({ type: "TIMELINE", payload: canonicalJson(references.slice(offset, offset + TIMELINE_PAGE)) });
    }
    for (const source of sources) {
      const text = canonicalJson(source);
      const pieces: string[] = [];
      for (let offset = 0; offset < text.length; offset += SOURCE_PIECE) pieces.push(text.slice(offset, offset + SOURCE_PIECE));
      pieces.forEach((piece, index) => {
        records.push({ type: "SOURCE", payload: canonicalJson({ d: piece, k: index, n: pieces.length }) });
      });
    }
    if (records.some((record) => record.payload.length > MAX_PAYLOAD_LENGTH)) {
      throw new Error("A ledger record exceeds the safe cell size. Nothing was written.");
    }

    const rows = records.map((record): LedgerRow => ({
      revision: next.revision,
      type: record.type,
      payload: record.payload,
      checksum: sha256Hex(record.payload),
    }));
    this.sheet.appendRows(rows);
    this.sheet.flush();

    const commitPayload: CommitPayload = { count: rows.length, commandId: receipt.commandId, requestHash: receipt.requestHash };
    this.sheet.appendRows([
      { revision: next.revision, type: "COMMIT", payload: canonicalJson(commitPayload), checksum: recordsChecksum(rows) },
    ]);
    this.sheet.flush();
  }
}
