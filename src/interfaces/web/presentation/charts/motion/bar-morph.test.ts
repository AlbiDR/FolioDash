import { afterEach, describe, expect, it, vi } from "vitest";
import { type BarFrame, type BarSnapshot, barMorph, createBarMorph } from "./bar-morph";

describe("barMorph", () => {
  const before: BarFrame = { zeroY: 100, scale: 2 };
  const after: BarFrame = { zeroY: 90, scale: 1 };

  it("keeps every value on the same place on the axis, so a bar lands where the new period draws it", () => {
    const morph = barMorph(50, before, 50, after);
    if (morph === null) throw new Error("expected a morph between different axes");
    for (let value = -3; value <= 3; value += 0.5) {
      const drawnAfter = after.zeroY - value * after.scale;
      const drawnBefore = before.zeroY - value * before.scale;
      expect(morph.scaleY * drawnAfter + morph.translateY).toBeCloseTo(drawnBefore, 9);
    }
  });

  it("shifts a bar horizontally from its new place back to its old one", () => {
    const morph = barMorph(100, before, 60, before);
    expect(morph).toEqual({ scaleY: 1, translateX: 40, translateY: 0 });
  });

  it("returns null when nothing moves or either axis has no scale", () => {
    expect(barMorph(50, before, 50, before)).toBeNull();
    expect(barMorph(50, { zeroY: 100, scale: 0 }, 50, after)).toBeNull();
    expect(barMorph(50, before, 50, { zeroY: 90, scale: 0 })).toBeNull();
  });
});

/** A bar or the zero line as the controller sees it: a fake Web Animations `animate`. */
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

function setup(
  items: ReturnType<typeof makeElement>[],
  zero: ReturnType<typeof makeElement> | null,
  { reduced = false } = {},
) {
  const svg = {
    animate: vi.fn(),
    querySelectorAll: () => items,
    querySelector: (selector: string) => (selector === ".bars-zero" ? zero : null),
  };
  vi.stubGlobal("window", { matchMedia: () => ({ matches: reduced }) });
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: (name: string) =>
      ({ "--duration-medium": "380ms", "--ease-standard": " cubic-bezier(0.2, 0, 0, 1) " })[name] ?? "",
  }));
  return createBarMorph(() => svg as unknown as SVGSVGElement);
}

function snapshot(keys: readonly string[], xs: readonly number[], frame: BarFrame | null): BarSnapshot {
  return { keys, xs, frame };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createBarMorph", () => {
  it("draws the first period at once, without moving anything", () => {
    const items = [makeElement(), makeElement()];
    const bars = setup(items, makeElement());
    bars.settle(snapshot(["a", "b"], [10, 40], { zeroY: 100, scale: 2 }), "3M");
    for (const item of items) expect(item.animate).not.toHaveBeenCalled();
  });

  it("does not move the bars when the same period re-renders", () => {
    const items = [makeElement()];
    const bars = setup(items, null);
    bars.settle(snapshot(["a"], [10], { zeroY: 100, scale: 2 }), "3M");
    bars.settle(snapshot(["a"], [30], { zeroY: 90, scale: 1 }), "3M");
    expect(items[0]?.animate).not.toHaveBeenCalled();
  });

  it("glides a month that stays and fades in a month that appears when the period changes", () => {
    const first = makeElement();
    const second = makeElement();
    const zero = makeElement();
    const bars = setup([first, second], zero);
    bars.settle(snapshot(["a", "b"], [10, 40], { zeroY: 100, scale: 2 }), "3M");
    bars.settle(snapshot(["b", "c"], [30, 60], { zeroY: 100, scale: 1 }), "6M");
    expect(first.animate.mock.calls[0]).toEqual([
      [
        { transform: "matrix(1, 0, 0, 2.000000, 10.000000, -100.000000)" },
        { transform: "matrix(1, 0, 0, 1.000000, 0.000000, 0.000000)" },
      ],
      { duration: 380, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    ]);
    expect(second.animate.mock.calls[0]).toEqual([
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 380, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    ]);
    expect(zero.animate).toHaveBeenCalledOnce();
  });

  it("takes the new period at once under reduced motion", () => {
    const item = makeElement();
    const bars = setup([item], null, { reduced: true });
    bars.settle(snapshot(["a"], [10], { zeroY: 100, scale: 2 }), "3M");
    bars.settle(snapshot(["a"], [30], { zeroY: 90, scale: 1 }), "6M");
    expect(item.animate).not.toHaveBeenCalled();
  });

  it("moves nothing it cannot compare: a chart with no scale keeps its bars still", () => {
    const item = makeElement();
    const bars = setup([item], null);
    bars.settle(snapshot(["a"], [10], null), "3M");
    bars.settle(snapshot(["a"], [30], { zeroY: 90, scale: 1 }), "6M");
    expect(item.animate).not.toHaveBeenCalled();
  });

  it("cancels a glide still running when the period changes again", () => {
    const item = makeElement();
    const bars = setup([item], null);
    bars.settle(snapshot(["a"], [10], { zeroY: 100, scale: 2 }), "3M");
    bars.settle(snapshot(["a"], [30], { zeroY: 90, scale: 1 }), "6M");
    bars.settle(snapshot(["a"], [50], { zeroY: 80, scale: 1 }), "1Y");
    expect(item.animations[0]?.cancel).toHaveBeenCalledOnce();
  });
});
