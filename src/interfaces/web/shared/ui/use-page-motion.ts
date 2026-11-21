import type { RefObject } from "preact";
import { flushSync } from "preact/compat";
import { useEffect, useMemo } from "preact/hooks";
import { createMotion, type Motion, timingFrom } from "../motion/animate";
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from "../motion/reduced-motion";

/**
 * Interruptible controller shared by the hook and deterministic lifecycle checks. The motion of the page goes through
 * the shared motion instance. The controller keeps the handlers that decide when a page commits, and clears them before
 * it stops a motion, so a stop never runs a callback that is waiting for a cancel.
 */
export function createPageMotion(page: RefObject<HTMLElement | null>, motion: Motion = createMotion()) {
  let animation: Animation | null = null;
  let animated: HTMLElement | null = null;
  let pending: (() => void) | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  const stop = (): void => {
    generation++;
    clearTimeout(timeout);
    if (animation !== null) {
      animation.onfinish = null;
      animation.oncancel = null;
    }
    if (animated !== null) motion.stop(animated);
    animation = null;
    animated = null;
    if (page.current !== null) {
      page.current.inert = false;
      page.current.removeAttribute("data-page-exiting");
    }
  };
  const finish = (): void => {
    const commit = pending;
    pending = null;
    stop();
    if (commit !== null) flushSync(commit);
  };
  const change = (commit: () => void): void => {
    // The latest destination replaces the pending destination, never mounts an intermediate screen.
    if (pending !== null) {
      pending = commit;
      return;
    }
    const element = page.current;
    if (element === null || typeof element.animate !== "function" || prefersReducedMotion() || document.hidden) {
      stop();
      flushSync(commit);
      return;
    }
    const current = getComputedStyle(element);
    const opacity = current.opacity;
    const transform = current.transform;
    const timing = timingFrom(current, "--duration-short");
    const nudge = current.getPropertyValue("--motion-nudge").trim();
    stop();
    pending = commit;
    element.inert = true;
    element.setAttribute("data-page-exiting", "true");
    const request = generation;
    const settle = (): void => {
      if (request === generation) finish();
    };
    try {
      const exit = motion.play(
        element,
        [
          { opacity, transform },
          { opacity: 0, transform: `translateY(calc(-1 * ${nudge}))` },
        ],
        { ...timing, fill: "forwards" },
      );
      if (exit === null) {
        finish();
        return;
      }
      animation = exit;
      animated = element;
      exit.onfinish = settle;
      // Backgrounding or an externally cancelled animation must never strand an inert page.
      exit.oncancel = settle;
      timeout = setTimeout(settle, timing.duration + 100);
    } catch {
      finish();
    }
  };
  return {
    change,
    finish,
    cancel: (): void => {
      pending = null;
      stop();
    },
  };
}

/** One live page at a time: finish the exit before replacing it, and coalesce rapid destinations. */
export function usePageMotion(page: RefObject<HTMLElement | null>) {
  const motion = useMemo(() => createPageMotion(page), [page]);
  useEffect(() => {
    const preference = window.matchMedia(REDUCED_MOTION_QUERY);
    const settle = (): void => {
      if (preference.matches || document.hidden) motion.finish();
    };
    preference.addEventListener("change", settle);
    document.addEventListener("visibilitychange", settle);
    return () => {
      preference.removeEventListener("change", settle);
      document.removeEventListener("visibilitychange", settle);
      motion.cancel();
    };
  }, [motion]);
  return motion;
}
