import type { ComponentChildren, JSX, RefObject } from "preact";
import { AnimatedFigure } from "../animated-figure";
import type { ChartGeometry, ChartSeries, PlottedSeries } from "./line-chart-geometry";
import { styleClass } from "./line-chart-layout";
import type { PositionedAxisLabel } from "./axis-labels";
import { VALUE_LABEL_GAP } from "./use-value-axis";

export function ChartReadout(props: {
  readonly series: readonly PlottedSeries[];
  readonly activeTime: number | undefined;
  readonly highlight: string | null;
  readonly observation: (time: number) => string;
  readonly show: (value: number) => string;
  readonly hidden: boolean;
  readonly immediate: boolean;
  readonly formatValue: (value: number) => string;
}): JSX.Element {
  const { activeTime, highlight, observation, show } = props;
  return (
    <div class="chart-readout" aria-hidden="true">
      <span class="chart-readout-date">{activeTime === undefined ? "" : observation(activeTime)}</span>
      {props.series.map((entry, index) => {
        if (entry.muted) return null;
        const point = entry.points.find((candidate) => candidate.time === activeTime);
        // Markers appear in the readout only where there is one, so a chart without a checkpoint keeps its two items.
        if (entry.markers && point === undefined) return null;
        return (
          <span
            key={entry.id}
            data-highlighted={highlight === entry.id}
            class={`chart-readout-item ${styleClass(index, entry.slot)}${entry.dashed ? " dashed" : ""}`}
          >
            <span class="chart-readout-label">
              <svg class="chart-swatch" viewBox="0 0 32 8" aria-hidden="true">
                {entry.markers ? (
                  <rect class="checkpoint-swatch" x="12" y="0" width="8" height="8" transform="rotate(45 16 4)" />
                ) : (
                  <line x1="0" x2="32" y1="4" y2="4" />
                )}
              </svg>
              {entry.label}
            </span>
            <span class="chart-readout-value">
              <AnimatedFigure
                value={props.hidden || props.immediate ? null : (point?.value ?? null)}
                text={point === undefined ? "-" : show(point.value)}
                format={props.formatValue}
              />
              {point?.detail == null ? "" : ` (${point.detail})`}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function ChartValuesTable(props: {
  readonly id: string;
  readonly title: string;
  readonly series: readonly ChartSeries[];
  readonly times: readonly number[];
  readonly primaryDate: (time: number) => string;
  readonly observationDetail?: (time: number) => string | null;
  readonly show: (value: number) => string;
}): JSX.Element {
  const { times, show } = props;
  const headingId = `${props.id}-values-heading`;
  const valueSeries = props.series.filter((entry) => !entry.markers);
  const checkpointSeries = props.series.find((entry) => entry.markers);
  return (
    <section class="chart-values" aria-labelledby={headingId}>
      <div class="chart-values-heading">
        <h3 id={headingId}>Recorded values</h3>
        <p>Every plotted date in the selected range. A dash means no observation for that series on that date.</p>
      </div>
      <div class="chart-values-scroll" role="region" aria-label={`${props.title}: values table`} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              {valueSeries.map((entry) => (
                <th key={entry.id} scope="col">
                  {entry.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((time) => (
              <ChartValuesRow
                key={time}
                time={time}
                series={valueSeries}
                checkpointSeries={checkpointSeries}
                primaryDate={props.primaryDate}
                {...(props.observationDetail === undefined ? {} : { observationDetail: props.observationDetail })}
                show={show}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ChartValuesRow(props: {
  readonly time: number;
  readonly series: readonly ChartSeries[];
  readonly checkpointSeries: ChartSeries | undefined;
  readonly primaryDate: (time: number) => string;
  readonly observationDetail?: (time: number) => string | null;
  readonly show: (value: number) => string;
}): JSX.Element {
  const checkpoint = props.checkpointSeries?.points.find((point) => point.time === props.time);
  const detail = props.observationDetail?.(props.time) ?? "";
  const checkpointValue = checkpoint?.value == null ? "" : props.show(checkpoint.value);
  return (
    <tr>
      <th scope="row">
        <ChartDate label={props.primaryDate(props.time)} />
        <span class="chart-date-detail">
          {detail}
          {checkpointValue === "" ? "" : detail === "" ? `Checkpoint: ${checkpointValue}` : ` (${checkpointValue})`}
        </span>
      </th>
      {props.series.map((entry) => {
        const point = entry.points.find((candidate) => candidate.time === props.time);
        return (
          <td key={entry.id} data-label={entry.label}>
            {point?.value === undefined || point.value === null ? "-" : props.show(point.value)}
          </td>
        );
      })}
    </tr>
  );
}

/** Keeps abbreviated month and year in fixed visual columns while retaining their natural spoken order. */
export function ChartDate(props: { readonly label: string }): JSX.Element {
  const date = /^(.*) (\d{2})$/.exec(props.label);
  if (date === null) return <span class="chart-date-primary">{props.label}</span>;
  return (
    <span class="chart-date-primary">
      <span>{date[1]}</span>
      <span class="chart-date-year">{date[2]}</span>
    </span>
  );
}

/** Supporting controls and the complete, accessible data view for a line chart. */
export function ChartInspectionDetails(props: {
  readonly id: string;
  readonly title: string;
  readonly note?: string;
  readonly legend?: ComponentChildren;
  readonly resetDisabled: boolean;
  readonly onReset: () => void;
  readonly series: readonly ChartSeries[];
  readonly times: readonly number[];
  readonly primaryDate: (time: number) => string;
  readonly observationDetail?: (time: number) => string | null;
  readonly show: (value: number) => string;
}): JSX.Element {
  return (
    <details class="chart-table">
      <summary>Chart tools and values</summary>
      <div class="chart-tools">
        <div class="chart-tools-heading">
          <h3>Chart tools</h3>
          {props.note !== undefined && <p class="chart-note">{props.note}</p>}
        </div>
        {props.legend}
        <div class="chart-inspection-actions">
          <button class="quiet-action chart-reset" type="button" disabled={props.resetDisabled} onClick={props.onReset}>
            Reset chart inspection
          </button>
          <span class="hint" id={`${props.id}-inspection-help`}>
            Explore dates with the slider. Escape resets inspection.
          </span>
        </div>
        <p class="chart-tool-note">
          Select a legend name to highlight its line. Select it again to show all equally. The scale stays the same.
        </p>
      </div>
      <ChartValuesTable
        id={props.id}
        title={props.title}
        series={props.series}
        times={props.times}
        primaryDate={props.primaryDate}
        {...(props.observationDetail === undefined ? {} : { observationDetail: props.observationDetail })}
        show={props.show}
      />
    </details>
  );
}

export function ChartValueAxis(props: {
  readonly group: RefObject<SVGGElement | null>;
  readonly geometry: ChartGeometry;
  readonly format: (value: number) => string;
  readonly show: (value: number) => string;
}): JSX.Element {
  const { plot, yTicks } = props.geometry;
  const edge = plot.left + plot.width;
  return (
    <g ref={props.group} class="chart-value-axis">
      {yTicks.map((tick) => (
        <g key={tick.value}>
          <line x1={plot.left} x2={edge} y1={tick.y} y2={tick.y} />
          <text class="chart-tick" x={edge + VALUE_LABEL_GAP} y={tick.y} text-anchor="start" dominant-baseline="middle">
            <title>{props.show(tick.value)}</title>
            {props.format(tick.value)}
          </text>
        </g>
      ))}
    </g>
  );
}

export function ChartInspectionDots(props: {
  readonly series: readonly PlottedSeries[];
  readonly time: number | undefined;
  readonly highlight: string | null;
}): JSX.Element {
  return (
    <g class="chart-inspection-dots" aria-hidden="true">
      {props.series.map((entry, index) => {
        const point = entry.points.find(({ time }) => time === props.time);
        if (entry.muted || entry.markers || point === undefined) return null;
        return (
          <g
            key={entry.id}
            class={`${styleClass(index, entry.slot)}${entry.dashed ? " dashed" : ""}`}
            data-highlighted={props.highlight === null || props.highlight === entry.id}
          >
            <circle class="chart-inspection-halo" cx={point.x} cy={point.y} r={8} />
            <circle class="chart-inspection-dot" cx={point.x} cy={point.y} r={4.5} />
          </g>
        );
      })}
    </g>
  );
}

export function ChartInspectionTooltip(props: {
  readonly series: readonly PlottedSeries[];
  readonly time: number;
  readonly anchor: number;
  readonly date: string;
  readonly show: (value: number) => string;
}): JSX.Element {
  return (
    <div
      class="chart-inspection-tooltip"
      aria-hidden="true"
      data-side={props.anchor < 0.5 ? "right" : "left"}
      style={{ "--chart-inspection-anchor": `${String(props.anchor * 100)}%` }}
    >
      <span class="chart-inspection-date">{props.date}</span>
      {props.series.map((entry) => {
        const point = entry.points.find(({ time }) => time === props.time);
        if (entry.muted || (entry.markers && point === undefined)) return null;
        return (
          <div key={entry.id} class="chart-inspection-value">
            <span>{entry.label}</span>
            <strong>{point === undefined ? "Unavailable" : props.show(point.value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

export function ChartTimeAxis(props: {
  readonly group: RefObject<SVGGElement | null>;
  readonly labels: readonly PositionedAxisLabel[];
  readonly y: number;
}): JSX.Element {
  return (
    <g ref={props.group} class="chart-time-axis" aria-hidden="true">
      {props.labels.map((label) => (
        <text
          key={label.key}
          data-axis-key={label.key}
          class="chart-tick"
          x={label.x}
          y={props.y}
          text-anchor="middle"
          visibility={label.visible ? "visible" : "hidden"}
        >
          {label.text}
        </text>
      ))}
    </g>
  );
}
