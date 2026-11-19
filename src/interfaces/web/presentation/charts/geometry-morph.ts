import type { ChartGeometry } from "./line-chart-geometry";

/** A plain affine map between two drawings: x' = scaleX * x + translateX and y' = scaleY * y + translateY. */
export interface MorphTransform {
  readonly scaleX: number;
  readonly translateX: number;
  readonly scaleY: number;
  readonly translateY: number;
}

/**
 * The transform that places the next geometry's drawing where the previous one
 * was. Animating it back to the identity morphs the lines between two sets of
 * axes. Both axes are linear, so the map is exact at its ends and between them;
 * the settled chart is the next geometry itself, unchanged. Returns null when
 * either chart is empty, the axes cannot be compared, or nothing would move.
 */
export function morphTransform(previous: ChartGeometry, next: ChartGeometry): MorphTransform | null {
  const from = previous.domain;
  const to = next.domain;
  if (previous.empty || next.empty || from === null || to === null) return null;
  const before = previous.plot;
  const after = next.plot;
  if (before.width <= 0 || before.height <= 0 || after.width <= 0 || after.height <= 0) return null;

  const timeFrom = from.time[1] - from.time[0];
  const valueFrom = from.value[1] - from.value[0];
  const timeTo = to.time[1] - to.time[0];
  const valueTo = to.value[1] - to.value[0];
  if (timeFrom <= 0 || valueFrom <= 0 || timeTo <= 0 || valueTo <= 0) return null;

  // Where a horizontal position of the next chart sits on the previous chart's time axis.
  const previousX = (x: number): number => {
    const time = to.time[0] + ((x - after.left) / after.width) * timeTo;
    return before.left + ((time - from.time[0]) / timeFrom) * before.width;
  };
  // Where a vertical position of the next chart sits on the previous chart's value axis.
  const previousY = (y: number): number => {
    const value = to.value[0] + ((after.top + after.height - y) / after.height) * valueTo;
    return before.top + before.height - ((value - from.value[0]) / valueFrom) * before.height;
  };

  const scaleX = (previousX(after.left + after.width) - previousX(after.left)) / after.width;
  const translateX = previousX(after.left) - scaleX * after.left;
  const scaleY = (previousY(after.top + after.height) - previousY(after.top)) / after.height;
  const translateY = previousY(after.top) - scaleY * after.top;

  const unchanged =
    Math.abs(scaleX - 1) < 1e-9 &&
    Math.abs(scaleY - 1) < 1e-9 &&
    Math.abs(translateX) < 1e-6 &&
    Math.abs(translateY) < 1e-6;
  return unchanged ? null : { scaleX, translateX, scaleY, translateY };
}
