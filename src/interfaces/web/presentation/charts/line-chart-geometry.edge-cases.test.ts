import { describe, expect, it } from "vitest";
import { computeLineChart, type ChartSeries } from "./line-chart-geometry";

const LAYOUT = { width: 720, height: 300, margin: { top: 12, right: 78, bottom: 28, left: 8 }, includeZero: false };
const WEEK = 7 * 86_400_000;

const line = (id: string, values: readonly (number | null)[]): ChartSeries => ({
  id,
  label: id,
  points: values.map((value, index) => ({ time: Date.UTC(2026, 0, 1) + index * WEEK, value })),
});

describe("chart geometry", () => {
  it("is empty when no point has a value, however many series and points there are", () => {
    const chart = computeLineChart([line("a", [null, null]), line("b", [])], LAYOUT);
    expect(chart.empty).toBe(true);
    expect(chart.series).toEqual([]);
    expect(chart.xTicks).toEqual([]);
  });

  it("leaves out a point that has no value instead of drawing it as zero", () => {
    const chart = computeLineChart([line("a", [100, null, 200])], LAYOUT);
    expect(chart.empty).toBe(false);
    expect(chart.series[0]?.points.map((point) => point.value)).toEqual([100, 200]);
  });

  it("puts a flat series in the middle of the plot, with room above and below, not on an edge", () => {
    const chart = computeLineChart([line("a", [100, 100, 100])], LAYOUT);
    const middle = chart.plot.top + chart.plot.height / 2;
    for (const point of chart.series[0]?.points ?? []) {
      expect(point.y).toBeGreaterThan(chart.plot.top);
      expect(point.y).toBeLessThan(chart.plot.top + chart.plot.height);
      expect(Math.abs(point.y - middle)).toBeLessThan(1);
    }
    expect(chart.yTicks.length).toBeGreaterThan(0);
  });

  it("gives a series that is flat at zero a span of one unit either side", () => {
    const chart = computeLineChart([line("a", [0, 0])], LAYOUT);
    const middle = chart.plot.top + chart.plot.height / 2;
    expect(chart.series[0]?.points.every((point) => Math.abs(point.y - middle) < 1)).toBe(true);
  });

  it("brings zero into view when the layout asks for it", () => {
    const chart = computeLineChart([line("a", [100, 200])], { ...LAYOUT, includeZero: true });
    expect(chart.yTicks.some((tick) => tick.value === 0)).toBe(true);
  });
});
