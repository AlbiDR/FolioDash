import { afterEach, expect, it, vi } from "vitest";
import { watchSystemTheme } from "./systemTheme";

afterEach(() => vi.unstubAllGlobals());

it("updates Android chrome from CSS on startup, system changes and resume, then removes listeners", () => {
  const theme = { content: "#eceff6" };
  const preference = new EventTarget();
  const documentEvents = new EventTarget();
  let background = "#07080d";
  vi.stubGlobal("document", {
    documentElement: {},
    querySelector: () => theme,
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
  });
  vi.stubGlobal("window", { matchMedia: () => preference });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => ` ${background} ` }));

  const stop = watchSystemTheme();
  expect(theme.content).toBe("#07080d");
  background = "#eceff6";
  preference.dispatchEvent(new Event("change"));
  expect(theme.content).toBe("#eceff6");
  background = "#07080d";
  documentEvents.dispatchEvent(new Event("visibilitychange"));
  expect(theme.content).toBe("#07080d");
  stop();
  background = "#eceff6";
  preference.dispatchEvent(new Event("change"));
  documentEvents.dispatchEvent(new Event("visibilitychange"));
  expect(theme.content).toBe("#07080d");
});
