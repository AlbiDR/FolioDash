import { afterEach, expect, it, vi } from "vitest";
import { AppNav } from "./app-chrome";

const hooks = vi.hoisted(() => ({
  effects: [] as (() => undefined | (() => void))[],
  bounds: { current: null },
  frame: { current: null },
  index: 0,
}));
vi.mock("preact/hooks", async (original) => ({
  ...(await original<typeof import("preact/hooks")>()),
  useRef: () => (hooks.index++ % 2 === 0 ? hooks.bounds : hooks.frame),
  useLayoutEffect: (effect: (typeof hooks.effects)[number]) => hooks.effects.push(effect),
}));

afterEach(() => vi.unstubAllGlobals());

it("stretches toward each destination and settles immediately when reduced motion changes", () => {
  const frames: FrameRequestCallback[] = [];
  const preference = new EventTarget();
  vi.stubGlobal("matchMedia", () => preference);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => frames.push(frame));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  let top = 0;
  const list = { getBoundingClientRect: () => ({ top: 0, left: 0 }) };
  const pill = { parentElement: list, style: { clipPath: "" }, clientWidth: 120, clientHeight: 250 };
  const link = { getBoundingClientRect: () => ({ top, bottom: top + 48, left: 0, right: 120 }) };
  const navigation = {
    current: {
      querySelector: (selector: string) => (selector === ".nav-pill" ? pill : link),
    } as unknown as HTMLElement,
  };
  const render = (current: "overview" | "connection") => {
    AppNav({ navigation, current, sidebarHidden: false });
    return hooks.effects.shift()?.();
  };
  // Frames are drawn on an explicit clock: the pill advances by the time between drawn frames, not by the wall clock.
  let clock = 1000;
  const draw = (afterMs: number) => {
    clock += afterMs;
    frames.shift()?.(clock);
  };
  const height = () => {
    const [start, , end] = pill.style.clipPath.match(/[\d.]+(?=px)/g)?.map(Number) ?? [];
    return 250 - (start ?? NaN) - (end ?? NaN);
  };
  render("overview")?.();
  expect(height()).toBe(48);
  top = 200;
  const stop = render("connection");
  draw(0);
  expect(height()).toBe(48);
  let widest = 0;
  while (frames.length > 0) {
    draw(16);
    widest = Math.max(widest, height());
  }
  expect(widest).toBeGreaterThan(150);
  expect(height()).toBe(48);
  stop?.();
  top = 0;
  const cleanup = render("overview");
  draw(0);
  for (let frame = 0; frame < 12; frame++) draw(16);
  expect(height()).toBeGreaterThan(150);
  preference.dispatchEvent(new Event("change"));
  expect(pill.style.clipPath).toContain("inset(0.000px");
  expect(height()).toBe(48);
  cleanup?.();
});

it("spends a long stall between drawn frames as three frames, so the stretch is still drawn afterwards", () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("matchMedia", () => new EventTarget());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => frames.push(frame));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  let top = 0;
  const list = { getBoundingClientRect: () => ({ top: 0, left: 0 }) };
  const pill = { parentElement: list, style: { clipPath: "" }, clientWidth: 120, clientHeight: 250 };
  const link = { getBoundingClientRect: () => ({ top, bottom: top + 48, left: 0, right: 120 }) };
  const navigation = {
    current: {
      querySelector: (selector: string) => (selector === ".nav-pill" ? pill : link),
    } as unknown as HTMLElement,
  };
  const render = (current: "overview" | "connection") => {
    AppNav({ navigation, current, sidebarHidden: false });
    return hooks.effects.shift()?.();
  };
  render("overview")?.();
  // The first test left its bounds in the shared mock, so this render may have queued a frame; it is not the one driven.
  frames.length = 0;
  top = 200;
  const stop = render("connection");
  frames.shift()?.(1000);
  // The browser held rendering for a third of a second, as a view transition does while it captures the page.
  frames.shift()?.(1325);
  // The leading edge (the bottom, moving down) is far from its destination at 248: the stall cost three frames, not 325 ms.
  const leadingEdge = 250 - (pill.style.clipPath.match(/[\d.]+(?=px)/g)?.map(Number)[2] ?? NaN);
  expect(leadingEdge).toBeGreaterThan(48);
  expect(leadingEdge).toBeLessThan(200);
  expect(frames.length).toBe(1);
  stop?.();
});
