import type { JSX, TargetedPointerEvent } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { usePrivacy } from "../privacy/privacy";
import { maskNumbers } from "../privacy/privacyChoice";
import { type ChartSeries, computeLineChart } from "./lineChartGeometry";

export interface LineChartProps {
  readonly id: string;
  readonly title: string;
  /** One sentence for assistive technology describing what the chart shows. */
  readonly description: string;
  /** One plain sentence under the title telling anyone what the lines mean. */
  readonly subtitle?: string;
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

function styleClass(index: number, slot: number | null): string {
  return `series-${String((slot ?? index) % STYLE_COUNT)}`;
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
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState<number>(LAYOUT.width);
  useEffect(() => {
    const node = container.current;
    if (node === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined && entry.contentRect.width > 0) setWidth(Math.max(200, Math.round(entry.contentRect.width)));
    });
    observer.observe(node);
    return () => { observer.disconnect(); };
  }, []);
  const layout = { ...LAYOUT, width, height: width < 480 ? 240 : LAYOUT.height };
  // Drawing geometry depends only on the series and the axis choice, so reading values by hovering does not redo it.
  const includeZero = props.includeZero ?? false;
  const geometry = useMemo(() => computeLineChart(props.series, { ...LAYOUT, width, height: width < 480 ? 240 : LAYOUT.height, includeZero }), [props.series, includeZero, width]);
  const titleId = `${props.id}-title`;
  const descriptionId = `${props.id}-description`;
  const highlight = geometry.series.some(entry => entry.id === highlighted) ? highlighted : null;

  if (geometry.empty) {
    return (
      <figure ref={container} class="chart chart-empty">
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
    const x = ((event.clientX - box.left) * layout.width) / box.width;
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
    <figure ref={container} class="chart">
      <figcaption class="chart-title" id={titleId}>
        {props.title}
      </figcaption>
      {props.subtitle !== undefined && <p class="chart-subtitle">{props.subtitle}</p>}
      <div class="chart-readout" aria-hidden="true">
        <span class="chart-readout-date">{activeTime === undefined ? "" : props.formatTime(activeTime)}</span>
        {geometry.series.map((entry, index) => {
          if (entry.muted) return null;
          const point = entry.points.find((candidate) => candidate.time === activeTime);
          return (
            <span key={entry.id} data-highlighted={highlight === entry.id} class={`chart-readout-item ${styleClass(index, entry.slot)}${entry.dashed ? " dashed" : ""}`}>
              <span class="chart-readout-label">
                <svg class="chart-swatch" viewBox="0 0 32 8" aria-hidden="true">
                  <line x1="0" x2="32" y1="4" y2="4" />
                </svg>
                {entry.label}
              </span>
              <span class="chart-readout-value">{point === undefined ? "-" : show(point.value)}</span>
            </span>
          );
        })}
      </div>
      <svg
        class="chart-svg"
        viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        onPointerMove={scrubTo}
        onPointerDown={scrubTo}
        onPointerCancel={() => { setScrubbed(null); }}
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
          <g key={entry.id} class={`chart-series ${styleClass(index, entry.slot)}${entry.dashed ? " dashed" : ""}${entry.muted ? " muted" : ""}${highlight !== null && highlight !== entry.id ? " unfocused" : ""}`} data-series={entry.id}>
            {props.fillFirst === true && index === 0 && entry.areas.map((area) => <path key={area} class="area" d={area} />)}
            {entry.paths.map((path) => (
              <path key={path} class="line" d={path} fill="none" />
            ))}
            {(entry.muted ? [] : entry.points).map((point) => (
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
      <label class="chart-date-control">
        <span>Explore dates</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, times.length - 1)}
          step={1}
          value={Math.max(0, times.indexOf(activeTime ?? 0))}
          disabled={times.length < 2}
          aria-label={`${props.title}: observation date`}
          aria-valuetext={activeTime === undefined ? "No observation" : props.formatTime(activeTime)}
          onInput={(event) => { setScrubbed(times[Number(event.currentTarget.value)] ?? null); }}
        />
        <output aria-live="polite"><span key={activeTime} class="inspection-date">{activeTime === undefined ? "" : props.formatTime(activeTime)}</span></output>
      </label>
      <ul class="chart-legend">
        {geometry.series.map((entry, index) =>
          entry.muted ? null : (
            <li key={entry.id} class={`chart-legend-item ${styleClass(index, entry.slot)}${entry.dashed ? " dashed" : ""}`}>
              <button type="button" class="chart-legend-button" aria-pressed={highlight === entry.id} aria-label={`Highlight ${entry.label}`} onClick={() => {
                setHighlighted(current => current === entry.id ? null : entry.id);
              }}>
              <svg class="chart-swatch" viewBox="0 0 32 8" aria-hidden="true">
                <line x1="0" x2="32" y1="4" y2="4" />
              </svg>
              {entry.label}
              </button>
            </li>
          ),
        )}
      </ul>
      <details class="chart-table">
        <summary>Chart tools and values</summary>
      <button class="quiet-action chart-reset" type="button" disabled={scrubbed === null && highlight === null} onClick={() => {
        setScrubbed(null);
        setHighlighted(null);
      }}>Reset chart inspection</button>
      <p class="footnote">Select a legend name to highlight its line. Select it again to show all equally. The scale stays the same.</p>

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
                  return <td key={entry.id}>{point?.value === undefined || point.value === null ? "-" : show(point.value)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
