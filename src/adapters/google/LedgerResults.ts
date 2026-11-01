import type { LedgerState } from "../../core/Ledger";

/** Why a call failed before or instead of an answer. A subset applies to any one route. */
export type CallFailure = "unauthorised" | "forbidden" | "not-found" | "unavailable" | "network" | "unexpected" | "script-error";

/** What reading the ledger can turn up. Shared by every way of reaching the person's spreadsheet. */
export type RemoteRead =
  | { readonly status: "ok"; readonly state: LedgerState; readonly ignoredTrailingRows: number }
  | { readonly status: "damaged"; readonly message: string }
  | { readonly status: "workbook-unavailable" }
  | { readonly status: "refused"; readonly message: string }
  | { readonly status: "call-failed"; readonly failure: CallFailure; readonly message: string | null }
  | { readonly status: "unrecognised" };

/** What saving a statement can turn up. */
export type RemoteCommit =
  | { readonly status: "committed" | "already-committed"; readonly revision: string }
  /** The reviewed revision is no longer the current one: someone else, or another tab, saved first. */
  | { readonly status: "stale" }
  | { readonly status: "rejected"; readonly messages: readonly string[] }
  | { readonly status: "damaged"; readonly message: string }
  /** Known not to have been written. Safe to try again with the same command id. */
  | { readonly status: "not-committed"; readonly message: string }
  /** The request was refused before the script ran (sign-in, access, or setup). Nothing was written. */
  | { readonly status: "not-sent"; readonly failure: "unauthorised" | "forbidden" | "not-found" }
  | { readonly status: "refused"; readonly message: string }
  /** The request may have reached the script. Check the outcome before trying again. */
  | { readonly status: "unknown"; readonly message: string };

/** What asking "was this save recorded?" can turn up. */
export type RemoteOutcome =
  | { readonly status: "committed" }
  | { readonly status: "not-found" }
  | { readonly status: "damaged"; readonly message: string }
  /** The outcome itself could not be read. Nothing can be said about the save. */
  | { readonly status: "unreachable" };
