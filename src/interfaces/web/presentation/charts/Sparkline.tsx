import type { JSX } from "preact";
import { useMemo } from "preact/hooks";
import { computeLineChart } from "./lineChartGeometry";

/**
 * A tiny trend line with no axes. It is decorative: the text beside it carries
 * the figures. Its colour is set by the caller to match the figure it sits
 * beside (gain, loss or neutral), not by the direction of the line, so a line
 * can fall through a window while the figure is still positive. With `area` it
 * also fills below the line.
 */
export function Sparkline(props: {
  readonly times: readonly number[];
  readonly values: readonly (number | null)[];
  /** "gain", "loss" or "" for neutral: the same rule the figure beside it uses. */
  readonly tone?: string;
  readonly width?: number;
  readonly height?: number;
  readonly area?: boolean;
}): JSX.Element {
  const width = props.width ?? 96;
  const height = props.height ?? 36;
  const { times, values } = props;
  const tone = props.tone ?? "";
  const series = useMemo(() => {
    const points = times.map((time, index) => ({ time, value: values[index] ?? null }));
    const geometry = computeLineChart([{ id: "spark", label: "", points }], {
      width,
      height,
      margin: { top: 4, right: 4, bottom: 4, left: 4 },
      includeZero: false,
    });
    return geometry.series[0];
  }, [times, values, width, height]);
  return (
    <svg class={`sparkline ${tone}`} viewBox={`0 0 ${String(width)} ${String(height)}`} preserveAspectRatio="none" aria-hidden="true">
      {props.area === true && series?.areas.map((area) => <path key={area} class="spark-area" d={area} />)}
      {series?.paths.map((path) => <path key={path} class="spark-line" d={path} />)}
    </svg>
  );
}
