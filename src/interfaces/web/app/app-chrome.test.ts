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
  const tick = (elapsed: number) => frames.shift()?.(performance.now() + elapsed);
  const height = () => {
    const [start, , end] = pill.style.clipPath.match(/[\d.]+(?=px)/g)?.map(Number) ?? [];
    return 250 - (start ?? NaN) - (end ?? NaN);
  };
  render("overview")?.();
  expect(height()).toBe(48);
  top = 200;
  const stop = render("connection");
  tick(180);
  expect(height()).toBeGreaterThan(150);
  tick(600);
  expect(height()).toBe(48);
  stop?.();
  top = 0;
  const cleanup = render("overview");
  tick(180);
  expect(height()).toBeGreaterThan(150);
  preference.dispatchEvent(new Event("change"));
  expect(pill.style.clipPath).toContain("inset(0.000px");
  expect(height()).toBe(48);
  cleanup?.();
});
