import { describe, expect, it } from "vitest";
import { type ChartLayout, type ChartSeries, computeLineChart } from "./lineChartGeometry";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1);

const layout: ChartLayout = {
  width: 400,
  height: 200,
  margin: { top: 10, right: 10, bottom: 20, left: 40 },
  includeZero: true,
};

function series(id: string, values: readonly (number | null)[], days: readonly number[]): ChartSeries {
  return { id, label: id, points: values.map((value, index) => ({ time: START + (days[index] ?? 0) * DAY, value })) };
}

describe("computeLineChart", () => {
  it("spaces points by elapsed time, not by position", () => {
    const geometry = computeLineChart([series("a", [1, 2, 3], [0, 1, 31])], layout);
    const [first, second, third] = geometry.series[0]?.points ?? [];
    expect(first && second && third).toBeTruthy();
    const gapOne = (second?.x ?? 0) - (first?.x ?? 0);
    const gapThirty = (third?.x ?? 0) - (second?.x ?? 0);
    expect(gapThirty / gapOne).toBeCloseTo(30, 0);
  });

  it("breaks the line at a missing observation and keeps zero as a real value", () => {
    const geometry = computeLineChart([series("a", [5, 0, null, 7, 8], [0, 1, 2, 3, 4])], layout);
    const only = geometry.series[0];
    expect(only?.paths).toHaveLength(2);
    expect(only?.points).toHaveLength(4);
    const zero = only?.points.find((point) => point.value === 0);
    expect(zero).toBeDefined();
  });

  it("draws no line for a lone point but still plots it", () => {
    const geometry = computeLineChart([series("a", [4], [0])], layout);
    expect(geometry.series[0]?.paths).toEqual([]);
    expect(geometry.series[0]?.points).toHaveLength(1);
    expect(geometry.empty).toBe(false);
  });

  it("maps higher values higher on the screen", () => {
    const geometry = computeLineChart([series("a", [1, 9], [0, 1])], layout);
    const [low, high] = geometry.series[0]?.points ?? [];
    expect((high?.y ?? 0) < (low?.y ?? 0)).toBe(true);
  });

  it("extends the value axis to zero only when asked", () => {
    const data = [series("a", [100, 120], [0, 1])];
    const withZero = computeLineChart(data, layout);
    const withoutZero = computeLineChart(data, { ...layout, includeZero: false });
    expect(Math.min(...withZero.yTicks.map((tick) => tick.value))).toBe(0);
    expect(Math.min(...withoutZero.yTicks.map((tick) => tick.value))).toBeGreaterThan(0);
  });

  it("lets every series inform the shared bounds", () => {
    const geometry = computeLineChart([series("small", [1, 2], [0, 1]), series("large", [900, 1000], [0, 1])], layout);
    const top = Math.max(...geometry.yTicks.map((tick) => tick.value));
    expect(top).toBeGreaterThanOrEqual(1000);
    const small = geometry.series[0]?.points[0];
    const large = geometry.series[1]?.points[0];
    expect((large?.y ?? 0) < (small?.y ?? 0)).toBe(true);
  });

  it("reports an empty chart when nothing was observed", () => {
    expect(computeLineChart([], layout).empty).toBe(true);
    expect(computeLineChart([series("a", [null, null], [0, 1])], layout).empty).toBe(true);
  });

  it("handles any number of series and a flat series", () => {
    const many = Array.from({ length: 12 }, (_, index) => series(`s${String(index)}`, [index, index + 1], [0, 1]));
    expect(computeLineChart(many, layout).series).toHaveLength(12);
    const flat = computeLineChart([series("a", [5, 5], [0, 1])], layout);
    expect(flat.yTicks.length).toBeGreaterThan(1);
  });

  it("is deterministic", () => {
    const data = [series("a", [1, 4, 2], [0, 10, 20])];
    expect(computeLineChart(data, layout)).toEqual(computeLineChart(data, layout));
  });

  it("reduces date labels at phone widths while preserving every observation and value bound", () => {
    const data = [series("fund", [100, 105, 102, 110], [0, 31, 62, 365])];
    const phone = computeLineChart(data, { ...layout, width: 260, includeZero: false });
    const desktop = computeLineChart(data, { ...layout, width: 900, includeZero: false });
    expect(phone.xTicks.length).toBeLessThan(desktop.xTicks.length);
    expect(phone.series[0]?.points.map((point) => [point.time, point.value])).toEqual(desktop.series[0]?.points.map((point) => [point.time, point.value]));
    expect(phone.yTicks.map((tick) => tick.value)).toEqual(desktop.yTicks.map((tick) => tick.value));
    for (const point of phone.series[0]?.points ?? []) {
      expect(point.x).toBeGreaterThanOrEqual(phone.plot.left);
      expect(point.x).toBeLessThanOrEqual(phone.plot.left + phone.plot.width);
    }
  });

  describe("fitted value axis", () => {
    const fitted: ChartLayout = { ...layout, includeZero: false };
    const data = [series("a", [50_000, 52_000, 56_000], [0, 31, 62]), series("b", [43_000, 43_500, 50_500], [0, 31, 62])];

    it("starts and ends at the lowest and highest plotted values, not at rounded numbers", () => {
      const geometry = computeLineChart(data, fitted);
      const values = geometry.yTicks.map((tick) => tick.value);
      expect(Math.min(...values)).toBe(43_000);
      expect(Math.max(...values)).toBe(56_000);
    });

    it("leaves only a small buffer above the highest and below the lowest point", () => {
      const geometry = computeLineChart(data, fitted);
      const ys = geometry.series.flatMap((entry) => entry.points.map((point) => point.y));
      const { top, height } = geometry.plot;
      expect((Math.min(...ys) - top) / height).toBeLessThan(0.06);
      expect((top + height - Math.max(...ys)) / height).toBeLessThan(0.06);
    });

    it("keeps tick labels apart: no intermediate tick sits next to an end tick", () => {
      const geometry = computeLineChart(data, fitted);
      const ys = geometry.yTicks.map((tick) => tick.y).sort((left, right) => left - right);
      for (let index = 1; index < ys.length; index++) {
        expect((ys[index] ?? 0) - (ys[index - 1] ?? 0)).toBeGreaterThan(geometry.plot.height * 0.1);
      }
    });
  });

  describe("companion series", () => {
    it("carries a palette slot and a muted flag through, so a companion line can share its fund's colour", () => {
      const data: ChartSeries[] = [
        { ...series("invested", [1, 2], [0, 1]), slot: 3, muted: true },
        { ...series("value", [2, 3], [0, 1]), slot: 3 },
        series("plain", [1, 1], [0, 1]),
      ];
      const plotted = computeLineChart(data, { ...layout, includeZero: false }).series;
      expect(plotted.map((entry) => [entry.slot, entry.muted])).toEqual([[3, true], [3, false], [null, false]]);
    });

    it("lets a companion series inform the axis, so no line is ever drawn outside the plot", () => {
      const data: ChartSeries[] = [{ ...series("invested", [100, 200], [0, 1]), muted: true }, series("value", [10, 20], [0, 1])];
      const geometry = computeLineChart(data, { ...layout, includeZero: false });
      const ys = geometry.series.flatMap((entry) => entry.points.map((point) => point.y));
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(geometry.plot.top);
      expect(Math.max(...ys)).toBeLessThanOrEqual(geometry.plot.top + geometry.plot.height);
    });
  });
});

// Bounds must not depend on how many arguments the JavaScript engine accepts.
it("lays out 150,000 observations across many series without dropping points or bounds", () => {
  const data: ChartSeries[] = Array.from({ length: 100 }, (_, slot) => ({
    id: String(slot), label: String(slot),
    points: Array.from({ length: 1500 }, (_, index) => ({ time: START + index * DAY, value: slot * 1500 + index })),
  }));
  const geometry = computeLineChart(data, layout);
  expect(geometry.series).toHaveLength(100);
  expect(geometry.series.reduce((count, entry) => count + entry.points.length, 0)).toBe(150_000);
  expect(Math.min(...geometry.yTicks.map((tick) => tick.value))).toBe(0);
  expect(Math.max(...geometry.yTicks.map((tick) => tick.value))).toBe(149_999);
  expect(geometry.series[99]?.points[1499]?.value).toBe(149_999);
});
