import type { JSX } from "preact";
import { computeLineChart } from "./lineChartGeometry";

const LAYOUT = { width: 96, height: 36, margin: { top: 4, right: 4, bottom: 4, left: 4 }, includeZero: false } as const;

/**
 * A tiny trend line with no axes, for a list row. It is decorative: the row's
 * own text carries the figures. Gains draw in the gain colour, losses in the loss colour.
 */
export function Sparkline(props: {
  readonly times: readonly number[];
  readonly values: readonly (number | null)[];
}): JSX.Element {
  const points = props.times.map((time, index) => ({ time, value: props.values[index] ?? null }));
  const geometry = computeLineChart([{ id: "spark", label: "", points }], LAYOUT);
  const observed = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  const first = observed[0];
  const last = observed[observed.length - 1];
  const tone = first === undefined || last === undefined || last === first ? "" : last > first ? "gain" : "loss";
  return (
    <svg class={`sparkline ${tone}`} viewBox={`0 0 ${String(LAYOUT.width)} ${String(LAYOUT.height)}`} aria-hidden="true">
      {geometry.series[0]?.paths.map((path) => <path key={path} d={path} />)}
    </svg>
  );
}
