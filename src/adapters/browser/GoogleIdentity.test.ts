import { afterEach, describe, expect, it, vi } from "vitest";

const SCOPE = "https://www.googleapis.com/auth/drive.file";

type Identity = NonNullable<Window["google"]>;
type Config = Parameters<Identity["accounts"]["oauth2"]["initTokenClient"]>[0];

async function setup(reply: (config: Config) => void) {
  vi.resetModules();
  vi.useFakeTimers();
  const request = vi.fn();
  vi.stubGlobal("window", {
    setTimeout, clearTimeout,
    google: { accounts: { oauth2: {
      initTokenClient: (config: Config) => ({ requestAccessToken: (options: unknown) => { request(options); reply(config); } }),
      revoke: vi.fn(),
    } } },
  });
  const { signIn } = await import("./GoogleIdentity");
  return { signIn, request };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Google sign-in recovery", () => {
  it("reuses Google's existing grant without forcing account selection", async () => {
    const { signIn, request } = await setup((config) => { config.callback({ access_token: "synthetic-token", expires_in: "3600", scope: SCOPE }); });
    expect(await signIn("synthetic-client", SCOPE)).toEqual({ ok: true, accessToken: "synthetic-token", expiresInSeconds: 3600 });
    expect(request).toHaveBeenCalledWith({ prompt: "" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses tokens that do not grant the required permission", async () => {
    const { signIn } = await setup((config) => { config.callback({ access_token: "synthetic-token", scope: "unrelated" }); });
    expect(await signIn("client", SCOPE)).toEqual({ ok: false, reason: "denied" });
  });

  it("distinguishes blocked pop-ups from a closed window", async () => {
    for (const [type, reason] of [["popup_failed_to_open", "blocked"], ["popup_closed", "closed"]]) {
      const { signIn } = await setup((config) => { config.error_callback?.({ type: type ?? "" }); });
      expect(await signIn("client", SCOPE)).toEqual({ ok: false, reason });
    }
  });

  it("ends a stuck sign-in and ignores its late callback", async () => {
    let pending: Config | undefined;
    const { signIn } = await setup((config) => { pending = config; });
    const result = signIn("client", SCOPE);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await result).toEqual({ ok: false, reason: "timeout" });
    pending?.callback({ access_token: "late-token", scope: SCOPE });
    expect(await result).toEqual({ ok: false, reason: "timeout" });
  });

  it("recovers from provider exceptions without leaving a timer running", async () => {
    const { signIn } = await setup(() => { throw new Error("provider unavailable"); });
    expect(await signIn("client", SCOPE)).toEqual({ ok: false, reason: "unavailable" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes a timed-out script so the next attempt can load it again", async () => {
    const { signIn } = await setup(() => {});
    const scripts: { remove: ReturnType<typeof vi.fn>; onload: (() => void) | null; onerror: (() => void) | null }[] = [];
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.stubGlobal("document", {
      createElement: () => { const script = { remove: vi.fn(), onload: null, onerror: null }; scripts.push(script); return script; },
      head: { append: vi.fn() },
    });
    const first = signIn("client", SCOPE);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await first).toEqual({ ok: false, reason: "unavailable" });
    expect(scripts[0]?.remove).toHaveBeenCalledOnce();
    expect(scripts[0]?.onload).toBeNull();
    const retry = signIn("client", SCOPE);
    expect(scripts).toHaveLength(2);
    scripts[1]?.onerror?.();
    expect(await retry).toEqual({ ok: false, reason: "unavailable" });
  });
});
