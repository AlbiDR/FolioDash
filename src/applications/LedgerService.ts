import type { SourceRecord } from "./StatementSource";
import { canonicalJson } from "../core/CanonicalJson";
import { type FundCommand, type StatementInput, applyImport } from "../core/ImportPlan";
import type { IsoDate } from "../core/IsoDate";
import { type RawSheet, toStoredSheet } from "../core/RawSheet";
import type { LedgerIssue, LedgerState } from "../core/Ledger";
import { sha256Hex } from "../core/Sha256";
import { replayedMonth } from "./Rebuild";

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
  /** Writes `next` as a new committed revision, with the bank statements being saved in it, if any. May throw; the outcome of a throw is then unknown. */
  publish(next: LedgerState, receipt: CommandReceipt, sources?: readonly SourceRecord[]): void;
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
          : [{ date: request.date, commandId: request.commandId, sheetName: request.source.sheetName, commands: request.commands, sheet: toStoredSheet(request.source.sheet) }],
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

/** One saved month and the bank statement to attach to it. */
export interface AttachItem {
  readonly date: IsoDate;
  readonly statement: StatementInput;
  readonly commands: readonly FundCommand[];
  readonly source: StatementSource;
}

export interface AttachRequest {
  /** A fresh id per user action. Repeating the same action reuses it, so it is recorded at most once. */
  readonly commandId: string;
  readonly expectedRevision: string;
  readonly items: readonly AttachItem[];
}

export type AttachOutcome =
  | { readonly status: "attached"; readonly revision: string; readonly count: number }
  | { readonly status: "already-attached"; readonly revision: string }
  | { readonly status: "stale"; readonly currentRevision: string }
  | { readonly status: "rejected"; readonly messages: readonly string[] }
  | { readonly status: "damaged"; readonly message: string }
  | { readonly status: "not-committed"; readonly message: string }
  | { readonly status: "unknown"; readonly message: string };

function attachHash(request: AttachRequest): string {
  return sha256Hex(
    canonicalJson({
      attach: request.items.map((item) => ({ date: item.date, statement: item.statement, commands: item.commands, sheetName: item.source.sheetName, sheet: toStoredSheet(item.source.sheet) })),
    }),
  );
}

/**
 * Adds bank statements to months that are already saved, in one new revision. The
 * saved figures do not change: each statement must replay, with today's rules and
 * the decisions given, to exactly the month already saved, so a wrong statement is
 * refused rather than attached. A month that already has its statement is refused.
 */
export function attachStatements(environment: ServiceEnvironment, request: AttachRequest): AttachOutcome {
  return environment.withLock((): AttachOutcome => {
    const loaded = environment.store.load();
    if (loaded.status === "damaged") return loaded;

    const hash = attachHash(request);
    const earlier = environment.store.findCommand(request.commandId);
    if (earlier !== null) {
      return earlier.requestHash === hash
        ? { status: "already-attached", revision: earlier.revision }
        : { status: "rejected", messages: ["This command id was already used for different content."] };
    }
    if (loaded.state.revision !== request.expectedRevision) return { status: "stale", currentRevision: loaded.state.revision };

    const existing = environment.store.loadSources();
    if (existing.status === "damaged") return existing;
    const have = new Set(existing.sources.map((source) => source.date));
    const problems: string[] = [];
    const seen = new Set<IsoDate>();
    for (const item of request.items) {
      const index = loaded.state.snapshots.findIndex((snapshot) => snapshot.date === item.date);
      const saved = loaded.state.snapshots[index];
      if (saved === undefined) problems.push(`${item.date}: no month is saved for this date.`);
      else if (have.has(item.date) || seen.has(item.date)) problems.push(`${item.date}: this month already has its bank statement.`);
      else {
        const replayed = replayedMonth(loaded.state, index, item.statement, item.date, item.commands);
        if (replayed === undefined || canonicalJson(replayed) !== canonicalJson(saved)) {
          problems.push(`${item.date}: this statement does not produce the figures already saved for the month.`);
        }
      }
      seen.add(item.date);
    }
    if (problems.length > 0 || request.items.length === 0) {
      return { status: "rejected", messages: problems.length > 0 ? problems.slice(0, 10) : ["There is no statement to attach."] };
    }

    const next: LedgerState = { ...loaded.state, revision: environment.newRevision() };
    try {
      environment.store.publish(
        next,
        { commandId: request.commandId, revision: next.revision, requestHash: hash },
        request.items.map((item) => ({ date: item.date, commandId: request.commandId, sheetName: item.source.sheetName, commands: item.commands, sheet: toStoredSheet(item.source.sheet) })),
      );
    } catch {
      const resolved = resolveFailedPublish(environment, request.commandId, loaded.state.revision);
      if (resolved.status === "committed") return { status: "attached", revision: resolved.revision, count: request.items.length };
      return resolved.status === "unknown" || resolved.status === "not-committed" ? resolved : { status: "unknown", message: "The save failed and the result could not be checked. Read the command outcome before retrying." };
    }
    return { status: "attached", revision: next.revision, count: request.items.length };
  });
}
