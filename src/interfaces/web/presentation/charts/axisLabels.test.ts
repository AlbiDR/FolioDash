import { describe, expect, it } from "vitest";
import { type AxisLabel, positionAxisLabels } from "./axisLabels";

const labels = (count: number): readonly AxisLabel[] => Array.from({ length: count }, (_, index) => ({ key: String(index), text: `Month ${String(index)}`, x: 6 + 348 * (index + 0.5) / count }));

describe("measured chart date labels", () => {
  it("reserves November without colliding with October in a twelve-month chart", () => {
    const months = labels(12).map((label, index) => ({ ...label, text: index === 10 ? "Oct 26" : index === 11 ? "Nov 26" : label.text }));
    const widths = Object.fromEntries(months.map(label => [label.key, 42]));
    const result = positionAxisLabels(months, widths, 6, 354, 11);
    expect(result[11]?.visible).toBe(true);
    expect(result[10]?.visible).toBe(false);
    const shown = result.filter(label => label.visible);
    for (let index = 1; index < shown.length; index++) expect((shown[index]?.x ?? 0) - (shown[index - 1]?.x ?? 0)).toBeGreaterThanOrEqual(53);
  });

  it("keeps edge labels inside the chart and preserves first/latest when both fit", () => {
    const input = [{ key: "first", text: "Jan 25", x: 6 }, { key: "last", text: "Nov 26", x: 354 }];
    expect(positionAxisLabels(input, { first: 42, last: 42 }, 6, 354, 11)).toMatchObject([{ x: 27, visible: true }, { x: 333, visible: true }]);
  });

  it("adapts to irregular spacing and unequal measured glyph widths", () => {
    for (const count of [1, 2, 8, 11, 12, 13, 24, 60]) {
      const input = labels(count);
      const widths = Object.fromEntries(input.map((label, index) => [label.key, index % 2 === 0 ? 28 : 62]));
      const shown = positionAxisLabels(input, widths, 6, 354, 11).filter(label => label.visible);
      expect(shown.at(-1)?.key).toBe(input.at(-1)?.key);
      for (const label of shown) {
        expect(label.x - (widths[label.key] ?? 0) / 2).toBeGreaterThanOrEqual(6);
        expect(label.x + (widths[label.key] ?? 0) / 2).toBeLessThanOrEqual(354);
      }
      for (let index = 1; index < shown.length; index++) {
        const current = shown[index];
        const previous = shown[index - 1];
        if (current === undefined || previous === undefined) throw new Error("Missing test label");
        expect(current.x - (widths[current.key] ?? 0) / 2).toBeGreaterThanOrEqual(previous.x + (widths[previous.key] ?? 0) / 2 + 11);
      }
    }
  });

  it("uses conservative initial estimates before glyph measurements arrive", () => {
    const result = positionAxisLabels(labels(12), {}, 6, 354, 12);
    expect(result.at(-1)?.visible).toBe(true);
    expect(result.filter(label => label.visible).length).toBeLessThan(6);
  });

  it("handles empty, single and too-narrow charts without clipping text", () => {
    expect(positionAxisLabels([], {}, 0, 100, 11)).toEqual([]);
    expect(positionAxisLabels(labels(1), { "0": 42 }, 6, 354, 11)[0]?.visible).toBe(true);
    expect(positionAxisLabels(labels(1), { "0": 100 }, 0, 80, 11)[0]?.visible).toBe(false);
  });
});
