import { motionMilliseconds } from "./motionTiming";
import type { RefObject } from "preact";
import { flushSync } from "preact/compat";
import { useEffect, useMemo } from "preact/hooks";

/** Interruptible controller shared by the hook and deterministic lifecycle checks. */
export function createPageMotion(page: RefObject<HTMLElement | null>) {
  let animation: Animation | null = null;
  let pending: (() => void) | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  const stop = (): void => {
    generation++;
    clearTimeout(timeout);
    if (animation !== null) {
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
    }
    animation = null;
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
    if (pending !== null) { pending = commit; return; }
    const element = page.current;
    if (element === null || typeof element.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) {
      stop();
      flushSync(commit);
      return;
    }
    const current = getComputedStyle(element);
    const opacity = current.opacity;
    const transform = current.transform;
    const duration = motionMilliseconds(current.getPropertyValue("--duration-short"));
    const nudge = current.getPropertyValue("--motion-nudge").trim();
    const easing = current.getPropertyValue("--ease-standard").trim();
    stop();
    pending = commit;
    element.inert = true;
    element.setAttribute("data-page-exiting", "true");
    const request = generation;
    const arrive = (): void => {
      if (request !== generation) return;
      finish();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden || page.current === null) return;
      const incoming = page.current;
      const arrival = incoming.animate([{ opacity: 0, transform: `translateY(${nudge})` }, { opacity: 1, transform: "none" }], { duration, easing });
      animation = arrival;
      arrival.onfinish = () => { if (animation === arrival) animation = null; };
    };
    try {
      animation = element.animate([{ opacity, transform }, { opacity: 0, transform: `translateY(calc(-1 * ${nudge}))` }], { duration, easing, fill: "forwards" });
      animation.onfinish = arrive;
      // Backgrounding or an externally cancelled animation must never strand an inert page.
      animation.oncancel = arrive;
      timeout = setTimeout(arrive, duration + 100);
    } catch {
      finish();
    }
  };
  return { change, finish, cancel: (): void => { pending = null; stop(); } };
}

/** One live page at a time: finish the exit before replacing it, and coalesce rapid destinations. */
export function usePageMotion(page: RefObject<HTMLElement | null>) {
  const motion = useMemo(() => createPageMotion(page), [page]);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settle = (): void => { if (preference.matches || document.hidden) motion.finish(); };
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
