import type { JSX } from "preact";
import { useMemo, useRef } from "preact/hooks";
import { useGeometryMorph } from "./motion/use-geometry-morph";
import { computeLineChart } from "./line-chart-geometry";

/**
 * A tiny trend line with no axes. It is decorative: the text beside it carries
 * the figures. Its colour is set by the caller to match the figure it sits
 * beside (gain, loss or neutral), not by the direction of the line, so a line
 * can fall through a window while the figure is still positive. With `area` it
 * also fills below the line. When `changeKey` changes, the trend reshapes from
 * its previous window to the new one.
 */
export function Sparkline(props: {
  readonly times: readonly number[];
  readonly values: readonly (number | null)[];
  /** "gain", "loss" or "" for neutral: the same rule the figure beside it uses. */
  readonly tone?: string;
  readonly width?: number;
  readonly height?: number;
  readonly area?: boolean;
  /** Identifies the choice that changes the window, such as the chart period. */
  readonly changeKey?: string | undefined;
}): JSX.Element {
  const width = props.width ?? 96;
  const height = props.height ?? 36;
  const { times, values } = props;
  const tone = props.tone ?? "";
  const geometry = useMemo(() => {
    const points = times.map((time, index) => ({ time, value: values[index] ?? null }));
    return computeLineChart([{ id: "spark", label: "", points }], {
      width,
      height,
      margin: { top: 4, right: 4, bottom: 4, left: 4 },
      includeZero: false,
    });
  }, [times, values, width, height]);
  const series = geometry.series[0];
  const layer = useRef<SVGGElement>(null);
  useGeometryMorph(layer, geometry, props.changeKey);
  return (
    <svg
      class={`sparkline ${tone}`}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g ref={layer}>
        {props.area === true && series?.areas.map((area) => <path key={area} class="spark-area" d={area} />)}
        {series?.paths.map((path) => (
          <path key={path} class="spark-line" d={path} />
        ))}
      </g>
    </svg>
  );
}
