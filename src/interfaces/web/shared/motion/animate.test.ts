import { afterEach, describe, expect, it, vi } from "vitest";
import { createMotion, timingFrom } from "./animate";

const tokens: Record<string, string> = {
  "--duration-medium": "380ms",
  "--ease-standard": " cubic-bezier(0.2, 0, 0, 1) ",
  "--duration-short": "180ms",
  "--ease-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
};
const style = { getPropertyValue: (name: string) => tokens[name] ?? "" };

/** An element as the primitive sees it: a fake Web Animations `animate` that records each motion it starts. */
function makeElement() {
  const animations: { cancel: ReturnType<typeof vi.fn> }[] = [];
  return {
    animations,
    animate: vi.fn(() => {
      const animation = { cancel: vi.fn() };
      animations.push(animation);
      return animation;
    }),
  };
}

const timing = { duration: 380, easing: "cubic-bezier(0.2, 0, 0, 1)" };
const frames = [{ opacity: 0 }, { opacity: 1 }];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("timingFrom", () => {
  it("reads the standard duration and easing, trimmed", () => {
    expect(timingFrom(style)).toEqual(timing);
  });

  it("reads other tokens only when a caller names them", () => {
    expect(timingFrom(style, "--duration-short", "--ease-spring")).toEqual({
      duration: 180,
      easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    });
  });
});

describe("createMotion", () => {
  it("starts the keyframes with the given timing and returns the animation", () => {
    const element = makeElement();
    const animation = createMotion(() => false).play(element as unknown as Element, frames, timing);
    expect(element.animate).toHaveBeenCalledWith(frames, timing);
    expect(animation).toBe(element.animations[0]);
  });

  it("replaces the motion an element already has, so motions never stack", () => {
    const element = makeElement();
    const motion = createMotion(() => false);
    motion.play(element as unknown as Element, frames, timing);
    motion.play(element as unknown as Element, frames, timing);
    expect(element.animations[0]?.cancel).toHaveBeenCalledOnce();
    expect(element.animations[1]?.cancel).not.toHaveBeenCalled();
  });

  it("stops the current motion and forgets it, so a second stop does nothing more", () => {
    const element = makeElement();
    const motion = createMotion(() => false);
    motion.play(element as unknown as Element, frames, timing);
    motion.stop(element as unknown as Element);
    motion.stop(element as unknown as Element);
    expect(element.animations[0]?.cancel).toHaveBeenCalledOnce();
  });

  it("stops an element with no motion without error", () => {
    const element = makeElement();
    expect(() => {
      createMotion(() => false).stop(element as unknown as Element);
    }).not.toThrow();
  });

  it("starts nothing under reduced motion, and cancels the motion it replaces", () => {
    const element = makeElement();
    let reduced = false;
    const motion = createMotion(() => reduced);
    motion.play(element as unknown as Element, frames, timing);
    reduced = true;
    expect(motion.play(element as unknown as Element, frames, timing)).toBeNull();
    expect(element.animate).toHaveBeenCalledOnce();
    expect(element.animations[0]?.cancel).toHaveBeenCalledOnce();
  });

  it("reads the reduced-motion preference from the window by default", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const element = makeElement();
    expect(createMotion().play(element as unknown as Element, frames, timing)).toBeNull();
    expect(element.animate).not.toHaveBeenCalled();
  });

  it("starts nothing where the Web Animations API is missing", () => {
    const element = { animations: [] };
    expect(createMotion(() => false).play(element as unknown as Element, frames, timing)).toBeNull();
  });
});
