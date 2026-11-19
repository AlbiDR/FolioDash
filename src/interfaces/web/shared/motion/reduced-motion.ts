/** Whether the person has asked for reduced motion. Every shared motion primitive reads it here, and nowhere else. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
