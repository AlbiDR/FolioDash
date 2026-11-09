import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPageMotion } from "./usePageMotion";

function fixture() {
  const animations: { onfinish: (() => void) | null; oncancel: (() => void) | null; cancel: ReturnType<typeof vi.fn> }[] = [];
  const attributes = new Set<string>();
  const node = {
    inert: false,
    setAttribute: (name: string) => attributes.add(name),
    removeAttribute: (name: string) => attributes.delete(name),
    animate: vi.fn(() => {
      const animation = { onfinish: null as (() => void) | null, oncancel: null as (() => void) | null, cancel: vi.fn(() => undefined) };
      animations.push(animation);
      return animation;
    }),
  };
  const media = { matches: false };
  const visibility = { hidden: false };
  vi.stubGlobal("window", { matchMedia: () => media });
  vi.stubGlobal("document", visibility);
  vi.stubGlobal("getComputedStyle", () => ({ opacity: "0.8", transform: "none", getPropertyValue: (name: string) => ({ "--duration-short": ".18s", "--motion-nudge": "2px", "--ease-standard": "ease-out" })[name] }));
  const motion = createPageMotion({ current: node as unknown as HTMLElement });
  return { motion, node, media, visibility, animations, attributes };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("keeps the outgoing page inert until exit ends, then commits only the latest destination", () => {
  const { motion, node, animations, attributes } = fixture();
  const first = vi.fn();
  const last = vi.fn();
  motion.change(first);
  motion.change(last);
  expect(first).not.toHaveBeenCalled();
  expect(last).not.toHaveBeenCalled();
  expect(node.inert).toBe(true);
  expect(attributes.has("data-page-exiting")).toBe(true);
  animations[0]?.onfinish?.();
  expect(first).not.toHaveBeenCalled();
  expect(last).toHaveBeenCalledOnce();
  expect(node.inert).toBe(false);
  expect(animations).toHaveLength(2);
  vi.runAllTimers();
  expect(last).toHaveBeenCalledOnce();
});

it("returning to the current route cancels a pending destination and ignores stale callbacks", () => {
  const { motion, node, animations } = fixture();
  const commit = vi.fn();
  motion.change(commit);
  const stale = animations[0]?.onfinish;
  motion.cancel();
  stale?.();
  vi.runAllTimers();
  expect(commit).not.toHaveBeenCalled();
  expect(node.inert).toBe(false);
});

it("settles immediately for privacy and preference changes without letting an old callback navigate again", () => {
  const { motion, node, animations, media } = fixture();
  const commit = vi.fn();
  motion.change(commit);
  const stale = animations[0]?.onfinish;
  media.matches = true;
  motion.finish();
  stale?.();
  expect(commit).toHaveBeenCalledOnce();
  expect(node.inert).toBe(false);
  expect(animations).toHaveLength(1);
});

it("skips motion for reduced motion and background pages", () => {
  const { motion, media, visibility, node } = fixture();
  const commit = vi.fn();
  media.matches = true;
  motion.change(commit);
  media.matches = false;
  visibility.hidden = true;
  motion.change(commit);
  expect(commit).toHaveBeenCalledTimes(2);
  expect(node.animate).not.toHaveBeenCalled();
});

it("recovers if animation events never arrive or the browser rejects animation", () => {
  const { motion, node } = fixture();
  const commit = vi.fn();
  motion.change(commit);
  vi.advanceTimersByTime(280);
  expect(commit).toHaveBeenCalledOnce();
  expect(node.inert).toBe(false);
  node.animate.mockImplementation(() => { throw new Error("Animation unavailable"); });
  motion.change(commit);
  expect(commit).toHaveBeenCalledTimes(2);
  expect(node.inert).toBe(false);
});

it("settles an externally cancelled exit and safely interrupts an arrival with a new exit", () => {
  const { motion, node, animations } = fixture();
  const first = vi.fn();
  motion.change(first);
  animations[0]?.oncancel?.();
  expect(first).toHaveBeenCalledOnce();
  const staleArrival = animations[1]?.onfinish;
  const next = vi.fn();
  motion.change(next);
  staleArrival?.();
  expect(node.inert).toBe(true);
  expect(animations[1]?.cancel).toHaveBeenCalledOnce();
  animations[2]?.onfinish?.();
  expect(next).toHaveBeenCalledOnce();
  expect(node.inert).toBe(false);
  motion.cancel();
});
