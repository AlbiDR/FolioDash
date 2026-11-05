import { afterEach, describe, expect, it, vi } from "vitest";
import { watchGoogleFreshness } from "./GoogleFreshness";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup() {
  vi.useFakeTimers();
  const browser = new EventTarget();
  const page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const network = { onLine: true };
  vi.stubGlobal("window", Object.assign(browser, { setInterval, clearInterval }));
  vi.stubGlobal("document", page);
  vi.stubGlobal("navigator", network);
  let paused = false;
  const refresh = vi.fn(() => Promise.resolve());
  const stop = watchGoogleFreshness(refresh, () => paused);
  return { browser, page, network, refresh, stop, pause: () => { paused = true; } };
}

describe("Google freshness triggers", () => {
  it("checks on startup, return to foreground, reconnection and the visible timer", async () => {
    const { refresh, browser, page, stop } = setup();
    expect(refresh).toHaveBeenCalledTimes(1);
    browser.dispatchEvent(new Event("focus"));
    browser.dispatchEvent(new Event("online"));
    page.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(5);
    stop();
  });

  it("does not refresh hidden, offline or edited screens and removes listeners on cleanup", async () => {
    const { refresh, browser, page, network, pause, stop } = setup();
    page.visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(60_000);
    page.visibilityState = "visible";
    network.onLine = false;
    browser.dispatchEvent(new Event("focus"));
    network.onLine = true;
    pause();
    browser.dispatchEvent(new Event("online"));
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
    browser.dispatchEvent(new Event("focus"));
    page.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
