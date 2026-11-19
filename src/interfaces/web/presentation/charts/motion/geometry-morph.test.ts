import { describe, expect, it } from "vitest";
import { type MorphTransform, morphTransform } from "./geometry-morph";
import { type ChartGeometry, computeLineChart } from "../line-chart-geometry";

const DAY = 86_400_000;
const START = Date.UTC(2025, 0, 1);
const layout = { width: 640, height: 320, margin: { top: 12, right: 24, bottom: 28, left: 44 }, includeZero: false };

function chart(days: readonly number[], values: readonly number[]): ChartGeometry {
  return computeLineChart(
    [
      {
        id: "value",
        label: "Value",
        points: days.map((day, index) => ({ time: START + day * DAY, value: values[index] ?? 0 })),
      },
    ],
    layout,
  );
}

/** Where a time and value are drawn on a chart, written here from the axes alone so the test does not reuse the code under test. */
function drawnAt(geometry: ChartGeometry, time: number, value: number): { x: number; y: number } {
  const domain = geometry.domain;
  if (domain === null) throw new Error("expected a non-empty chart");
  const { plot } = geometry;
  const x = plot.left + ((time - domain.time[0]) / (domain.time[1] - domain.time[0])) * plot.width;
  const y = plot.top + plot.height - ((value - domain.value[0]) / (domain.value[1] - domain.value[0])) * plot.height;
  return { x, y };
}

function apply(transform: MorphTransform, point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: transform.scaleX * point.x + transform.translateX,
    y: transform.scaleY * point.y + transform.translateY,
  };
}

describe("morphTransform", () => {
  const previous = chart([0, 10, 20, 30, 40], [100, 250, 180, 320, 300]);
  const next = chart([10, 20, 30, 40, 50, 60], [240, 170, 330, 310, 400, 420]);

  it("places every position of the next chart where the previous axes would draw it", () => {
    const transform = morphTransform(previous, next);
    if (transform === null) throw new Error("expected a morph between different periods");
    const domain = next.domain;
    if (domain === null) throw new Error("expected a non-empty chart");
    for (let step = 0; step <= 8; step += 1) {
      const time = domain.time[0] + ((domain.time[1] - domain.time[0]) * step) / 8;
      for (let valueStep = 0; valueStep <= 8; valueStep += 1) {
        const value = domain.value[0] + ((domain.value[1] - domain.value[0]) * valueStep) / 8;
        const morphed = apply(transform, drawnAt(next, time, value));
        const expected = drawnAt(previous, time, value);
        expect(morphed.x).toBeCloseTo(expected.x, 6);
        expect(morphed.y).toBeCloseTo(expected.y, 6);
      }
    }
  });

  it("keeps both directions of each axis, so lines do not flip while they move", () => {
    const transform = morphTransform(previous, next);
    expect(transform?.scaleX).toBeGreaterThan(0);
    expect(transform?.scaleY).toBeGreaterThan(0);
  });

  it("does nothing when the axes already match", () => {
    expect(morphTransform(next, next)).toBeNull();
  });

  it("does nothing when either chart is empty", () => {
    const empty = chart([], []);
    expect(morphTransform(empty, next)).toBeNull();
    expect(morphTransform(previous, empty)).toBeNull();
  });
});
