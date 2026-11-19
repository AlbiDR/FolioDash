import type { RefObject } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { createMotion, timingFrom } from "../../shared/motion/animate";
import { REDUCED_MOTION_QUERY } from "../../shared/motion/reduced-motion";
import { createSettle } from "../../shared/motion/settle";

/**
 * Fades the plot in when the chart's period changes. A fade still running when the period changes continues from the
 * opacity it has reached. A privacy change cancels a running fade at once, and turning reduced motion on cancels it too.
 */
export function useUpdateFade(
  plot: RefObject<SVGSVGElement | null>,
  updateKey: string | undefined,
  hidden: boolean,
): void {
  const [motion] = useState(() => createMotion());
  const [settle] = useState(() => createSettle<null>());
  const plotted = useRef<SVGSVGElement | null>(null);
  useLayoutEffect(() => {
    const node = plot.current;
    const { changed } = settle(null, updateKey);
    if (node === null) return undefined;
    // Read the fade before it is replaced: a fade still running is what the plot shows now.
    const style = getComputedStyle(node);
    const running = node.getAnimations().some((animation) => animation.playState === "running");
    const from = running
      ? Number.parseFloat(style.opacity)
      : Number.parseFloat(style.getPropertyValue("--motion-update-opacity"));
    motion.stop(node);
    plotted.current = node;
    if (changed) motion.play(node, [{ opacity: from }, { opacity: 1 }], timingFrom(style, "--duration-feedback"));
    const preference = window.matchMedia(REDUCED_MOTION_QUERY);
    const settleOnChange = (): void => {
      if (preference.matches) motion.stop(node);
    };
    preference.addEventListener("change", settleOnChange);
    return () => {
      preference.removeEventListener("change", settleOnChange);
    };
  }, [updateKey, hidden]);
  useLayoutEffect(
    () => () => {
      if (plotted.current !== null) motion.stop(plotted.current);
    },
    [motion],
  );
}
