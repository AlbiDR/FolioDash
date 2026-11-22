import { describe, expect, it } from "vitest";
import { chartArrivalClass, chartArrivalOrder } from "./recipe";

describe("chart arrival recipes", () => {
  it("exposes only the named chart recipe classes", () => {
    expect(chartArrivalClass("bar")).toBe("motion-bar-rise");
    expect(chartArrivalClass("ranking")).toBe("motion-ranking-rise");
    expect(chartArrivalClass("ring-slice")).toBe("motion-ring-slice");
    expect(chartArrivalClass("marker")).toBe("motion-marker-arrive");
  });

  it("normalizes visual ordering without owning timing", () => {
    expect(chartArrivalOrder(3.8)).toEqual({ "--motion-index": 3 });
    expect(chartArrivalOrder(-2)).toEqual({ "--motion-index": 0 });
  });
});
