import { describe, expect, it } from "vitest";
import { AUTOMATIC_BACKOFF_MILLISECONDS, FRESH_RENEWAL, afterAttempt, afterReconnectingToNetwork, mayRenewAutomatically, renewalNeedsThePerson, signInOptionsFor } from "./RenewalPolicy";

const now = 1_700_000_000_000;
const closed = { ok: false, reason: "closed" } as const;

describe("when Google access may be renewed quietly", () => {
  it("always allows a first attempt", () => {
    expect(mayRenewAutomatically(FRESH_RENEWAL, now)).toBe(true);
  });

  it("waits out a short backoff after a window was closed, then allows one more", () => {
    const failed = afterAttempt(FRESH_RENEWAL, closed, now);
    expect(mayRenewAutomatically(failed, now + 1_000)).toBe(false);
    expect(mayRenewAutomatically(failed, now + AUTOMATIC_BACKOFF_MILLISECONDS)).toBe(true);
  });

  it("stops after two failures in a row", () => {
    const twice = afterAttempt(afterAttempt(FRESH_RENEWAL, closed, now), { ok: false, reason: "timeout" }, now + 60_000);
    expect(mayRenewAutomatically(twice, now + 3_600_000)).toBe(false);
  });

  it("stops at once when the person declined or the browser blocked the window, since repeating cannot help", () => {
    for (const reason of ["denied", "blocked"] as const) {
      expect(mayRenewAutomatically(afterAttempt(FRESH_RENEWAL, { ok: false, reason }, now), now + 3_600_000)).toBe(false);
    }
  });

  it("says quiet renewal has given up only when it will not resume by itself, not merely during a backoff", () => {
    const once = afterAttempt(FRESH_RENEWAL, closed, now);
    expect(renewalNeedsThePerson(FRESH_RENEWAL)).toBe(false);
    expect(renewalNeedsThePerson(once)).toBe(false);
    expect(renewalNeedsThePerson(afterAttempt(once, closed, now + 60_000))).toBe(true);
    expect(renewalNeedsThePerson(afterAttempt(FRESH_RENEWAL, { ok: false, reason: "blocked" }, now))).toBe(true);
  });

  it("starts over after a success", () => {
    const failed = afterAttempt(FRESH_RENEWAL, closed, now);
    expect(afterAttempt(failed, { ok: true, accessToken: "synthetic-token" }, now + 1)).toEqual(FRESH_RENEWAL);
  });

  it("forgives only a failure that was the network when the connection returns", () => {
    const offline = afterAttempt(FRESH_RENEWAL, { ok: false, reason: "unavailable" }, now);
    expect(afterReconnectingToNetwork(offline)).toEqual(FRESH_RENEWAL);
    const blocked = afterAttempt(FRESH_RENEWAL, { ok: false, reason: "blocked" }, now);
    expect(afterReconnectingToNetwork(blocked)).toBe(blocked);
  });
});

describe("what a renewal asks Google for", () => {
  it("names the remembered account and reuses the grant on a quiet attempt", () => {
    expect(signInOptionsFor("automatic", FRESH_RENEWAL, "person@example.test", false)).toEqual({ prompt: "", loginHint: "person@example.test" });
  });

  it("sends no hint when none is known", () => {
    expect(signInOptionsFor("automatic", FRESH_RENEWAL, null, false)).toEqual({ prompt: "" });
  });

  it("never opens the chooser on a quiet attempt, even after a failure", () => {
    const failed = afterAttempt(FRESH_RENEWAL, closed, now);
    expect(signInOptionsFor("automatic", failed, "person@example.test", false)).toEqual({ prompt: "", loginHint: "person@example.test" });
  });

  it("lets the person choose once a requested attempt has already failed, dropping a hint that may be stale", () => {
    const failed = afterAttempt(FRESH_RENEWAL, closed, now);
    expect(signInOptionsFor("requested", failed, "person@example.test", false)).toEqual({ prompt: "select_account" });
  });

  it("opens the chooser whenever the person asks for another account", () => {
    expect(signInOptionsFor("requested", FRESH_RENEWAL, "person@example.test", true)).toEqual({ prompt: "select_account" });
  });
});
