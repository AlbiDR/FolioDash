import { createGoogleSessionStore } from "../../../../../adapters/browser/connection/google-session";
import type {
  RenewalCoordination,
  SignInOptions,
  SignInResult,
} from "../../../../../applications/session/session-model";
import { createAccountHintStore } from "../../../../../adapters/browser/connection/connection-memory";
import { describe, expect, it } from "vitest";
import type { RecordRequest } from "../../../../../applications/import/import-model";
import {
  date,
  statement,
  keep,
  january,
  february,
  memory,
  world,
  saved,
} from "../../../../../../tests/fixtures/session/session-test-support";

describe("a remembered connection that stays connected", () => {
  const TOKEN_KEY = "foliodash.google-session.v1";
  const HOUR = 3_600_000;

  /** A browser's kept state: what survives closing the app. */
  function browser() {
    const w = world();
    const storage = memory();
    const googleSession = createGoogleSessionStore(() => storage);
    const accountHint = createAccountHintStore(() => storage, "hint");
    const asked: (SignInOptions | undefined)[] = [];
    const answering =
      (answer: (index: number) => SignInResult) =>
      (_client: string, _scope: string, options?: SignInOptions): Promise<SignInResult> => {
        w.log.signIns++;
        asked.push(options);
        return Promise.resolve(answer(asked.length - 1));
      };
    const granted = (): SignInResult => ({ ok: true, accessToken: w.google.token, expiresInSeconds: 3600 });
    return { ...w, storage, googleSession, accountHint, asked, answering, granted };
  }

  async function connectedWithHistory(b: ReturnType<typeof browser>) {
    const first = b.make({ googleSession: b.googleSession, accountHint: b.accountHint });
    await first.connect();
    await saved(first, january);
    await first.idle();
    return first;
  }

  it("renews quietly on the next click after a restart, naming the remembered account, with no chooser and no new workbook", async () => {
    const b = browser();
    await connectedWithHistory(b);
    expect(b.storage.data.get("hint")).toContain("person@example.test");
    b.log.clock += 2 * HOUR;
    const reopened = b.make({
      googleSession: b.googleSession,
      accountHint: b.accountHint,
      signIn: b.answering(b.granted),
    });
    // The saved copy opens at once, and the connection says what the next tap will do.
    expect(reopened.state).toMatchObject({ mode: "device-copy", connection: "waiting" });
    expect(reopened.state.ledger.snapshots).toHaveLength(1);
    expect(reopened.needsRenewal()).toBe(true);
    const calls = b.google.calls.length;
    expect(await reopened.renewFromGesture({ sync: true })).toBe(true);
    expect(b.asked).toEqual([{ prompt: "", loginHint: "person@example.test" }]);
    expect(reopened.state).toMatchObject({ mode: "online", connection: "connected" });
    expect(b.google.calls.slice(calls).includes("POST /v4/spreadsheets")).toBe(false);
    expect(b.storage.data.has(TOKEN_KEY)).toBe(true);
    await reopened.idle();
  });

  it("reuses unexpired access across a restart without asking Google at all", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.log.clock += 5 * 60_000;
    const reopened = b.make({
      googleSession: b.googleSession,
      accountHint: b.accountHint,
      signIn: b.answering(b.granted),
    });
    expect(reopened.needsRenewal()).toBe(false);
    await reopened.refreshIfNeeded();
    expect(reopened.state).toMatchObject({ mode: "online", connection: "connected" });
    expect(b.asked).toHaveLength(0);
  });

  it("renews ahead of expiry on a click, leaving the working connection undisturbed", async () => {
    const b = browser();
    let finish: ((result: SignInResult) => void) | undefined;
    let gate: Promise<SignInResult> | null = null;
    const session = b.make({
      signIn: () => {
        b.log.signIns++;
        return gate ?? Promise.resolve(b.granted());
      },
    });
    await session.connect();
    await session.idle();
    // Six minutes of access left: inside the ten-minute window, outside the eight needed to save.
    b.log.clock += 3_480_000 - 360_000;
    expect(session.needsRenewal()).toBe(true);
    gate = new Promise((resolve) => {
      finish = resolve;
    });
    const renewing = session.renewFromGesture({ sync: false });
    expect(session.state.connection).toBe("connected");
    expect(session.needsRenewal()).toBe(false);
    finish?.(b.granted());
    expect(await renewing).toBe(true);
    expect(b.log.signIns).toBe(2);
    expect(session.needsRenewal()).toBe(false);
  });

  it("does nothing when signed out, mid-connection or when access is plentiful", async () => {
    const b = browser();
    const fresh = b.make({ signIn: b.answering(b.granted) });
    expect(fresh.needsRenewal()).toBe(false);
    expect(await fresh.renewFromGesture({ sync: true })).toBe(false);
    await fresh.connect();
    expect(fresh.needsRenewal()).toBe(false);
    expect(b.asked).toHaveLength(1);
  });

  it("gives up quiet renewal after two closed windows with a pause between, then lets the person choose an account on request", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.log.clock += 2 * HOUR;
    const reopened = b.make({
      googleSession: b.googleSession,
      accountHint: b.accountHint,
      signIn: b.answering(() => ({ ok: false, reason: "closed" })),
    });
    expect(await reopened.renewFromGesture({ sync: true })).toBe(false);
    expect(reopened.state.connection).toBe("waiting");
    expect(reopened.needsRenewal()).toBe(false);
    b.log.clock += 31_000;
    expect(reopened.needsRenewal()).toBe(true);
    expect(await reopened.renewFromGesture({ sync: true })).toBe(false);
    expect(reopened.state.connection).toBe("reconnect");
    b.log.clock += 3 * HOUR;
    expect(reopened.needsRenewal()).toBe(false);
    await reopened.reconnect();
    expect(b.asked.map((options) => options?.prompt)).toEqual(["", "", "select_account"]);
    expect(b.asked[0]).toEqual({ prompt: "", loginHint: "person@example.test" });
  });

  it("stops quiet attempts at once when the browser blocked Google's window", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.log.clock += 2 * HOUR;
    const reopened = b.make({
      googleSession: b.googleSession,
      accountHint: b.accountHint,
      signIn: b.answering(() => ({ ok: false, reason: "blocked" })),
    });
    expect(await reopened.renewFromGesture({ sync: true })).toBe(false);
    expect(reopened.state.connection).toBe("reconnect");
    expect(reopened.needsRenewal()).toBe(false);
    expect(reopened.state.ledger.snapshots).toHaveLength(1);
  });

  it("forgives a failure that was only the network once it is back", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.log.clock += 2 * HOUR;
    const reopened = b.make({
      googleSession: b.googleSession,
      signIn: b.answering(() => ({ ok: false, reason: "unavailable" })),
    });
    await reopened.renewFromGesture({ sync: true });
    b.log.clock += 31_000;
    await reopened.renewFromGesture({ sync: true });
    expect(reopened.state.connection).toBe("reconnect");
    reopened.resumeRenewal();
    expect(reopened.needsRenewal()).toBe(true);
  });

  it("learns the account from a chooser sign-in, so later renewals name it", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.google.account = "other@example.test";
    const session = b.make({
      googleSession: b.googleSession,
      accountHint: b.accountHint,
      signIn: b.answering(b.granted),
    });
    await session.reconnect({ differentAccount: true });
    await session.idle();
    expect(b.asked[0]).toEqual({ prompt: "select_account" });
    expect(b.storage.data.get("hint")).toContain("other@example.test");
  });

  it("never lets a save straddle expiry: it renews first, and refuses to start if the replacement fails", async () => {
    const b = browser();
    const session = b.make({ googleSession: b.googleSession, signIn: b.answering(b.granted) });
    await session.connect();
    await saved(session, january);
    await session.idle();
    // Five minutes left: fine for a read, too little for a save.
    b.log.clock += 3_480_000 - 300_000;
    expect((await saved(session, february)).status).toBe("recorded");
    expect(b.asked).toHaveLength(2);

    b.log.clock += 3_480_000 - 300_000;
    const calls = b.google.calls.length;
    const refusing = b.make({
      googleSession: b.googleSession,
      signIn: b.answering(() => ({ ok: false, reason: "closed" })),
    });
    expect(refusing.state.ledger.snapshots).toHaveLength(2);
    const march: RecordRequest = { date: date("2026-03-31"), statement: statement(1200), commands: [keep] };
    const refused = await saved(refusing, march);
    expect(refused.status).toBe("not-saved");
    expect(refused.status === "not-saved" ? refused.message : "").toContain("nothing was saved");
    expect(b.google.calls).toHaveLength(calls);
    // The access that is still valid keeps serving reads.
    expect(await refusing.refresh()).toMatchObject({ status: "connected" });
  });

  it("a rejected token does not erase newer access another window stored", async () => {
    const b = browser();
    const session = await connectedWithHistory(b);
    b.google.faults.push({ match: /./u, status: 401 });
    const newer = {
      clientId: "client",
      workbookId: session.state.workbook?.id ?? "",
      scope: "https://www.googleapis.com/auth/drive.file",
      accessToken: "newer-token",
      validUntil: b.log.clock + 3_000_000,
    };
    b.googleSession.save(newer);
    await session.refresh();
    expect(b.googleSession.load("client", newer.workbookId, b.log.clock)).toEqual(newer);
  });

  it("adopts newer access stored by another window of the same browser", async () => {
    const b = browser();
    const session = await connectedWithHistory(b);
    b.log.clock += 2 * HOUR;
    const reopened = b.make({ googleSession: b.googleSession, signIn: b.answering(b.granted) });
    expect(reopened.state.connection).toBe("waiting");
    expect(reopened.adoptStoredAccess()).toBe(false);
    b.googleSession.save({
      clientId: "client",
      workbookId: session.state.workbook?.id ?? "",
      scope: "https://www.googleapis.com/auth/drive.file",
      accessToken: b.google.token,
      validUntil: b.log.clock + 3_000_000,
    });
    expect(reopened.adoptStoredAccess()).toBe(true);
    expect(reopened.state.connection).toBeUndefined();
    expect(reopened.adoptStoredAccess()).toBe(false);
    await reopened.refreshIfNeeded();
    expect(reopened.state).toMatchObject({ mode: "online", connection: "connected" });
    expect(b.asked).toHaveLength(0);
  });

  it("leaves automatic renewal to the window already asking Google, but never holds back what the person chose", async () => {
    const b = browser();
    await connectedWithHistory(b);
    b.log.clock += 2 * HOUR;
    let elsewhere = true;
    const events: string[] = [];
    const coordination: RenewalCoordination = {
      heldElsewhere: () => elsewhere,
      claim: () => {
        events.push("claim");
      },
      release: () => {
        events.push("release");
      },
      announceForgotten: () => {
        events.push("forgotten");
      },
    };
    const reopened = b.make({ googleSession: b.googleSession, coordination, signIn: b.answering(b.granted) });
    expect(reopened.needsRenewal()).toBe(false);
    expect(await reopened.renewFromGesture({ sync: true })).toBe(false);
    expect(b.asked).toHaveLength(0);
    expect(await reopened.refresh()).toMatchObject({ status: "connected" });
    expect(events).toEqual(["claim", "release"]);
    elsewhere = false;
  });

  it("announces a forgotten device, and a device forgotten elsewhere is dropped without revoking or announcing again", async () => {
    const b = browser();
    await connectedWithHistory(b);
    const events: string[] = [];
    const coordination: RenewalCoordination = {
      heldElsewhere: () => false,
      claim: () => undefined,
      release: () => undefined,
      announceForgotten: () => {
        events.push("forgotten");
      },
    };
    const here = b.make({ googleSession: b.googleSession, accountHint: b.accountHint, coordination });
    await here.refresh();
    here.forget();
    expect(events).toEqual(["forgotten"]);
    expect(b.log.revoked).toHaveLength(1);
    expect(b.storage.data.has("hint")).toBe(false);

    const other = await connectedWithHistory(browser());
    other.forgetFromElsewhere();
    expect(other.state.mode).toBe("signed-out");
  });

  it("does not revoke access or announce when a device is forgotten from another window", async () => {
    const b = browser();
    const events: string[] = [];
    const coordination: RenewalCoordination = {
      heldElsewhere: () => false,
      claim: () => undefined,
      release: () => undefined,
      announceForgotten: () => {
        events.push("forgotten");
      },
    };
    const session = b.make({ googleSession: b.googleSession, accountHint: b.accountHint, coordination });
    await session.connect();
    await session.idle();
    session.forgetFromElsewhere();
    expect(events).toEqual([]);
    expect(b.log.revoked).toEqual([]);
    expect(b.storage.data.size).toBe(0);
    expect(session.state.mode).toBe("signed-out");
  });
});
