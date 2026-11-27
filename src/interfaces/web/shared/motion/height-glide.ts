import type { RefObject } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";
import { createMotion, timingFrom } from "./animate";

/**
 * Eases a box from its last height to its new one when `changeKey` changes, so a card that gains or loses rows does not
 * snap and drag what is below it. The height is recorded after every render, so an unrelated render cannot start a
 * movement. Reduced motion, and a box that did not change height, take their place at once.
 *
 * Owner decision 2026-11-27 (FD-029, phase 6 tail): a card's height may animate here, once, over the medium duration,
 * because no transform can move the content below the card without distorting it.
 */
export function useHeightGlide(box: RefObject<HTMLElement | null>, changeKey: string): void {
  const [state] = useState(() => ({ motion: createMotion(), height: 0, key: changeKey }));
  useLayoutEffect(() => {
    const node = box.current;
    if (node === null) return;
    const previous = state.height;
    // The glide still running is part of what is drawn: measure the box at rest, then restart from where it was drawn.
    const drawn = node.getBoundingClientRect().height;
    state.motion.stop(node);
    const height = node.getBoundingClientRect().height;
    state.height = height;
    const changed = state.key !== changeKey;
    state.key = changeKey;
    if (!changed || previous === 0 || Math.abs(previous - height) < 1) return;
    const from = Math.abs(drawn - height) >= 1 ? drawn : previous;
    state.motion.play(
      node,
      [
        { height: `${String(from)}px`, overflow: "clip" },
        { height: `${String(height)}px`, overflow: "clip" },
      ],
      timingFrom(getComputedStyle(node)),
    );
  });
}
