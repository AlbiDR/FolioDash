import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { motionMilliseconds } from "../../../shared/ui/motion-timing";
import { morphTransform } from "./geometry-morph";
import type { ChartGeometry } from "../line-chart-geometry";

/**
 * Morphs the drawn series from the previous period's axes to the new ones when
 * the period changes. Only the layer's transform moves; the settled geometry is
 * the exact one computed for the new period. First paint, reduced motion and
 * browsers without the animation API draw the new chart at once.
 */
export function useGeometryMorph(
  layer: RefObject<SVGGElement | null>,
  geometry: ChartGeometry,
  updateKey: string | undefined,
): void {
  const previous = useRef<{ readonly geometry: ChartGeometry; readonly updateKey: string | undefined } | null>(null);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { geometry, updateKey };
    const node = layer.current;
    if (before === null || before.updateKey === updateKey || node === null || typeof node.animate !== "function") {
      return undefined;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const transform = morphTransform(before.geometry, geometry);
    if (transform === null) return undefined;
    const style = getComputedStyle(node);
    // CSS matrix() takes comma-separated numbers; fixed precision keeps every frame a plain decimal.
    const matrix = (scaleX: number, scaleY: number, translateX: number, translateY: number): string =>
      `matrix(${[scaleX, 0, 0, scaleY, translateX, translateY].map((value) => value.toFixed(6)).join(", ")})`;
    const animation = node.animate(
      [
        {
          transform: matrix(transform.scaleX, transform.scaleY, transform.translateX, transform.translateY),
        },
        { transform: matrix(1, 1, 0, 0) },
      ],
      {
        duration: motionMilliseconds(style.getPropertyValue("--duration-medium")),
        easing: style.getPropertyValue("--ease-standard").trim(),
      },
    );
    return () => {
      animation.cancel();
    };
  }, [geometry, updateKey]);
}
