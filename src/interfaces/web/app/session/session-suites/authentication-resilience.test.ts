import { createExpenseCache } from "../../../../../adapters/browser/storage/expense-cache";
import { createGoogleSessionStore } from "../../../../../adapters/browser/connection/google-session";
import type { SignInResult } from "../../../../../applications/session/session-model";
import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../../../../tests/fixtures/fake-google";
import { parseExpenseAmounts } from "../../../../../core/expenses/work-expenses";
import { date, january, memory, world, saved } from "../../../../../../tests/fixtures/session/session-test-support";

describe("connection authentication resilience", () => {
  it("shares concurrent connection attempts and creates only one workbook", async () => {
    const { make, google, log } = world();
    const session = make();
    const outcomes = await Promise.all([session.connect(), session.connect(), session.refresh()]);
    expect(outcomes.every((outcome) => outcome.status === "connected")).toBe(true);
    expect(log.signIns).toBe(1);
    expect(google.files.size).toBe(1);
  });

  it("shares one renewal across simultaneous actions after expiry", async () => {
    const { make, log } = world();
    const session = make();
    await session.connect();
    log.clock += 3_600_000;
    await Promise.all([session.refresh(), session.verifyHistory()]);
    expect(log.signIns).toBe(2);
  });

  it("drops a rejected token and renews on the next user action without replaying the failed call", async () => {
    const { make, log, google } = world();
    const session = make();
    await session.connect();
    await session.idle();
    google.faults.push({ match: /./u, status: 401 });
    expect(await session.refresh()).toMatchObject({ status: "call-failed", failure: "unauthorised" });
    expect(log.signIns).toBe(1);
    expect(await session.refresh()).toMatchObject({ status: "connected" });
    expect(log.signIns).toBe(2);
  });

  it("switches accounts by discovering the selected account's workbook instead of refreshing the old one", async () => {
    const { make, google, store } = world();
    const accessStore = memory();
    const googleSession = createGoogleSessionStore(() => accessStore);
    const expenseCache = createExpenseCache(() => store);
    const sessionA = make({ googleSession, expenseCache });
    await sessionA.connect();
    await saved(sessionA, january);
    await sessionA.idle();
    await sessionA.expenses.refresh();
    const expenseAmounts = parseExpenseAmounts([100, 500, 100, null, null]);
    if (expenseAmounts === null) throw new Error("Invalid synthetic amounts");
    expect(
      (await sessionA.expenses.save({ date: date("2023-11-13"), amounts: expenseAmounts, expectedRevision: null }))
        .status,
    ).toBe("saved");
    expect(expenseCache.load()?.commands).toHaveLength(1);
    const original = sessionA.state.workbook;
    if (original === null) throw new Error("Missing original synthetic workbook");
    const accountB = new FakeGoogle();
    accountB.token = "synthetic-account-b-token";
    const unrelated = world({ google: accountB }).make({
      workbookIdentity: { title: "Unrelated synthetic workbook", propertyKey: "unrelated", propertyValue: "v1" },
    });
    await unrelated.connect();
    await unrelated.idle();
    const requestsFromB: string[] = [];
    const session = make({
      googleSession,
      expenseCache,
      rest: (request) => {
        if (request.headers["Authorization"] !== `Bearer ${accountB.token}`) return google.client(request);
        requestsFromB.push(request.url);
        // The former workbook is shared with B: Google access alone must not select it.
        return request.url.includes(`/spreadsheets/${original.id}`)
          ? google.client({ ...request, headers: { ...request.headers, Authorization: `Bearer ${google.token}` } })
          : accountB.client(request);
      },
      signIn: (_client, _scope, options) => {
        expect(options).toEqual({ prompt: "select_account" });
        expect(session.state.ledger.snapshots).toEqual([]);
        expect(session.state.workbook).toBeNull();
        expect(session.expenses.state.commands).toEqual([]);
        expect(expenseCache.load()).toBeNull();
        expect(store.data.get("foliodash.ledger.v1")).toBeUndefined();
        expect(accessStore.data.size).toBe(0);
        return Promise.resolve({ ok: true, accessToken: accountB.token, expiresInSeconds: 3600 });
      },
    });
    expect(await session.reconnect({ differentAccount: true })).toMatchObject({
      status: "connected",
      created: true,
      statements: 0,
    });
    await session.idle();
    expect(session.state.workbook?.id).not.toBe(original.id);
    expect(session.state.ledger.snapshots).toEqual([]);
    expect(requestsFromB.some((url) => url.includes(`/spreadsheets/${original.id}`))).toBe(false);
    expect(sessionA.state.ledger.snapshots).toHaveLength(1);
    expect(google.files.size).toBe(1);
  });

  it("keeps the previous account hidden when choosing another account is cancelled", async () => {
    const { make, store } = world();
    const original = make();
    await original.connect();
    await saved(original, january);
    await original.idle();
    const switching = make({ signIn: () => Promise.resolve({ ok: false, reason: "closed" }) });
    expect(await switching.reconnect({ differentAccount: true })).toEqual({
      status: "sign-in-failed",
      reason: "closed",
    });
    expect(switching.state.workbook).toBeNull();
    expect(switching.state.ledger.snapshots).toEqual([]);
    expect(store.data.size).toBe(0);
  });

  it("does not repopulate the previous account from a refresh completed after account switching", async () => {
    const { make, google, store } = world();
    let blocked = false;
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let cancelling = false;
    const session = make({
      rest: async (request) => {
        if (blocked && request.method === "GET" && request.url.includes("/v4/spreadsheets/")) {
          entered?.();
          await barrier;
        }
        return google.client(request);
      },
      signIn: () =>
        Promise.resolve(
          cancelling
            ? { ok: false, reason: "closed" }
            : { ok: true, accessToken: google.token, expiresInSeconds: 3600 },
        ),
    });
    await session.connect();
    await saved(session, january);
    await session.idle();
    blocked = true;
    const refresh = session.refresh();
    await started;
    cancelling = true;
    expect(await session.reconnect({ differentAccount: true })).toMatchObject({ status: "sign-in-failed" });
    release?.();
    expect(await refresh).toMatchObject({ status: "superseded" });
    expect(session.state.workbook).toBeNull();
    expect(session.state.ledger.snapshots).toEqual([]);
    expect(store.data.size).toBe(0);
  });

  it("does not submit a suspended old-account save after account switching", async () => {
    const { make, google } = world();
    let cancelling = false;
    const session = make({
      signIn: () =>
        Promise.resolve(
          cancelling
            ? { ok: false, reason: "closed" }
            : { ok: true, accessToken: google.token, expiresInSeconds: 3600 },
        ),
    });
    await session.connect();
    await session.idle();
    const before = google.calls.length;
    const saving = saved(session, january);
    cancelling = true;
    const switching = session.reconnect({ differentAccount: true });
    expect(await saving).toMatchObject({ status: "not-saved" });
    await switching;
    expect(google.calls).toHaveLength(before);
    expect(session.state.ledger.snapshots).toEqual([]);
  });

  it("retains the workbook and saved history if explicit reconnection is cancelled", async () => {
    const { make, store, google } = world();
    const initial = make();
    await initial.connect();
    await saved(initial, january);
    await initial.idle();
    const cached = store.data.get("foliodash.ledger.v1");
    const calls = google.calls.length;
    const session = make({ signIn: () => Promise.resolve({ ok: false, reason: "closed" }) });
    expect(await session.reconnect()).toEqual({ status: "sign-in-failed", reason: "closed" });
    expect(store.data.get("foliodash.ledger.v1")).toBe(cached);
    expect(session.state.ledger.snapshots).toHaveLength(1);
    expect(session.state.workbook).toEqual(initial.state.workbook);
    expect(google.calls).toHaveLength(calls);
  });

  it("survives a throwing sign-in provider and allows another attempt", async () => {
    const { make } = world();
    let attempts = 0;
    const session = make({
      signIn: () => {
        attempts++;
        if (attempts === 1) throw new Error("unavailable");
        return Promise.resolve({ ok: false, reason: "closed" });
      },
    });
    expect(await session.connect()).toEqual({ status: "sign-in-failed", reason: "unavailable" });
    expect(await session.connect()).toEqual({ status: "sign-in-failed", reason: "closed" });
  });

  it("does not accept a sign-in that completes after forgetting the device", async () => {
    const { make } = world();
    let complete: ((result: SignInResult) => void) | undefined;
    const session = make({
      signIn: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    });
    const connection = session.connect();
    session.forget();
    complete?.({ ok: true, accessToken: "synthetic-token", expiresInSeconds: 3600 });
    expect(await connection).toEqual({ status: "sign-in-failed", reason: "closed" });
    expect(session.state.mode).toBe("signed-out");
  });
});
