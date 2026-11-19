/** The media query for reduced motion. Readers and change listeners both use this one string. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Whether the person has asked for reduced motion. Every shared motion primitive reads it here, and nowhere else. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
