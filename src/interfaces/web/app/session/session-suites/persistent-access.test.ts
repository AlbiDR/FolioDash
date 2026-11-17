import { createGoogleSessionStore } from "../../../../../adapters/browser/connection/google-session";
import { describe, expect, it } from "vitest";
import { january, february, memory, world, saved } from "../../../../../../tests/fixtures/session/session-test-support";

describe("persistent Google access and two-device freshness", () => {
  it("reuses the tab session after reload and refreshes another device's saved history without signing in", async () => {
    const { make, google, log } = world();
    const storage = memory();
    const googleSession = createGoogleSessionStore(() => storage);
    const phone = make({ googleSession });
    await phone.connect();
    await saved(phone, january);
    await phone.idle();
    const laptopWorld = world({ google, store: memory() });
    const laptop = laptopWorld.make({ newId: () => `laptop-${String(++laptopWorld.log.ids).padStart(6, "0")}` });
    await laptop.connect();
    expect((await saved(laptop, february)).status).toBe("recorded");
    const reloaded = make({ googleSession });
    expect(reloaded.state.ledger.snapshots).toHaveLength(1);
    await reloaded.refreshIfNeeded();
    expect(reloaded.state.ledger.snapshots).toHaveLength(2);
    expect(reloaded.state.connection).toBe("connected");
    expect(log.signIns).toBe(1);
  });

  it("throttles repeated foreground events and never opens sign-in when access expires", async () => {
    const { make, google, log } = world();
    const session = make();
    await session.connect();
    await session.idle();
    await session.refreshIfNeeded();
    const calls = google.calls.length;
    await Promise.all([session.refreshIfNeeded(), session.refreshIfNeeded()]);
    expect(google.calls).toHaveLength(calls);
    log.clock += 3_600_000;
    await session.refreshIfNeeded();
    expect(session.state.connection).toBe("waiting");
    expect(log.signIns).toBe(1);
  });

  it("clears persisted access on rejection and forgetting, while preserving the workbook", async () => {
    const { make, google } = world();
    const storage = memory();
    const googleSession = createGoogleSessionStore(() => storage);
    const session = make({ googleSession });
    await session.connect();
    await session.idle();
    expect(storage.data.size).toBe(1);
    google.faults.push({ match: /./u, status: 401 });
    await session.refreshIfNeeded();
    expect(storage.data.size).toBe(0);
    expect(session.state.connection).toBe("waiting");
    await session.refresh();
    expect(storage.data.size).toBe(1);
    session.forget();
    expect(storage.data.size).toBe(0);
    expect(google.files.size).toBe(1);
  });

  it("keeps a checked device copy after a failed background check", async () => {
    const { make, google } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    await session.idle();
    google.faults.push({ match: /./u, network: true });
    await session.refreshIfNeeded();
    expect(session.state.connection).toBe("offline");
    expect(session.state.ledger.snapshots).toHaveLength(1);
  });
});

describe("out-of-order Google reads", () => {
  it("does not misreport a successful manual read as rejected sign-in when a newer background check wins", async () => {
    const { google, make } = world();
    let delayNext = false;
    let entered: (() => void) | undefined;
    let release: (() => void) | undefined;
    const reading = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = make({
      rest: async (request) => {
        const response = await google.client(request);
        if (delayNext && request.method === "GET" && request.url.includes("/values/")) {
          delayNext = false;
          entered?.();
          await gate;
        }
        return response;
      },
    });
    await session.connect();
    await session.idle();
    delayNext = true;
    const manual = session.refresh();
    await reading;
    await session.refreshIfNeeded();
    release?.();
    expect(await manual).toEqual({ status: "superseded" });
    expect(session.state.connection).toBe("connected");
  });

  it("does not let an older background response replace a newer manual refresh", async () => {
    const { google, make } = world();
    let delayNext = false;
    let entered: (() => void) | undefined;
    let release: (() => void) | undefined;
    const reading = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = make({
      rest: async (request) => {
        const response = await google.client(request);
        if (delayNext && request.method === "GET" && request.url.includes("/values/")) {
          delayNext = false;
          entered?.();
          await gate;
        }
        return response;
      },
    });
    await session.connect();
    await saved(session, january);
    await session.idle();
    delayNext = true;
    const background = session.refreshIfNeeded();
    await reading;
    const other = world({ google, store: memory() });
    const laptop = other.make({ newId: () => `laptop-${String(++other.log.ids).padStart(6, "0")}` });
    await laptop.connect();
    expect((await saved(laptop, february)).status).toBe("recorded");
    expect((await session.refresh()).status).toBe("connected");
    release?.();
    await background;
    expect(session.state.ledger.snapshots).toHaveLength(2);
    expect(session.state.connection).toBe("connected");
  });
});
