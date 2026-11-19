import type { RefObject } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";
import { type BarSnapshot, createBarMorph } from "./bar-morph";

/**
 * Moves the bars under `plot` when the period `updateKey` changes. The controller
 * settles after every render, so the positions it compares against are the ones
 * drawn on screen. See `createBarMorph` for the rules.
 */
export function useBarMorph(
  plot: RefObject<SVGSVGElement | null>,
  snapshot: BarSnapshot,
  updateKey: string | undefined,
): void {
  const [controller] = useState(() => createBarMorph(() => plot.current));
  useLayoutEffect(() => {
    controller.settle(snapshot, updateKey);
  });
}
