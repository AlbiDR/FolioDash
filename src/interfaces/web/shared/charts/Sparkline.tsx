import type { JSX } from "preact";
import { computeLineChart } from "./lineChartGeometry";

/**
 * A tiny trend line with no axes. It is decorative: the text beside it carries
 * the figures. Gains draw in the gain colour, losses in the loss colour. With
 * `area` it also fills below the line.
 */
export function Sparkline(props: {
  readonly times: readonly number[];
  readonly values: readonly (number | null)[];
  readonly width?: number;
  readonly height?: number;
  readonly area?: boolean;
}): JSX.Element {
  const width = props.width ?? 96;
  const height = props.height ?? 36;
  const points = props.times.map((time, index) => ({ time, value: props.values[index] ?? null }));
  const geometry = computeLineChart([{ id: "spark", label: "", points }], {
    width,
    height,
    margin: { top: 4, right: 4, bottom: 4, left: 4 },
    includeZero: false,
  });
  const observed = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  const first = observed[0];
  const last = observed[observed.length - 1];
  const tone = first === undefined || last === undefined || last === first ? "" : last > first ? "gain" : "loss";
  const series = geometry.series[0];
  return (
    <svg class={`sparkline ${tone}`} viewBox={`0 0 ${String(width)} ${String(height)}`} preserveAspectRatio="none" aria-hidden="true">
      {props.area === true && series?.areas.map((area) => <path key={area} class="spark-area" d={area} />)}
      {series?.paths.map((path) => <path key={path} class="spark-line" d={path} />)}
    </svg>
  );
}
