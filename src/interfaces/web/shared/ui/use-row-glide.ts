import type { RefObject } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";
import { createRowGlide } from "./row-glide";

/**
 * Glides the rows under `root` that match `rowSelector` to their new places when
 * `orderKey` changes. The controller settles after every render, so the resting
 * positions it compares against are always the ones on screen. See
 * `createRowGlide` for the rules.
 */
export function useRowGlide(root: RefObject<HTMLElement | null>, rowSelector: string, orderKey: string): void {
  const [glide] = useState(() => createRowGlide(() => root.current, rowSelector));
  useLayoutEffect(() => {
    glide.settle(orderKey);
  });
}
