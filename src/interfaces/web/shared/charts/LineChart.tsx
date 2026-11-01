import type { JSX, TargetedPointerEvent } from "preact";
import { useState } from "preact/hooks";
import { usePrivacy } from "../privacy/privacy";
import { maskNumbers } from "../privacy/privacyChoice";
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
  /** Fill the area under the first series, as Apple's Stocks does. */
  readonly fillFirst?: boolean;
  /** Text shown when there is nothing to plot. */
  readonly emptyMessage: string;
}

// Value labels sit on the right, inside the card, as in Apple's Stocks.
const LAYOUT = {
  width: 720,
  height: 300,
  margin: { top: 12, right: 78, bottom: 28, left: 8 },
} as const;
// Series share one line style and differ only by colour: they are the same measure from different sources.
// The palette repeats after this many series.
const STYLE_COUNT = 8;

function styleClass(index: number): string {
  return `series-${String(index % STYLE_COUNT)}`;
}

/**
 * A multi-series line chart drawn as SVG. Drag or hover across it to read any
 * month's values, as in Stocks. Series are told apart by colour and a direct
 * legend and table. When amounts are hidden, no value is written on the axis, in
 * the readout, in the table or in the page's data attributes; only the shape
 * remains. The plotted values are also available as a table.
 */
export function LineChart(props: LineChartProps): JSX.Element {
  const hidden = usePrivacy();
  const [scrubbed, setScrubbed] = useState<number | null>(null);
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
  const xByTime = new Map(geometry.series.flatMap((entry) => entry.points.map((point) => [point.time, point.x] as const)));
  const lastTime = times[times.length - 1];
  const activeTime = scrubbed ?? lastTime;
  const activeX = activeTime === undefined ? undefined : xByTime.get(activeTime);
  const baseline = geometry.plot.top + geometry.plot.height;
  const show = (value: number): string => (hidden ? maskNumbers(props.formatValue(value)) : props.formatValue(value));

  function scrubTo(event: TargetedPointerEvent<SVGSVGElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const x = ((event.clientX - box.left) * LAYOUT.width) / box.width;
    let nearest: number | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const [time, at] of xByTime) {
      if (Math.abs(at - x) < distance) {
        distance = Math.abs(at - x);
        nearest = time;
      }
    }
    setScrubbed(nearest);
  }

  return (
    <figure class="chart">
      <figcaption class="chart-title" id={titleId}>
        {props.title}
      </figcaption>
      <div class="chart-readout" aria-hidden="true">
        <span class="chart-readout-date">{activeTime === undefined ? "" : props.formatTime(activeTime)}</span>
        {geometry.series.map((entry, index) => {
          const point = entry.points.find((candidate) => candidate.time === activeTime);
          return (
            <span key={entry.id} class={`chart-readout-item ${styleClass(index)}${entry.dashed ? " dashed" : ""}`}>
              <svg class="chart-swatch" viewBox="0 0 32 8" aria-hidden="true">
                <line x1="0" x2="32" y1="4" y2="4" />
              </svg>
              {point === undefined ? "–" : show(point.value)}
            </span>
          );
        })}
      </div>
      <svg
        class="chart-svg"
        viewBox={`0 0 ${String(LAYOUT.width)} ${String(LAYOUT.height)}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        onPointerMove={scrubTo}
        onPointerDown={scrubTo}
        onPointerLeave={() => {
          setScrubbed(null);
        }}
      >
        <desc id={descriptionId}>{props.description}</desc>
        <g class="chart-grid">
          {geometry.yTicks.map((tick) => (
            <g key={`y-${String(tick.value)}`}>
              <line x1={geometry.plot.left} x2={geometry.plot.left + geometry.plot.width} y1={tick.y} y2={tick.y} />
              <text
                class="chart-tick"
                x={geometry.plot.left + geometry.plot.width + 8}
                y={tick.y}
                text-anchor="start"
                dominant-baseline="middle"
              >
                {show(tick.value)}
              </text>
            </g>
          ))}
          {geometry.xTicks.map((tick) => (
            <text key={`x-${String(tick.time)}`} class="chart-tick" x={tick.x} y={baseline + 20} text-anchor="middle">
              {props.formatTime(tick.time)}
            </text>
          ))}
        </g>
        {activeX !== undefined && scrubbed !== null && (
          <line class="chart-guide" x1={activeX} x2={activeX} y1={geometry.plot.top} y2={baseline} />
        )}
        {geometry.series.map((entry, index) => (
          <g key={entry.id} class={`chart-series ${styleClass(index)}${entry.dashed ? " dashed" : ""}`} data-series={entry.id}>
            {props.fillFirst === true && index === 0 && entry.areas.map((area) => <path key={area} class="area" d={area} />)}
            {entry.paths.map((path) => (
              <path key={path} class="line" d={path} fill="none" />
            ))}
            {entry.points.map((point) => (
              <circle
                key={point.time}
                class={point.time === activeTime ? "is-active" : point.time === lastTime ? "is-last" : ""}
                cx={point.x}
                cy={point.y}
                r={4.5}
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
                  return <td key={entry.id}>{point?.value === undefined || point.value === null ? "–" : show(point.value)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
