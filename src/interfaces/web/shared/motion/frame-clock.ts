/**
 * The most one drawn frame may advance a time-driven motion, in milliseconds: three frames at 60 Hz. A frame can arrive
 * long after the one before it, for instance while a view transition holds rendering to capture the page, and a motion
 * measured against the wall clock would spend that whole gap in a single jump and never be seen.
 */
export const MAX_FRAME_STEP_MS = 48;

/**
 * How far a motion has run after the frame drawn at `now`, given how far it had run and when the previous frame was
 * drawn (`null` for the first frame, which starts it). A frame never advances the motion by more than
 * MAX_FRAME_STEP_MS, and a clock that runs backwards advances nothing.
 */
export function advanceElapsed(elapsedMs: number, previousFrame: number | null, now: number): number {
  if (previousFrame === null) return elapsedMs;
  return elapsedMs + Math.min(Math.max(0, now - previousFrame), MAX_FRAME_STEP_MS);
}
