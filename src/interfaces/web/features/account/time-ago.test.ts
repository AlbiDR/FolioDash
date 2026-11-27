import { describe, expect, it } from "vitest";
import { describeAge } from "./time-ago";

const MINUTE = 60_000;

describe("describeAge", () => {
  it.each([
    [0, "just now"],
    [30_000, "just now"],
    [MINUTE, "1 minute ago"],
    [5 * MINUTE, "5 minutes ago"],
    [60 * MINUTE, "1 hour ago"],
    [3 * 60 * MINUTE, "3 hours ago"],
    [24 * 60 * MINUTE, "1 day ago"],
    [10 * 24 * 60 * MINUTE, "10 days ago"],
  ])("describes %i ms as %s", (age, expected) => {
    expect(describeAge(1_000_000_000, 1_000_000_000 - age)).toBe(expected);
  });

  it("never says the future: a clock that ran backwards reads as just now", () => {
    expect(describeAge(1000, 5000)).toBe("just now");
  });
});

it("never reads an age higher than it is", () => {
  expect(describeAge(90_000, 0)).toBe("1 minute ago");
  expect(describeAge(5_399_000, 0)).toBe("1 hour ago");
  expect(describeAge(36 * 3_600_000, 0)).toBe("1 day ago");
});
