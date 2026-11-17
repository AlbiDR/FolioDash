import type { SourceRecord } from "../../applications/import/statement-source";
import type { CommandReceipt, LedgerStore, LoadResult, SourcesResult } from "../../applications/ledger/ledger-service";
import { canonicalJson } from "../../core/integrity/canonical-json";
import { type LedgerState, validateLedger } from "../../core/portfolio/ledger";
import { sha256Hex } from "../../core/integrity/sha256";
import {
  type CommitPayload,
  type Reference,
  DamagedLedger,
  checkedSources,
  commitOf,
  decodeRows,
  decodeSourceHistory,
  decodeSources,
  recordsChecksum,
} from "./row-ledger-decode";
import type { LedgerRow as LedgerRecord } from "./row-ledger-record";
import { REVISION_SOURCES_SCHEMA } from "./row-ledger-record";

/** One stored record. Every field is plain text so the sheet cannot retype it. */
export type LedgerRow = LedgerRecord;

/** The minimal sheet-like surface the store needs. Append-only: it can read all rows and add rows. */
export interface RowSheet {
  readRows(): readonly LedgerRow[];
  appendRows(rows: readonly LedgerRow[]): void;
  /** Forces pending writes to be durable before returning. */
  flush(): void;
}

// A single Google Sheets cell holds at most 50,000 characters; stay well inside it.
const MAX_PAYLOAD_LENGTH = 45_000;
const TIMELINE_PAGE = 250;
// A statement is written as pieces this long, so each stays well inside one cell even after JSON escaping.
const SOURCE_PIECE = 20_000;

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
