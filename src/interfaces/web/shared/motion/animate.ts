import { motionMilliseconds } from "../ui/motion-timing";
import { prefersReducedMotion } from "./reduced-motion";

/** How long a motion runs and how it eases, both taken from the motion tokens. */
export interface MotionTiming {
  readonly duration: number;
  readonly easing: string;
}

/**
 * Reads a motion's timing from a computed style. The defaults are the standard duration and easing; a caller names
 * other tokens only when its motion needs them.
 */
export function timingFrom(
  style: { getPropertyValue(name: string): string },
  durationToken = "--duration-medium",
  easingToken = "--ease-standard",
): MotionTiming {
  return {
    duration: motionMilliseconds(style.getPropertyValue(durationToken)),
    easing: style.getPropertyValue(easingToken).trim(),
  };
}

export interface Motion {
  /**
   * Starts keyframes on an element in place of any motion it already has. Returns the animation, or null when nothing
   * should move: reduced motion is on, or the element cannot animate.
   */
  play(element: Element, frames: Keyframe[], timing: MotionTiming): Animation | null;
  /** Ends the element's motion now. The element stays where it is drawn, which is its rest position once finished. */
  stop(element: Element): void;
}

/**
 * The motion of one part of a page. An element keeps at most one motion, so a new one replaces the last and never
 * stacks on it. Reduced motion is read on every call, so a change of preference takes effect at once.
 */
export function createMotion(reduced: () => boolean = prefersReducedMotion): Motion {
  const current = new WeakMap<Element, Animation>();
  return {
    play(element, frames, timing) {
      current.get(element)?.cancel();
      current.delete(element);
      if (reduced() || typeof element.animate !== "function") return null;
      const animation = element.animate(frames, { duration: timing.duration, easing: timing.easing });
      current.set(element, animation);
      return animation;
    },
    stop(element) {
      current.get(element)?.cancel();
      current.delete(element);
    },
  };
}
