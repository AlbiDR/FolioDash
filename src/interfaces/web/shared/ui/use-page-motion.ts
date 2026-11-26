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
  // A page reached from inside the app arrives as one quicker gesture than a cold open (FD-029, decision 2). The mark
  // is styling state read by the arrival stylesheets, set before the new page mounts and kept for later arrivals.
  const markEntered = (): void => {
    page.current?.setAttribute("data-arrival", "entered");
  };
  let transitioning: ViewTransition | null = null;
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
    if (commit !== null) {
      markEntered();
      flushSync(commit);
    }
    // A forced finish commits here and now; a view transition still waiting for its update has nothing left to do.
    transitioning?.skipTransition();
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
      markEntered();
      flushSync(commit);
      return;
    }
    // Where the browser has same-document view transitions, the sidebar and toolbar hold still while the page changes
    // (FD-029, decision 3); the latest destination is committed once the old page has been captured.
    if (typeof document.startViewTransition === "function") {
      stop();
      pending = commit;
      try {
        const transition = document.startViewTransition(() => {
          const latest = pending;
          pending = null;
          if (latest !== null) {
            markEntered();
            flushSync(latest);
          }
        });
        transitioning = transition;
        // A transition skipped by a forced finish or replaced by a newer navigation rejects these; that is expected.
        transition.ready.catch(() => undefined);
        transition.updateCallbackDone.catch(() => undefined);
        void transition.finished.finally(() => {
          if (transitioning === transition) transitioning = null;
        });
      } catch {
        finish();
      }
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
      transitioning?.skipTransition();
      stop();
    },
  };
}

/** One live page at a time: change pages inside a view transition, or finish the exit before replacing it, and coalesce
 * rapid destinations. */
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
