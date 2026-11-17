import type { SourceRecord } from "../../applications/import/statement-source";
import { canonicalJson } from "../../core/integrity/canonical-json";
import { type FundCommand } from "../../core/statements/import-plan";
import { parseIsoDate } from "../../core/values/iso-date";
import { type Fund, type LedgerState, type Snapshot, EMPTY_LEDGER, validateLedger } from "../../core/portfolio/ledger";
import { type StoredSheet, parseStoredSheet } from "../../core/statements/raw-sheet";
import { sha256Hex } from "../../core/integrity/sha256";
import type { LedgerRow } from "./row-ledger-record";
import { REVISION_SOURCES_SCHEMA, SCHEMA } from "./row-ledger-record";

export type Reference = readonly [index: number, checksum: string];

interface Meta {
  readonly schema: number;
  readonly funds: readonly Fund[];
  readonly recoveryTarget: string | null;
}

export interface CommitPayload {
  readonly count: number;
  readonly commandId: string;
  readonly requestHash: string;
}

export interface Decoded {
  readonly state: LedgerState;
  readonly references: readonly Reference[];
  readonly trailing: number;
  readonly schema: number;
  readonly recoveryTarget: string | null;
}

export class DamagedLedger extends Error {}

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
export function commitOf(text: string): CommitPayload {
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

export function recordsChecksum(rows: readonly { readonly type: string; readonly payload: string }[]): string {
  return sha256Hex(canonicalJson(rows.map((row) => [row.type, row.payload])));
}

export function decodeRows(rows: readonly LedgerRow[]): Decoded {
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

export function decodeSourceHistory(rows: readonly LedgerRow[]): {
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

export function decodeSources(rows: readonly LedgerRow[]): SourceRecord[] {
  return decodeSourceHistory(rows).sources;
}

export function checkedSources(rows: readonly LedgerRow[], decoded: Decoded): SourceRecord[] {
  const sources = decodeSources(rows);
  if (decoded.schema === REVISION_SOURCES_SCHEMA) {
    const dates = new Set(decoded.state.snapshots.map((snapshot) => snapshot.date));
    if (sources.some((source) => !dates.has(source.date)))
      return damaged("A stored bank statement does not belong to this revision.");
  }
  return sources;
}
