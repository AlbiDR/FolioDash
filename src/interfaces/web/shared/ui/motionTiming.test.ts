import { expect, it } from "vitest";
import { motionMilliseconds } from "./motionTiming";

it("preserves timing when production CSS serializes milliseconds as seconds", () => {
  expect(motionMilliseconds("180ms")).toBe(180);
  expect(motionMilliseconds(" .18s ")).toBe(180);
  expect(motionMilliseconds(".38s")).toBe(380);
  expect(motionMilliseconds("0s")).toBe(0);
});

it("settles immediately if the timing token is absent or invalid", () => {
  for (const value of ["", "invalid", "-1s", "180"]) expect(motionMilliseconds(value)).toBe(0);
});
