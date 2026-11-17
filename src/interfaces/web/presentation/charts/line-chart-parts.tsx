import type { JSX } from "preact";
import type { ChartSeries, PlottedSeries } from "./line-chart-geometry";
import { styleClass } from "./line-chart-layout";

export function ChartReadout(props: {
  readonly series: readonly PlottedSeries[];
  readonly activeTime: number | undefined;
  readonly highlight: string | null;
  readonly observation: (time: number) => string;
  readonly show: (value: number) => string;
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
              {point === undefined ? "-" : show(point.value)}
              {point?.detail == null ? "" : ` (${point.detail})`}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function ChartValuesTable(props: {
  readonly title: string;
  readonly series: readonly ChartSeries[];
  readonly times: readonly number[];
  readonly observation: (time: number) => string;
  readonly show: (value: number) => string;
}): JSX.Element {
  const { times, observation, show } = props;
  return (
    <div class="chart-values-scroll" role="region" aria-label={`${props.title}: values table`} tabIndex={0}>
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
              <th scope="row">{observation(time)}</th>
              {props.series.map((entry) => {
                const point = entry.points.find((candidate) => candidate.time === time);
                return (
                  <td key={entry.id}>{point?.value === undefined || point.value === null ? "-" : show(point.value)}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
