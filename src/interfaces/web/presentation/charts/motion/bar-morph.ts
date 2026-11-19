import { motionMilliseconds } from "../../../shared/ui/motion-timing";

/** Where a bar chart's zero line sits and how many pixels one unit of value spans: y(value) = zeroY - value * scale. */
export interface BarFrame {
  readonly zeroY: number;
  readonly scale: number;
}

/** A vertical affine map with a horizontal shift, drawn in the chart's own units. */
export interface BarMorph {
  readonly scaleY: number;
  readonly translateX: number;
  readonly translateY: number;
}

/**
 * The transform that draws a bar's next position at its previous one, so
 * animating it back to the identity moves the bar from its old place to its new
 * one. Every value keeps its place on the axis within the map, so the bar lands
 * exactly where the new chart draws it. Returns null when nothing moves or
 * either chart has no scale to compare.
 */
export function barMorph(previousX: number, previous: BarFrame, nextX: number, next: BarFrame): BarMorph | null {
  if (!(previous.scale > 0) || !(next.scale > 0)) return null;
  const scaleY = previous.scale / next.scale;
  const translateY = previous.zeroY - scaleY * next.zeroY;
  const translateX = previousX - nextX;
  const unchanged = Math.abs(scaleY - 1) < 1e-9 && Math.abs(translateY) < 1e-6 && Math.abs(translateX) < 1e-6;
  return unchanged ? null : { scaleY, translateX, translateY };
}

/** The bars as drawn in one render: their keys in order, where each starts, and the axis they share. */
export interface BarSnapshot {
  readonly keys: readonly string[];
  readonly xs: readonly number[];
  readonly frame: BarFrame | null;
}

export interface BarMorphController {
  /** Call after every render with the bars just drawn and the period they belong to. A change of period moves the bars; a newcomer fades in. */
  settle(snapshot: BarSnapshot, updateKey: string | undefined): void;
}

/**
 * Moves the bars of a monthly chart from where the previous period drew them to
 * where the new period draws them. A month that stays keeps its element and
 * glides; a month that appears fades in; a month that leaves is not drawn. Every
 * bar and the zero line share one duration and none waits for another. Reduced
 * motion, browsers without the Web Animations API and the first render take the
 * new chart at once.
 */
export function createBarMorph(root: () => SVGSVGElement | null): BarMorphController {
  let previous: BarSnapshot | null = null;
  let previousKey: string | undefined;
  let hasKey = false;
  const animations = new WeakMap<Element, Animation>();
  return {
    settle(snapshot, updateKey) {
      const before = previous;
      const changed = hasKey && previousKey !== updateKey;
      previous = snapshot;
      previousKey = updateKey;
      hasKey = true;
      const svg = root();
      if (svg === null || !changed) return;
      const items = svg.querySelectorAll<SVGGElement>(".bars-item");
      for (const item of items) animations.get(item)?.cancel();
      const zero = svg.querySelector<SVGLineElement>(".bars-zero");
      if (zero !== null) animations.get(zero)?.cancel();
      if (before === null) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || typeof svg.animate !== "function") return;
      const style = getComputedStyle(svg);
      const duration = motionMilliseconds(style.getPropertyValue("--duration-medium"));
      const easing = style.getPropertyValue("--ease-standard").trim();
      const play = (element: Element, frames: Keyframe[]): void => {
        animations.set(element, element.animate(frames, { duration, easing }));
      };
      const matrix = (scaleY: number, translateX: number, translateY: number): string =>
        `matrix(1, 0, 0, ${scaleY.toFixed(6)}, ${translateX.toFixed(6)}, ${translateY.toFixed(6)})`;
      const identity = matrix(1, 0, 0);

      snapshot.keys.forEach((key, index) => {
        const item = items[index];
        if (item === undefined) return;
        const oldIndex = before.keys.indexOf(key);
        if (oldIndex < 0) {
          play(item, [{ opacity: 0 }, { opacity: 1 }]);
          return;
        }
        const from = before.xs[oldIndex];
        const next = snapshot.xs[index];
        if (before.frame === null || snapshot.frame === null || from === undefined || next === undefined) return;
        const morph = barMorph(from, before.frame, next, snapshot.frame);
        if (morph !== null)
          play(item, [
            { transform: matrix(morph.scaleY, morph.translateX, morph.translateY) },
            { transform: identity },
          ]);
      });

      if (zero !== null && before.frame !== null && snapshot.frame !== null) {
        const morph = barMorph(0, before.frame, 0, snapshot.frame);
        if (morph !== null)
          play(zero, [
            { transform: matrix(morph.scaleY, morph.translateX, morph.translateY) },
            { transform: identity },
          ]);
      }
    },
  };
}
