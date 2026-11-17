import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { motionMilliseconds } from "../../shared/ui/motion-timing";

/** Fades the plot in when the chart's period changes, and gives the fade back up when motion is reduced. */
export function useUpdateFade(
  plot: RefObject<SVGSVGElement | null>,
  updateKey: string | undefined,
  hidden: boolean,
): void {
  const previousUpdate = useRef(updateKey);
  const updateAnimation = useRef<Animation | null>(null);
  const interruptedOpacity = useRef<number | null>(null);
  useLayoutEffect(() => {
    const changed = previousUpdate.current !== updateKey;
    previousUpdate.current = updateKey;
    updateAnimation.current?.cancel();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settle = (): void => {
      if (preference.matches) updateAnimation.current?.cancel();
    };
    const node = plot.current;
    if (changed && !preference.matches && node !== null && typeof node.animate === "function") {
      const style = getComputedStyle(node);
      updateAnimation.current = node.animate(
        [
          {
            opacity: interruptedOpacity.current ?? Number.parseFloat(style.getPropertyValue("--motion-update-opacity")),
          },
          { opacity: 1 },
        ],
        {
          duration: motionMilliseconds(style.getPropertyValue("--duration-feedback")),
          easing: style.getPropertyValue("--ease-standard").trim(),
        },
      );
    }
    interruptedOpacity.current = null;
    preference.addEventListener("change", settle);
    return () => {
      preference.removeEventListener("change", settle);
      interruptedOpacity.current =
        updateAnimation.current?.playState === "running" && node !== null
          ? Number.parseFloat(getComputedStyle(node).opacity)
          : null;
      updateAnimation.current?.cancel();
    };
  }, [updateKey, hidden]);
}
