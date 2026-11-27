import { expect, it } from "vitest";
import { MAX_FRAME_STEP_MS, advanceElapsed } from "./frame-clock";

it("starts at the first frame and then follows drawn frames at their real spacing", () => {
  let elapsed = advanceElapsed(0, null, 1000);
  expect(elapsed).toBe(0);
  elapsed = advanceElapsed(elapsed, 1000, 1016);
  elapsed = advanceElapsed(elapsed, 1016, 1033);
  expect(elapsed).toBe(33);
});

it("spends a long stall as at most three frames, so the motion is still drawn afterwards", () => {
  expect(advanceElapsed(0, 12, 337)).toBe(MAX_FRAME_STEP_MS);
  expect(advanceElapsed(100, 0, 100000)).toBe(100 + MAX_FRAME_STEP_MS);
});

it("never runs backwards", () => {
  expect(advanceElapsed(40, 500, 400)).toBe(40);
});
