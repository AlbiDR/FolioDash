import { describe, expect, it } from "vitest";
import { displayedHundredths, rowMarks } from "./row-marks";

describe("row marks", () => {
  it("marks the largest and smallest figures by position", () => {
    const marks = rowMarks([1, 5, -2, 3]);
    expect([...marks.best]).toEqual([1]);
    expect([...marks.worst]).toEqual([2]);
  });

  it("ignores missing figures and never lets one win", () => {
    const marks = rowMarks([null, 4, null, 9, 1]);
    expect([...marks.best]).toEqual([3]);
    expect([...marks.worst]).toEqual([4]);
  });

  it("marks every month that shares the best or worst figure", () => {
    const marks = rowMarks([2, 7, 7, 2, 4]);
    expect([...marks.best]).toEqual([1, 2]);
    expect([...marks.worst]).toEqual([0, 3]);
  });

  it("marks nothing when fewer than three figures exist or they are all equal", () => {
    expect(rowMarks([1, 9, null]).best.size).toBe(0);
    expect(rowMarks([null, null, null, null]).worst.size).toBe(0);
    expect(rowMarks([3, 3, 3]).best.size).toBe(0);
  });

  it("compares percentages as displayed, so identical readings are marked together", () => {
    expect(displayedHundredths(0.00601)).toBe(displayedHundredths(0.00604));
    expect(displayedHundredths(-0.00005)).toBe(-1);
    expect(displayedHundredths(0.00004)).toBe(0);
    expect(displayedHundredths(null)).toBeNull();
    const marks = rowMarks([0.00601, 0.0032, 0.00604, -0.01].map(displayedHundredths));
    expect([...marks.best]).toEqual([0, 2]);
    expect([...marks.worst]).toEqual([3]);
  });
});
