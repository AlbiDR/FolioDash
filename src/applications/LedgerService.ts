import { canonicalJson } from "../core/CanonicalJson";
import { type FundCommand, type StatementInput, applyImport } from "../core/ImportPlan";
import type { IsoDate } from "../core/IsoDate";
import { type RawSheet, type StoredSheet, toStoredSheet } from "../core/RawSheet";
import type { LedgerIssue, LedgerState } from "../core/Ledger";
import { sha256Hex } from "../core/Sha256";

/** What the store says about the committed ledger: the state, or why it cannot be trusted. */
export type LoadResult =
  | {
      readonly status: "ok";
      readonly state: LedgerState;
      /** Rows written after the last commit marker. They are an interrupted write and are ignored, never read as history. */
      readonly ignoredTrailingRows: number;
    }
  | { readonly status: "damaged"; readonly message: string };

/** Proof that a command was recorded, kept with the revision it produced. */
export interface CommandReceipt {
  readonly commandId: string;
  readonly revision: string;
  /** Checksum of the command's content, so a reused id with different content is detectable. */
  readonly requestHash: string;
}

/** The bank statement exactly as it was read, with the name of the sheet it came from. */
export interface StatementSource {
  readonly sheetName: string;
  readonly sheet: RawSheet;
}

/**
 * What is kept for one month beside the ledger: the exact bank statement and the
 * decisions made about it. With these the ledger can be rebuilt from scratch.
 */
export interface SourceRecord {
  readonly date: IsoDate;
  readonly commandId: string;
  readonly sheetName: string;
  readonly commands: readonly FundCommand[];
  readonly sheet: StoredSheet;
}

export type SourcesResult =
  | { readonly status: "ok"; readonly sources: readonly SourceRecord[] }
  | { readonly status: "damaged"; readonly message: string };

/**
 * The only way the service touches storage. A store publishes a complete
 * revision or fails; it never makes a half-written revision visible.
 */
export interface LedgerStore {
  load(): LoadResult;
  findCommand(commandId: string): CommandReceipt | null;
  /** Writes `next` as a new committed revision, with the month's source if there is one. May throw; the outcome of a throw is then unknown. */
  publish(next: LedgerState, receipt: CommandReceipt, source?: SourceRecord): void;
  /** Every stored bank statement and the decisions made about it, checked, in the order they were saved. */
  loadSources(): SourcesResult;
}

export interface ServiceEnvironment {
  readonly store: LedgerStore;
  /** Runs the action while holding the service's write lock, with a bounded wait. */
  withLock<T>(action: () => T): T;
  newRevision(): string;
}

export interface CommitRequest {
  /** A fresh id per user action. Retrying the same action reuses it, so it is recorded at most once. */
  readonly commandId: string;
  /** The revision the user reviewed against. A different current revision means the review is stale. */
  readonly expectedRevision: string;
  readonly statement: StatementInput;
  readonly date: IsoDate;
  readonly commands: readonly FundCommand[];
  /** The bank statement behind this month. Optional only so older callers keep working; the app always sends it. */
  readonly source?: StatementSource;
}

export type CommitOutcome =
  | { readonly status: "committed"; readonly revision: string }
  /** The same command was already recorded; nothing was written this time. */
  | { readonly status: "already-committed"; readonly revision: string }
  | { readonly status: "stale"; readonly currentRevision: string }
  | { readonly status: "rejected"; readonly issues: readonly LedgerIssue[] }
  | { readonly status: "damaged"; readonly message: string }
  /** The write failed and the store shows it did not commit. Safe to retry with the same command id. */
  | { readonly status: "not-committed"; readonly message: string }
  /** The write failed and the store could not be read afterwards. Do not retry blindly; read the command outcome first. */
  | { readonly status: "unknown"; readonly message: string };

export type CommandOutcome =
  | { readonly status: "committed"; readonly receipt: CommandReceipt }
  | { readonly status: "not-found" }
  | { readonly status: "damaged"; readonly message: string };

export function requestHash(request: CommitRequest): string {
  const base = { date: request.date, statement: request.statement, commands: request.commands };
  // The statement is part of what was asked for, so the same id with a different statement is a different request.
  return sha256Hex(canonicalJson(request.source === undefined ? base : { ...base, source: { sheetName: request.source.sheetName, sheet: toStoredSheet(request.source.sheet) } }));
}

export function readLedger(environment: ServiceEnvironment): LoadResult {
  return environment.store.load();
}

/** Resolves a command whose result was lost, for example after a timeout. */
export function readCommandOutcome(environment: ServiceEnvironment, commandId: string): CommandOutcome {
  const loaded = environment.store.load();
  if (loaded.status === "damaged") return loaded;
  const receipt = environment.store.findCommand(commandId);
  return receipt === null ? { status: "not-found" } : { status: "committed", receipt };
}

/**
 * Records one reviewed statement, exactly once. Under the write lock it checks
 * that the ledger is intact, that this command was not already recorded, and
 * that the review is against the current revision; then it applies the same
 * rules the browser used and publishes one complete revision.
 */
export function commitStatement(environment: ServiceEnvironment, request: CommitRequest): CommitOutcome {
  return environment.withLock((): CommitOutcome => {
    const loaded = environment.store.load();
    if (loaded.status === "damaged") return loaded;

    const hash = requestHash(request);
    const earlier = environment.store.findCommand(request.commandId);
    if (earlier !== null) {
      return earlier.requestHash === hash
        ? { status: "already-committed", revision: earlier.revision }
        : {
            status: "rejected",
            issues: [{ code: "invalid-command", isin: null, message: "This command id was already used for different content." }],
          };
    }
    if (loaded.state.revision !== request.expectedRevision) {
      return { status: "stale", currentRevision: loaded.state.revision };
    }

    const applied = applyImport(loaded.state, request.statement, request.date, request.commands, environment.newRevision());
    if (!applied.ok) return { status: "rejected", issues: applied.issues };

    try {
      environment.store.publish(
        applied.state,
        { commandId: request.commandId, revision: applied.state.revision, requestHash: hash },
        request.source === undefined
          ? undefined
          : { date: request.date, commandId: request.commandId, sheetName: request.source.sheetName, commands: request.commands, sheet: toStoredSheet(request.source.sheet) },
      );
    } catch {
      // The write may or may not have committed. Look before saying anything.
      return resolveFailedPublish(environment, request.commandId, loaded.state.revision);
    }
    return { status: "committed", revision: applied.state.revision };
  });
}

function resolveFailedPublish(environment: ServiceEnvironment, commandId: string, revisionBefore: string): CommitOutcome {
  const unknown = (message: string): CommitOutcome => ({ status: "unknown", message });
  try {
    const after = environment.store.load();
    if (after.status !== "ok") return unknown("The save failed and the ledger could not be confirmed. Read the command outcome before retrying.");
    if (environment.store.findCommand(commandId) !== null) return { status: "committed", revision: after.state.revision };
    return after.state.revision === revisionBefore
      ? { status: "not-committed", message: "The save failed and nothing was recorded. It is safe to try again." }
      : unknown("The save failed and the ledger changed in another way. Read the command outcome before retrying.");
  } catch {
    return unknown("The save failed and the result could not be checked. Read the command outcome before retrying.");
  }
}
