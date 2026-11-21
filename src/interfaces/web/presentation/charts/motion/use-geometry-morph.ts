import type { RefObject } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { createMotion, timingFrom } from "../../../shared/motion/animate";
import { createSettle } from "../../../shared/motion/settle";
import { morphTransform } from "./geometry-morph";
import type { ChartGeometry } from "../line-chart-geometry";

/**
 * Morphs the drawn series from the previous period's axes to the new ones when
 * the period changes. Only the layer's transform moves; the settled geometry is
 * the exact one computed for the new period. First paint, reduced motion and
 * browsers without the animation API draw the new chart at once. A new geometry
 * replaces a morph still running.
 */
export function useGeometryMorph(
  layer: RefObject<SVGGElement | null>,
  geometry: ChartGeometry,
  updateKey: string | undefined,
  layoutReady = true,
): void {
  const [motion] = useState(() => createMotion());
  const [settle] = useState(() => createSettle<ChartGeometry>());
  const morphing = useRef<SVGGElement | null>(null);
  useLayoutEffect(() => {
    if (!layoutReady) return;
    const { before, changed } = settle(geometry, updateKey);
    const node = layer.current;
    if (node === null) return;
    morphing.current = node;
    if (before !== geometry) motion.stop(node);
    if (!changed || before === null) return;
    const transform = morphTransform(before, geometry);
    if (transform === null) return;
    // CSS matrix() takes comma-separated numbers; fixed precision keeps every frame a plain decimal.
    const matrix = (scaleX: number, scaleY: number, translateX: number, translateY: number): string =>
      `matrix(${[scaleX, 0, 0, scaleY, translateX, translateY].map((value) => value.toFixed(6)).join(", ")})`;
    motion.play(
      node,
      [
        {
          transform: matrix(transform.scaleX, transform.scaleY, transform.translateX, transform.translateY),
        },
        { transform: matrix(1, 1, 0, 0) },
      ],
      timingFrom(getComputedStyle(node)),
    );
  });
  useLayoutEffect(
    () => () => {
      if (morphing.current !== null) motion.stop(morphing.current);
    },
    [motion],
  );
}
