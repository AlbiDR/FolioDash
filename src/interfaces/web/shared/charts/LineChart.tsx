import type { JSX } from "preact";
import { usePrivacy } from "../privacy/privacy";
import { type ChartSeries, computeLineChart } from "./lineChartGeometry";

export interface LineChartProps {
  readonly id: string;
  readonly title: string;
  /** One sentence for assistive technology describing what the chart shows. */
  readonly description: string;
  readonly series: readonly ChartSeries[];
  readonly formatTime: (time: number) => string;
  readonly formatValue: (value: number) => string;
  /** Extend the value axis to zero. Off by default: the axis fits the data. */
  readonly includeZero?: boolean;
  /** Text shown when there is nothing to plot. */
  readonly emptyMessage: string;
}

const LAYOUT = {
  width: 720,
  height: 360,
  margin: { top: 16, right: 20, bottom: 36, left: 84 },
} as const;
// Series share one line style and differ only by colour: they are the same measure from different sources.
// The palette repeats after this many series.
const STYLE_COUNT = 8;

function styleClass(index: number): string {
  return `series-${String(index % STYLE_COUNT)}`;
}

/**
 * A multi-series line chart drawn as SVG. Series are told apart by colour and a
 * direct legend and table. When amounts are hidden, no value is written on the
 * axis, in the table or in the page's data attributes; only the shape remains. The plotted values are in
 * the page as data attributes and also as a table, so they can be read, tested
 * and used without the picture.
 */
export function LineChart(props: LineChartProps): JSX.Element {
  const hidden = usePrivacy();
  const geometry = computeLineChart(props.series, { ...LAYOUT, includeZero: props.includeZero ?? false });
  const titleId = `${props.id}-title`;
  const descriptionId = `${props.id}-description`;

  if (geometry.empty) {
    return (
      <figure class="chart chart-empty">
        <figcaption class="chart-title">{props.title}</figcaption>
        <p>{props.emptyMessage}</p>
      </figure>
    );
  }

  const times = [...new Set(props.series.flatMap((entry) => entry.points.map((point) => point.time)))].sort(
    (left, right) => left - right,
  );
  const baseline = geometry.plot.top + geometry.plot.height;

  return (
    <figure class="chart">
      <figcaption class="chart-title" id={titleId}>
        {props.title}
      </figcaption>
      <svg
        class="chart-svg"
        viewBox={`0 0 ${String(LAYOUT.width)} ${String(LAYOUT.height)}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <desc id={descriptionId}>{props.description}</desc>
        <g class="chart-grid">
          {geometry.yTicks.map((tick) => (
            <g key={`y-${String(tick.value)}`}>
              <line x1={geometry.plot.left} x2={geometry.plot.left + geometry.plot.width} y1={tick.y} y2={tick.y} />
              <text class="chart-tick" x={geometry.plot.left - 8} y={tick.y} text-anchor="end" dominant-baseline="middle">
                {hidden ? "" : props.formatValue(tick.value)}
              </text>
            </g>
          ))}
          {geometry.xTicks.map((tick) => (
            <text key={`x-${String(tick.time)}`} class="chart-tick" x={tick.x} y={baseline + 22} text-anchor="middle">
              {props.formatTime(tick.time)}
            </text>
          ))}
        </g>
        {geometry.series.map((entry, index) => (
          <g key={entry.id} class={`chart-series ${styleClass(index)}${entry.dashed ? " dashed" : ""}`} data-series={entry.id}>
            {entry.paths.map((path) => (
              <path key={path} d={path} fill="none" />
            ))}
            {entry.points.map((point) => (
              <circle
                key={point.time}
                cx={point.x}
                cy={point.y}
                r={3.5}
                data-time={point.time}
                {...(hidden ? {} : { "data-value": point.value })}
              />
            ))}
          </g>
        ))}
      </svg>
      <ul class="chart-legend">
        {geometry.series.map((entry, index) => (
          <li key={entry.id} class={`chart-legend-item ${styleClass(index)}${entry.dashed ? " dashed" : ""}`}>
            <svg class="chart-swatch" viewBox="0 0 32 8" aria-hidden="true">
              <line x1="0" x2="32" y1="4" y2="4" />
            </svg>
            {entry.label}
          </li>
        ))}
      </ul>
      <details class="chart-table">
        <summary>Show the values as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              {props.series.map((entry) => (
                <th key={entry.id} scope="col">
                  {entry.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((time) => (
              <tr key={time}>
                <th scope="row">{props.formatTime(time)}</th>
                {props.series.map((entry) => {
                  const point = entry.points.find((candidate) => candidate.time === time);
                  return (
                    <td key={entry.id}>
                      {point?.value === undefined || point.value === null ? "–" : hidden ? "••••" : props.formatValue(point.value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
