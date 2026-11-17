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
/** Version 2 stores the complete effective set of sources in each revision. */
export const REVISION_SOURCES_SCHEMA = 2;
// A single Google Sheets cell holds at most 50,000 characters; stay well inside it.
const MAX_PAYLOAD_LENGTH = 45_000;
const TIMELINE_PAGE = 250;
// A statement is written as pieces this long, so each stays well inside one cell even after JSON escaping.
const SOURCE_PIECE = 20_000;

type Reference = readonly [index: number, checksum: string];

interface Meta {
  readonly schema: number;
  readonly funds: readonly Fund[];
  readonly recoveryTarget: string | null;
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
  readonly schema: number;
  readonly recoveryTarget: string | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The commit payload is not covered by a checksum, so its shape is checked before anything relies on it. */
function commitOf(text: string): CommitPayload {
  const value = parseJson(text);
  if (!isRecord(value)) return damaged("A commit record is not in the expected form.");
  const { count, commandId, requestHash } = value;
  if (
    typeof count !== "number" ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    typeof commandId !== "string" ||
    typeof requestHash !== "string"
  ) {
    return damaged("A commit record is not in the expected form.");
  }
  return { count, commandId, requestHash };
}

function metaOf(text: string): Meta {
  const value = parseJson(text);
  if (!isRecord(value) || typeof value["schema"] !== "number" || !Array.isArray(value["funds"])) {
    return damaged("The ledger header is not in the expected form.");
  }
  const recovery = value["recoveryTarget"];
  if (recovery !== undefined && recovery !== null && (typeof recovery !== "string" || recovery.length === 0))
    return damaged("The recovery reference is invalid.");
  return { schema: value["schema"], funds: value["funds"] as Fund[], recoveryTarget: recovery ?? null };
}

function referencesOf(text: string): Reference[] {
  const value = parseJson(text);
  const valid =
    Array.isArray(value) &&
    value.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[1] === "string");
  if (!valid) return damaged("The ledger timeline is not in the expected form.");
  return value as Reference[];
}

function recordsChecksum(rows: readonly { readonly type: string; readonly payload: string }[]): string {
  return sha256Hex(canonicalJson(rows.map((row) => [row.type, row.payload])));
}

function decodeRows(rows: readonly LedgerRow[]): Decoded {
  let commitIndex = -1;
  rows.forEach((row, index) => {
    if (row.type !== "COMMIT") return;
    commitOf(row.payload);
    commitIndex = index;
  });
  if (commitIndex < 0)
    return { state: EMPTY_LEDGER, references: [], trailing: rows.length, schema: SCHEMA, recoveryTarget: null };

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
  if (
    !payload.slice(1).every((row) => row.type === "SNAPSHOT" || row.type === "TIMELINE" || row.type === "SOURCE") ||
    !payload.some((row) => row.type === "TIMELINE")
  ) {
    return damaged("The committed revision has an invalid structure.");
  }
  const commitPayload = commitOf(commit.payload);
  if (commitPayload.count !== payload.length || commit.checksum !== recordsChecksum(payload)) {
    return damaged("The commit record does not match the revision it closes.");
  }

  const meta = metaOf(first.payload);
  if (meta.schema !== SCHEMA && meta.schema !== REVISION_SOURCES_SCHEMA)
    return damaged("The ledger uses an unsupported format version.");
  if (meta.schema === SCHEMA) {
    // A stale older client could have prepared an append before the upgrade.
    // Never accept a subsequent legacy revision as a silent format downgrade.
    let header: LedgerRow | undefined;
    for (let index = 0; index <= start; index++) {
      const row = rows[index];
      if (row?.type === "META") header = row;
      if (
        row?.type === "COMMIT" &&
        header?.revision === row.revision &&
        metaOf(header.payload).schema === REVISION_SOURCES_SCHEMA
      )
        return damaged(
          "The ledger was changed by an older version after its format was upgraded. Recovery is required.",
        );
    }
  }
  const references = payload.filter((row) => row.type === "TIMELINE").flatMap((row) => referencesOf(row.payload));
  const snapshots: Snapshot[] = references.map(([index, checksum]) => {
    const row = rows[index];
    // References point only at earlier snapshot records that were committed.
    if (!Number.isInteger(index) || index < 0 || index >= commitIndex || row?.type !== "SNAPSHOT") {
      return damaged("A snapshot reference is invalid.");
    }
    if (row.checksum !== checksum || sha256Hex(row.payload) !== checksum)
      return damaged("A snapshot record failed its checksum.");
    return parseJson(row.payload) as Snapshot;
  });

  const state: LedgerState = { revision: commit.revision, funds: meta.funds, snapshots };
  const issues = validateLedger(state);
  if (issues.length > 0) return damaged("The committed ledger breaks its own rules.");
  return {
    state,
    references,
    trailing: rows.length - commitIndex - 1,
    schema: meta.schema,
    recoveryTarget: meta.recoveryTarget,
  };
}

function decodeSourceHistory(rows: readonly LedgerRow[]): {
  readonly sources: SourceRecord[];
  readonly references: ReadonlyMap<string, number>;
} {
  const found: SourceRecord[] = [];
  const references = new Map<string, number>();
  const byIndex = new Map<number, { readonly source: SourceRecord; readonly hash: string }>();
  rows.forEach((commit, commitIndex) => {
    if (commit.type !== "COMMIT") return;
    let start = commitIndex - 1;
    while (start >= 0 && rows[start]?.revision === commit.revision) start--;
    const block = rows.slice(start + 1, commitIndex);
    const header = block[0];
    if (header?.type !== "META") return damaged("A source revision has no ledger header.");
    const meta = metaOf(header.payload);
    if (meta.schema !== SCHEMA && meta.schema !== REVISION_SOURCES_SCHEMA)
      return damaged("The ledger uses an unsupported format version.");
    const pieces = block.flatMap((row, index) => (row.type === "SOURCE" ? [{ row, index: start + 1 + index }] : []));
    if (pieces.length === 0 && meta.schema === SCHEMA) return;
    // The revision these pieces belong to must itself be intact.
    for (const row of block) {
      if (row.checksum !== sha256Hex(row.payload)) return damaged("A stored statement failed its checksum.");
    }
    const commitPayload = commitOf(commit.payload);
    if (commitPayload.count !== block.length || commit.checksum !== recordsChecksum(block)) {
      return damaged("A stored statement belongs to a revision that does not match its commit record.");
    }
    // A version 2 revision is a complete source set, including an empty set.
    if (meta.schema === REVISION_SOURCES_SCHEMA) found.length = 0;
    const parsed = pieces.map((piece) => ({ value: parseJson(piece.row.payload), index: piece.index }));
    // A revision can hold several statements, each as consecutive pieces numbered from zero.
    let at = 0;
    while (at < parsed.length) {
      const current = parsed[at];
      if (current === undefined || !isRecord(current.value))
        return damaged("A stored statement is not in the expected form.");
      if ("r" in current.value) {
        if (
          meta.schema !== REVISION_SOURCES_SCHEMA ||
          !Number.isSafeInteger(current.value["r"]) ||
          typeof current.value["h"] !== "string"
        )
          return damaged("A stored statement reference is invalid.");
        const reference = byIndex.get(current.value["r"] as number);
        if (
          reference === undefined ||
          reference.hash !== current.value["h"] ||
          (current.value["r"] as number) >= current.index
        )
          return damaged("A stored statement reference is invalid.");
        found.push(reference.source);
        at++;
        continue;
      }
      const count = current.value["n"];
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || at + count > parsed.length)
        return damaged("A stored statement is missing a piece.");
      const group = parsed.slice(at, at + count);
      if (
        !group.every(
          (piece, index) =>
            isRecord(piece.value) &&
            piece.value["k"] === index &&
            piece.value["n"] === count &&
            typeof piece.value["d"] === "string",
        )
      )
        return damaged("A stored statement is missing a piece.");
      at += count;
      const value = parseJson(group.map((piece) => String((piece.value as Record<string, unknown>)["d"])).join(""));
      if (!isRecord(value)) return damaged("A stored statement is not in the expected form.");
      const date = typeof value["date"] === "string" ? parseIsoDate(value["date"]) : null;
      const sheet = parseStoredSheet(value["sheet"]);
      if (
        date === null ||
        sheet === null ||
        typeof value["commandId"] !== "string" ||
        typeof value["sheetName"] !== "string" ||
        !Array.isArray(value["commands"])
      ) {
        return damaged("A stored statement is not in the expected form.");
      }
      const source = {
        date,
        commandId: value["commandId"],
        sheetName: value["sheetName"],
        commands: value["commands"] as FundCommand[],
        sheet: value["sheet"] as StoredSheet,
      };
      found.push(source);
      const hash = sha256Hex(canonicalJson(source));
      byIndex.set(current.index, { source, hash });
      references.set(hash, current.index);
    }
    if (meta.schema === REVISION_SOURCES_SCHEMA && new Set(found.map((source) => source.date)).size !== found.length)
      return damaged("The revision contains multiple sources for the same date.");
  });
  return { sources: found, references };
}

function decodeSources(rows: readonly LedgerRow[]): SourceRecord[] {
  return decodeSourceHistory(rows).sources;
}

function checkedSources(rows: readonly LedgerRow[], decoded: Decoded): SourceRecord[] {
  const sources = decodeSources(rows);
  if (decoded.schema === REVISION_SOURCES_SCHEMA) {
    const dates = new Set(decoded.state.snapshots.map((snapshot) => snapshot.date));
    if (sources.some((source) => !dates.has(source.date)))
      return damaged("A stored bank statement does not belong to this revision.");
  }
  return sources;
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
      const rows = this.sheet.readRows();
      const decoded = decodeRows(rows);
      if (decoded.schema === REVISION_SOURCES_SCHEMA) checkedSources(rows, decoded);
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

  /** Read a complete committed revision and its then-effective sources without writing. */
  loadRevision(revision: string):
    | {
        readonly status: "ok";
        readonly state: LedgerState;
        readonly sources: readonly SourceRecord[];
        readonly recoveryTarget?: string;
      }
    | { readonly status: "damaged"; readonly message: string } {
    try {
      const rows = this.sheet.readRows();
      const matches = rows.flatMap((row, index) => (row.type === "COMMIT" && row.revision === revision ? [index] : []));
      if (matches.length !== 1 || matches[0] === undefined)
        return { status: "damaged", message: "The requested revision is missing or ambiguous." };
      const prefix = rows.slice(0, matches[0] + 1);
      const decoded = decodeRows(prefix);
      return {
        status: "ok",
        state: decoded.state,
        sources: checkedSources(prefix, decoded),
        ...(decoded.recoveryTarget === null ? {} : { recoveryTarget: decoded.recoveryTarget }),
      };
    } catch (error) {
      if (error instanceof DamagedLedger) return { status: "damaged", message: error.message };
      throw error;
    }
  }

  recoveryTarget(): string | null {
    return decodeRows(this.sheet.readRows()).recoveryTarget;
  }

  /** Callers must call load() first: it validates every commit record, so this cannot meet a malformed one. */
  findCommand(commandId: string): CommandReceipt | null {
    for (const row of this.sheet.readRows()) {
      if (row.type !== "COMMIT") continue;
      const payload = commitOf(row.payload);
      if (payload.commandId === commandId)
        return { commandId, revision: row.revision, requestHash: payload.requestHash };
    }
    return null;
  }

  publish(next: LedgerState, receipt: CommandReceipt, sources: readonly SourceRecord[] = []): void {
    this.publishRevision(next, receipt, sources, false);
  }

  /** Publish a reviewed replacement with its complete set of effective sources. */
  publishWithSources(
    next: LedgerState,
    receipt: CommandReceipt,
    sources: readonly SourceRecord[],
    recoveryTarget?: string | null,
  ): void {
    if (validateLedger(next).length > 0 || receipt.revision !== next.revision || next.revision === "")
      throw new Error("The replacement revision is invalid.");
    this.publishRevision(next, receipt, sources, true, recoveryTarget);
  }

  private publishRevision(
    next: LedgerState,
    receipt: CommandReceipt,
    sources: readonly SourceRecord[],
    replaceSources: boolean,
    recoveryTarget?: string | null,
  ): void {
    const existing = this.sheet.readRows();
    const decoded = decodeRows(existing);
    const schema = replaceSources ? REVISION_SOURCES_SCHEMA : decoded.schema;
    const sourceHistory = schema === REVISION_SOURCES_SCHEMA ? decodeSourceHistory(existing) : null;
    const effectiveSources =
      schema === REVISION_SOURCES_SCHEMA && !replaceSources ? [...(sourceHistory?.sources ?? []), ...sources] : sources;
    if (
      schema === REVISION_SOURCES_SCHEMA &&
      new Set(effectiveSources.map((source) => source.date)).size !== effectiveSources.length
    )
      throw new Error("A revision cannot contain multiple sources for one date.");
    if (
      schema === REVISION_SOURCES_SCHEMA &&
      effectiveSources.some((source) => !next.snapshots.some((snapshot) => snapshot.date === source.date))
    )
      throw new Error("A source does not belong to the revision.");
    const previousByDate = new Map(
      decoded.state.snapshots.map((snapshot, index) => [
        snapshot.date,
        { snapshot, reference: decoded.references[index] },
      ]),
    );

    const records: { type: LedgerRow["type"]; payload: string }[] = [
      {
        type: "META",
        payload: canonicalJson({
          schema,
          funds: next.funds,
          ...(schema === REVISION_SOURCES_SCHEMA
            ? { recoveryTarget: recoveryTarget === undefined ? decoded.recoveryTarget : recoveryTarget }
            : {}),
        }),
      },
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
    for (const source of effectiveSources) {
      const text = canonicalJson(source);
      const hash = sha256Hex(text);
      const reference = sourceHistory?.references.get(hash);
      if (reference !== undefined) {
        records.push({ type: "SOURCE", payload: canonicalJson({ r: reference, h: hash }) });
        continue;
      }
      const pieces: string[] = [];
      for (let offset = 0; offset < text.length; offset += SOURCE_PIECE)
        pieces.push(text.slice(offset, offset + SOURCE_PIECE));
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

    const commitPayload: CommitPayload = {
      count: rows.length,
      commandId: receipt.commandId,
      requestHash: receipt.requestHash,
    };
    this.sheet.appendRows([
      {
        revision: next.revision,
        type: "COMMIT",
        payload: canonicalJson(commitPayload),
        checksum: recordsChecksum(rows),
      },
    ]);
    this.sheet.flush();
  }
}
