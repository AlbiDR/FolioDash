import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { usePrivacy } from "../privacy/privacy";
import { maskNumbers } from "../privacy/privacyChoice";

export interface Bar {
  readonly key: string;
  readonly label: string;
  /** Null is a month with no figure: no bar, never a zero bar. */
  readonly value: number | null;
}

const WIDTH = 360;
const HEIGHT = 168;
const PAD = { top: 10, bottom: 24, side: 6 } as const;

/**
 * Bars above and below a zero line, gains in the gain colour and losses in the
 * loss colour. Heights are relative to the largest bar, so the shape shows the
 * pattern without stating an amount; values appear only in the table and the
 * hover text, and not at all while amounts are hidden.
 */
export function MonthlyBars(props: {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly bars: readonly Bar[];
  readonly formatValue: (value: number) => string;
}): JSX.Element {
  const hidden = usePrivacy();
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const present = props.bars.flatMap((bar) => (bar.value === null ? [] : [bar.value]));
  const top = Math.max(0, ...present);
  const bottom = Math.min(0, ...present);
  const span = top - bottom;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const zeroY = span === 0 ? PAD.top + plotHeight : PAD.top + (top / span) * plotHeight;
  const band = (WIDTH - PAD.side * 2) / Math.max(1, props.bars.length);
  const barWidth = Math.min(22, band * 0.62);
  const show = (value: number): string => (hidden ? maskNumbers(props.formatValue(value)) : props.formatValue(value));
  const labelEvery = props.bars.length > 9 ? Math.ceil(props.bars.length / 6) : 1;

  if (present.length === 0) {
    return <p class="empty-note">No month has a figure to show yet.</p>;
  }
  const latest = [...props.bars].reverse().find((bar) => bar.value !== null);
  const shown = props.bars.find((bar) => bar.key === (active ?? pinned)) ?? latest;
  return (
    <figure class="bars">
      <p class="bars-readout" aria-hidden="true">
        <span class="bars-readout-month">{shown?.label ?? ""}</span>
        <span class={`bars-readout-value ${shown?.value === undefined || shown.value === null ? "" : shown.value >= 0 ? "gain" : "loss"}`}>
          {shown?.value === undefined || shown.value === null ? "-" : `${shown.value > 0 ? "+" : ""}${show(shown.value)}`}
        </span>
      </p>
      <svg viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`} role="group" aria-label={props.description}>
        <line class="bars-zero" x1={PAD.side} x2={WIDTH - PAD.side} y1={zeroY} y2={zeroY} />
        {props.bars.map((bar, index) => {
          const x = PAD.side + band * index + (band - barWidth) / 2;
          const labelled = index % labelEvery === 0 || index === props.bars.length - 1;
          const value = bar.value;
          const height = value === null || span === 0 ? 0 : (Math.abs(value) / span) * plotHeight;
          const y = value === null ? zeroY : value >= 0 ? zeroY - height : zeroY;
          return (
            <g
              key={bar.key}
              class={`bars-item${bar.key === shown?.key ? " is-active" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`${bar.label}: ${value === null ? "Unavailable" : show(value)}`}
              aria-pressed={pinned === bar.key}
              onClick={() => { setPinned(current => current === bar.key ? null : bar.key); }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setPinned(current => current === bar.key ? null : bar.key);
              }}
              onPointerEnter={() => {
                setActive(bar.key);
              }}
              onPointerLeave={() => {
                setActive(null);
              }}
            >
              <rect class="bars-hit" x={PAD.side + band * index} y={0} width={band} height={HEIGHT} />
              {value !== null && (
                <rect class={value >= 0 ? "bar gain" : "bar loss"} x={x} y={y} width={barWidth} height={Math.max(height, 1.5)} rx={Math.min(6, barWidth / 3)}>
                  <title>{`${bar.label}: ${show(value)}`}</title>
                </rect>
              )}
              {labelled && (
                <text class="chart-tick" x={x + barWidth / 2} y={HEIGHT - 6} text-anchor="middle">
                  {bar.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <label class="chart-date-control">
        <span>Explore months</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, props.bars.length - 1)}
          step={1}
          value={Math.max(0, props.bars.findIndex((bar) => bar.key === shown?.key))}
          disabled={props.bars.length < 2}
          aria-label={`${props.title}: month`}
          aria-valuetext={shown?.label ?? "No observation"}
          onInput={(event) => { setActive(null); setPinned(props.bars[Number(event.currentTarget.value)]?.key ?? null); }}
        />
        <output aria-live="polite">{shown?.label ?? ""}</output>
      </label>
      <details class="chart-table">
        <summary>Show the values as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">{props.title}</th>
            </tr>
          </thead>
          <tbody>
            {props.bars.map((bar) => (
              <tr key={bar.key}>
                <th scope="row">{bar.label}</th>
                <td>{bar.value === null ? "-" : show(bar.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
