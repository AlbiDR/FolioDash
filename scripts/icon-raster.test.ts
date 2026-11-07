import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAFE_RADIUS, TILE_RADIUS, foregroundReach, markSvg, markSvgBody } from "./icon-mark.ts";
import { blur, boundaryDistance, fillMask, flattenPath, resample, strokeCoverage, toBytes, type Polygon } from "./icon-raster.ts";

const sum = (values: Float32Array): number => values.reduce((total, value) => total + value, 0);
const square = (from: number, to: number): Polygon => [
  [from, from],
  [to, from],
  [to, to],
  [from, to],
];

void describe("icon rasteriser", () => {
  void it("flattens straight paths and circular arcs onto their circle", () => {
    const [rectangle] = flattenPath("M0 0H4V3H0Z");
    assert.deepEqual(rectangle, [[0, 0], [4, 0], [4, 3], [0, 3]]);
    const [quarter] = flattenPath("M0 10A10 10 0 0 1 10 0");
    assert.ok(quarter !== undefined && quarter.length > 10);
    for (const [x, y] of quarter) assert.ok(Math.abs(Math.hypot(x - 10, y - 10) - 10) < 1e-9, "every arc point lies on the circle");
  });

  void it("covers exactly the area of a shape, including half-covered pixels", () => {
    assert.ok(Math.abs(sum(fillMask([square(0.5, 2.5)], 4)) - 4) < 1e-6);
    assert.ok(Math.abs(sum(fillMask([square(1, 3)], 4)) - 4) < 1e-6);
  });

  void it("honours the fill rule for a hole", () => {
    const outer = square(0, 8);
    const hole = square(2, 6);
    assert.ok(Math.abs(sum(fillMask([outer, hole], 8, "evenodd")) - (64 - 16)) < 1e-6);
    assert.ok(Math.abs(sum(fillMask([outer, hole], 8, "nonzero")) - 64) < 1e-6);
  });

  void it("draws a stroke of the requested width centred on an edge", () => {
    const edge: Polygon = [
      [4, 0],
      [4, 8],
      [4.001, 8],
      [4.001, 0],
    ];
    const band = strokeCoverage(boundaryDistance([edge], 8, 4), 2);
    const row = (column: number): number => band[3 * 8 + column] ?? -1;
    assert.equal(row(3), 1);
    assert.equal(row(4), 1);
    assert.equal(row(1), 0);
    assert.equal(row(6), 0);
  });

  void it("blurs without gaining or losing coverage", () => {
    const mask = fillMask([square(24, 40)], 64);
    const soft = blur(mask, 64, 3);
    assert.ok(Math.abs(sum(soft) - sum(mask)) < 0.5, "a blur away from the edges keeps its total");
    assert.ok((soft[32 * 64 + 32] ?? 0) < 1 && (soft[32 * 64 + 32] ?? 0) > 0.5, "the centre softens but stays strong");
    assert.equal(blur(mask, 64, 0.1), mask, "a negligible blur returns the input");
  });

  void it("reduces by area and keeps colour straight on the way out", () => {
    const flat = new Float32Array(4 * 4 * 4).fill(0.25);
    assert.ok(resample(flat, 4, 3).every((value) => Math.abs(value - 0.25) < 1e-6));
    const bytes = toBytes(new Float32Array([0.5, 0.25, 0, 0.5, 0, 0, 0, 0]));
    assert.deepEqual([...bytes], [255, 128, 0, 128, 0, 0, 0, 0]);
  });
});

void describe("FolioDash mark", () => {
  void it("keeps the letters inside the Android safe circle", () => {
    assert.ok(foregroundReach() <= SAFE_RADIUS, `${String(foregroundReach())} exceeds ${String(SAFE_RADIUS)}`);
  });

  void it("embeds with its own ids so it cannot collide with the banner's", () => {
    const ids = [...markSvgBody(TILE_RADIUS, "mark-").matchAll(/ id="([^"]+)"/gu)].map((match) => match[1] ?? "");
    assert.ok(ids.length > 10);
    assert.equal(new Set(ids).size, ids.length, "ids are unique");
    assert.ok(ids.every((id) => id.startsWith("mark-")));
  });

  void it("is a self-contained SVG of the canvas size", () => {
    const svg = markSvg();
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'));
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/u.test(svg), "no external references");
  });
});
