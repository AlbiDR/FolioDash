import type { SignInFailure, SignInOptions, SignInResult } from "./SessionModel";

/**
 * How Google access is renewed without bothering the person. Pure rules: when a
 * quiet attempt may be made, what it asks Google for, and when to stop and ask.
 *
 * Google gives a browser-only app a one-hour access token and no refresh token, and its
 * window needs a click to open. So a quiet renewal is "ask again, naming the remembered
 * account", made on the person's next click, never on a timer.
 */

export type RenewalTrigger =
  /** Made on a click the person did for another reason. It never opens the account chooser. */
  | "automatic"
  /** The person chose to connect, sync, save or reconnect. */
  | "requested";

export interface RenewalHistory {
  readonly failures: number;
  readonly lastFailureAt: number | null;
  readonly lastReason: SignInFailure | null;
}

export const FRESH_RENEWAL: RenewalHistory = { failures: 0, lastFailureAt: null, lastReason: null };

/** A closed or timed-out window is not retried on every click. */
export const AUTOMATIC_BACKOFF_MILLISECONDS = 30_000;
export const AUTOMATIC_ATTEMPTS = 2;

/** A repeat of the same quiet request cannot help: the person or the browser has to act first. */
const NEEDS_THE_PERSON: ReadonlySet<SignInFailure> = new Set<SignInFailure>(["denied", "blocked"]);

/** Quiet renewal has given up for good: only the person's own request can go on. Not a matter of timing. */
export function renewalNeedsThePerson(history: RenewalHistory): boolean {
  if (history.failures === 0) return false;
  if (history.lastReason !== null && NEEDS_THE_PERSON.has(history.lastReason)) return true;
  return history.failures >= AUTOMATIC_ATTEMPTS;
}

/** Whether the next click may start a quiet renewal now: not given up, and past the short backoff. */
export function mayRenewAutomatically(history: RenewalHistory, now: number): boolean {
  if (renewalNeedsThePerson(history)) return false;
  if (history.failures === 0) return true;
  return history.lastFailureAt !== null && now - history.lastFailureAt >= AUTOMATIC_BACKOFF_MILLISECONDS;
}

/**
 * What to ask Google. The first try names the remembered account and reuses the grant, so
 * nothing needs choosing. Once that has failed, a hint that may be stale is dropped and an
 * explicit request shows the account chooser.
 */
export function signInOptionsFor(trigger: RenewalTrigger, history: RenewalHistory, loginHint: string | null, differentAccount: boolean): SignInOptions {
  if (differentAccount) return { prompt: "select_account" };
  if (trigger === "requested" && history.failures > 0) return { prompt: "select_account" };
  return loginHint === null ? { prompt: "" } : { prompt: "", loginHint };
}

export function afterAttempt(history: RenewalHistory, result: SignInResult, now: number): RenewalHistory {
  if (result.ok) return FRESH_RENEWAL;
  return { failures: history.failures + 1, lastFailureAt: now, lastReason: result.reason };
}

/** Coming back online forgives a failure that was only the network. */
export function afterReconnectingToNetwork(history: RenewalHistory): RenewalHistory {
  return history.lastReason === "unavailable" ? FRESH_RENEWAL : history;
}
