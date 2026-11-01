import { canonicalJson } from "../core/CanonicalJson";
import { type FundCommand, type StatementInput, applyImport } from "../core/ImportPlan";
import type { IsoDate } from "../core/IsoDate";
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

/**
 * The only way the service touches storage. A store publishes a complete
 * revision or fails; it never makes a half-written revision visible.
 */
export interface LedgerStore {
  load(): LoadResult;
  findCommand(commandId: string): CommandReceipt | null;
  /** Writes `next` as a new committed revision. May throw; the outcome of a throw is then unknown. */
  publish(next: LedgerState, receipt: CommandReceipt): void;
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
  return sha256Hex(canonicalJson({ date: request.date, statement: request.statement, commands: request.commands }));
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
      environment.store.publish(applied.state, { commandId: request.commandId, revision: applied.state.revision, requestHash: hash });
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
