import type { JSX } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { AnimatedFigure } from "../animated-figure";
import { usePrivacy } from "../privacy/privacy";
import { ChartDate } from "./line-chart-parts";
import { useAxisLabels } from "./use-axis-labels";
import { maskNumbers } from "../privacy/privacy-choice";
import { type BarSnapshot } from "./motion/bar-morph";
import { useBarMorph } from "./motion/use-bar-morph";
import { chartArrivalClass, chartArrivalOrder } from "./motion/recipe";

export interface Bar {
  readonly key: string;
  readonly label: string;
  /** The exact date where the label does not carry it, for example `exported 1 Nov 2026`. Shown beside the label and read out with it. */
  readonly detail?: string | null;
  /** Null is a month with no figure: no bar, never a zero bar. */
  readonly value: number | null;
}

/** The label with its detail, for anything read aloud or listed in a table. */
function named(bar: Bar): string {
  return bar.detail === undefined || bar.detail === null ? bar.label : `${bar.label}, ${bar.detail}`;
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
  /** Identifies the period these bars belong to; a change moves the bars that stay from their old places. */
  readonly updateKey?: string;
}): JSX.Element {
  const hidden = usePrivacy();
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const dateControl = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLElement>(null);
  const plot = useRef<SVGSVGElement>(null);
  useEffect(() => {
    setPinned((current) => (props.bars.some((bar) => bar.key === current) ? current : null));
    setHovered(null);
    setFocused((current) => (props.bars.some((bar) => bar.key === current) ? current : null));
  }, [props.bars]);
  const present = props.bars.flatMap((bar) => (bar.value === null ? [] : [bar.value]));
  const top = Math.max(0, ...present);
  const bottom = Math.min(0, ...present);
  const span = top - bottom;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const zeroY = span === 0 ? PAD.top + plotHeight : PAD.top + (top / span) * plotHeight;
  const band = (WIDTH - PAD.side * 2) / Math.max(1, props.bars.length);
  const barWidth = Math.min(22, band * 0.62);
  const show = (value: number): string => (hidden ? maskNumbers(props.formatValue(value)) : props.formatValue(value));
  const formatValue = props.formatValue;
  const formatCount = useCallback((value: number) => `${value > 0 ? "+" : ""}${formatValue(value)}`, [formatValue]);
  const axis = useAxisLabels(
    props.bars.map((bar, index) => ({ key: bar.key, text: bar.label, x: PAD.side + band * (index + 0.5) })),
    PAD.side,
    WIDTH - PAD.side,
    present.length > 0,
  );

  // The bars as drawn now, so a change of period can move the months that stay and fade in the ones that appear.
  const snapshot: BarSnapshot = {
    keys: props.bars.map((bar) => bar.key),
    xs: props.bars.map((_, index) => PAD.side + band * index + (band - barWidth) / 2),
    frame: span === 0 ? null : { zeroY, scale: plotHeight / span },
  };
  useBarMorph(plot, snapshot, props.updateKey);

  if (present.length === 0) {
    return <p class="empty-note">No month has a figure to show yet.</p>;
  }
  const latest = [...props.bars].reverse().find((bar) => bar.value !== null);
  const selected = props.bars.find((bar) => bar.key === pinned);
  const shown = props.bars.find((bar) => bar.key === (hovered ?? focused)) ?? selected ?? latest;
  const tabStop = focused ?? selected?.key ?? latest?.key;
  function resetInspection(): void {
    setHovered(null);
    setFocused(null);
    setPinned(null);
    if (dateControl.current?.disabled === false) dateControl.current.focus({ preventScroll: true });
    else container.current?.focus({ preventScroll: true });
  }
  return (
    <figure
      ref={container}
      class="bars"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || (pinned === null && hovered === null && focused === null)) return;
        event.preventDefault();
        resetInspection();
      }}
    >
      <p class="bars-readout" aria-hidden="true">
        <span key={shown?.key} class="bars-readout-month">
          {shown === undefined ? "" : named(shown)}
        </span>
        <span
          class={`bars-readout-value ${shown?.value === undefined || shown.value === null ? "" : shown.value >= 0 ? "gain" : "loss"}`}
        >
          <AnimatedFigure
            value={hidden ? null : (shown?.value ?? null)}
            text={shown?.value == null ? "-" : `${shown.value > 0 ? "+" : ""}${show(shown.value)}`}
            format={formatCount}
          />
        </span>
      </p>
      <svg
        ref={plot}
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        role="group"
        aria-label={props.description}
        aria-describedby={`${props.id}-inspection-help`}
      >
        <line class="bars-zero" x1={PAD.side} x2={WIDTH - PAD.side} y1={zeroY} y2={zeroY} />
        {props.bars.map((bar, index) => {
          const x = PAD.side + band * index + (band - barWidth) / 2;
          const value = bar.value;
          const height = value === null || span === 0 ? 0 : (Math.abs(value) / span) * plotHeight;
          const y = value === null ? zeroY : value >= 0 ? zeroY - height : zeroY;
          return (
            <g
              key={bar.key}
              class={`bars-item${bar.key === shown?.key ? " is-active" : ""}`}
              role="button"
              tabIndex={bar.key === tabStop ? 0 : -1}
              aria-label={`${named(bar)}: ${value === null ? "Unavailable" : show(value)}`}
              aria-pressed={pinned === bar.key}
              onClick={() => {
                setPinned((current) => (current === bar.key ? null : bar.key));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPinned((current) => (current === bar.key ? null : bar.key));
                  return;
                }
                const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
                let target: number;
                if (event.key === "ArrowRight")
                  target = (index + (rtl ? -1 : 1) + props.bars.length) % props.bars.length;
                else if (event.key === "ArrowLeft")
                  target = (index + (rtl ? 1 : -1) + props.bars.length) % props.bars.length;
                else if (event.key === "Home") target = 0;
                else if (event.key === "End") target = props.bars.length - 1;
                else return;
                event.preventDefault();
                const items = event.currentTarget.parentElement?.querySelectorAll<SVGGElement>(".bars-item");
                items?.[target]?.focus({ preventScroll: true });
              }}
              onFocus={() => {
                setHovered(null);
                setFocused(bar.key);
              }}
              onBlur={() => {
                setFocused(null);
              }}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch") setHovered(bar.key);
              }}
              onPointerLeave={() => {
                setHovered(null);
              }}
            >
              <rect class="bars-hit" x={PAD.side + band * index} y={0} width={band} height={HEIGHT} />
              {value !== null && (
                <rect
                  class={`bar ${value >= 0 ? "gain" : "loss"} ${chartArrivalClass("bar")}`}
                  style={{
                    "--plot-arrival-origin": `${String(zeroY)}px`,
                    ...chartArrivalOrder(index),
                  }}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(height, 1.5)}
                  rx={Math.min(6, barWidth / 3)}
                >
                  <title>{`${named(bar)}: ${show(value)}`}</title>
                </rect>
              )}
            </g>
          );
        })}
        <g ref={axis.group} class="chart-time-axis" aria-hidden="true">
          {axis.labels.map((label) => (
            <text
              key={label.key}
              data-axis-key={label.key}
              class="chart-tick"
              x={label.x}
              y={HEIGHT - 6}
              text-anchor="middle"
              visibility={label.visible ? "visible" : "hidden"}
            >
              {label.text}
            </text>
          ))}
        </g>
      </svg>
      <label class="chart-date-control">
        <span>Explore months</span>
        <input
          ref={dateControl}
          type="range"
          min={0}
          max={Math.max(0, props.bars.length - 1)}
          step={1}
          value={Math.max(
            0,
            props.bars.findIndex((bar) => bar.key === shown?.key),
          )}
          disabled={props.bars.length < 2}
          aria-label={`${props.title}: month`}
          aria-describedby={`${props.id}-inspection-help`}
          aria-valuetext={
            shown === undefined
              ? "No observation"
              : `${named(shown)}: ${shown.value === null ? "Unavailable" : show(shown.value)}`
          }
          onFocus={() => {
            setHovered(null);
            setFocused(null);
          }}
          onInput={(event) => {
            setHovered(null);
            setFocused(null);
            setPinned(props.bars[Number(event.currentTarget.value)]?.key ?? null);
          }}
        />
        <span aria-hidden="true">{shown === undefined ? "" : named(shown)}</span>
      </label>
      <div class="chart-inspection-actions">
        <button
          class="quiet-action chart-reset"
          type="button"
          disabled={selected === undefined && hovered === null && focused === null}
          onClick={resetInspection}
        >
          Show latest month
        </button>
        <span class="hint" id={`${props.id}-inspection-help`}>
          Tap or press Enter to pin a month. Arrow keys explore; Escape shows the latest.
        </span>
      </div>
      <details class="chart-table">
        <summary>Show the values as a table</summary>
        <section class="chart-values" aria-labelledby={`${props.id}-values-heading`}>
          <div class="chart-values-heading">
            <h3 id={`${props.id}-values-heading`}>Recorded values</h3>
            <p>Every plotted month in the selected range. A dash means the value is unavailable.</p>
          </div>
          <div
            class="chart-values-scroll"
            role="region"
            aria-label={`${props.title}: monthly values table`}
            tabIndex={0}
          >
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
                    <th scope="row">
                      <ChartDate label={bar.label} />
                      <span class="chart-date-detail">{bar.detail ?? ""}</span>
                    </th>
                    <td data-label={props.title}>{bar.value === null ? "-" : show(bar.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </details>
    </figure>
  );
}
