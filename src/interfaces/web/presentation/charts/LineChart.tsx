import { motionMilliseconds } from "../../shared/ui/motionTiming";
import { useAxisLabels } from "./useAxisLabels";
import type { ComponentChildren, JSX, TargetedPointerEvent } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { usePrivacy } from "../privacy/privacy";
import { maskNumbers } from "../privacy/privacyChoice";
import { type ChartSeries, computeLineChart } from "./lineChartGeometry";

export interface LineChartProps {
  readonly id: string;
  readonly title: string;
  /** Presentation cue for a changed period; plotted observations update immediately. */
  readonly updateKey?: string;
  /** One sentence for assistive technology describing what the chart shows. */
  readonly description: string;
  /** One plain sentence under the title telling anyone what the lines mean. Use it when the lines need explaining up front. */
  readonly subtitle?: string;
  /** A sentence of reference kept with the chart tools instead of above the chart. */
  readonly note?: string;
  /** A control that governs only this chart, shown beside its title. */
  readonly controls?: ComponentChildren;
  readonly series: readonly ChartSeries[];
  /** Names a position on the time axis. Generated ticks are calendar positions, so this must describe a date, not a statement. */
  readonly formatTime: (time: number) => string;
  /** Names an actual observation in the readout, the spoken value and the table. Defaults to `formatTime`. */
  readonly formatObservation?: (time: number) => string;
  readonly formatValue: (value: number) => string;
  /** Extend the value axis to zero. Off by default: the axis fits the data. */
  readonly includeZero?: boolean;
  /** Fill the area under the first series, as Apple's Stocks does. */
  readonly fillFirst?: boolean;
  /** Grow the plot to use height the card is given beside taller neighbours, never shrinking below the standard height. */
  readonly fillHeight?: boolean;
  /** Text shown when there is nothing to plot. */
  readonly emptyMessage: string;
}

// Value labels sit on the right, inside the card, as in Apple's Stocks.
const LAYOUT = {
  width: 720,
  height: 300,
  margin: { top: 12, right: 78, bottom: 28, left: 8 },
} as const;
/** The tallest the plot grows to fill a card, so a very tall neighbour cannot stretch it past a readable shape. */
const FILL_MAX_HEIGHT = 560;
/** Nor taller than this share of its width: a time series stays a wide shape even when its neighbour is tall. */
const FILL_MAX_RATIO = 0.8;
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
  const plot = useRef<SVGSVGElement>(null);
  const previousUpdate = useRef(props.updateKey);
  const updateAnimation = useRef<Animation | null>(null);
  const interruptedOpacity = useRef<number | null>(null);
  useLayoutEffect(() => {
    const changed = previousUpdate.current !== props.updateKey;
    previousUpdate.current = props.updateKey;
    updateAnimation.current?.cancel();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settle = (): void => { if (preference.matches) updateAnimation.current?.cancel(); };
    const node = plot.current;
    if (changed && !preference.matches && node !== null && typeof node.animate === "function") {
      const style = getComputedStyle(node);
      updateAnimation.current = node.animate([{ opacity: interruptedOpacity.current ?? Number.parseFloat(style.getPropertyValue("--motion-update-opacity")) }, { opacity: 1 }], { duration: motionMilliseconds(style.getPropertyValue("--duration-feedback")), easing: style.getPropertyValue("--ease-standard").trim() });
    }
    interruptedOpacity.current = null;
    preference.addEventListener("change", settle);
    return () => {
      preference.removeEventListener("change", settle);
      interruptedOpacity.current = updateAnimation.current?.playState === "running" && node !== null ? Number.parseFloat(getComputedStyle(node).opacity) : null;
      updateAnimation.current?.cancel();
    };
  }, [props.updateKey, hidden]);
  const [scrubbed, setScrubbed] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const touchStart = useRef<{ readonly previous: number | null } | null>(null);
  const dateControl = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState<number>(LAYOUT.width);
  const [filledHeight, setFilledHeight] = useState<number | null>(null);
  const fillHeight = props.fillHeight === true;
  useEffect(() => {
    const node = container.current;
    if (node === null) return;
    let frame: number | null = null;
    let measuredWidth: number = LAYOUT.width;
    let fillFrame: number | null = null;
    /** Spare height the stretched card has beyond the other content, which the plot may take. */
    const spare = (): number | null => {
      const svg = plot.current;
      const last = node.lastElementChild;
      if (svg === null || last === null) return null;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      const inner = node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const other = last.getBoundingClientRect().bottom - box.top - parseFloat(style.paddingTop) - svg.getBoundingClientRect().height;
      return Math.max(LAYOUT.height, Math.min(FILL_MAX_HEIGHT, Math.round(measuredWidth * FILL_MAX_RATIO), Math.floor(inner - other)));
    };
    const fill = (): void => {
      if (!fillHeight) return;
      const target = spare();
      if (target === null) return;
      setFilledHeight((current) => (current !== null && Math.abs(current - target) <= 2) || (current === null && target === LAYOUT.height) ? current : target);
    };
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined || entry.contentRect.width <= 0) return;
      const nextWidth = Math.max(200, Math.round(entry.contentRect.width));
      if (nextWidth === measuredWidth) {
        // A height-only change, such as a neighbour reflowing, may leave spare room to use or give back.
        if (fillHeight) {
          if (fillFrame !== null) cancelAnimationFrame(fillFrame);
          fillFrame = requestAnimationFrame(() => { fillFrame = null; fill(); });
        }
        return;
      }
      measuredWidth = nextWidth;
      if (frame !== null) cancelAnimationFrame(frame);
      // Do not change the observed card's layout inside its resize delivery.
      frame = requestAnimationFrame(() => {
        frame = null;
        setWidth(nextWidth);
        if (!fillHeight) return;
        // A new width reflows the neighbours: measure again from the standard height so the plot can shrink as well as grow.
        setFilledHeight(null);
        if (fillFrame !== null) cancelAnimationFrame(fillFrame);
        fillFrame = requestAnimationFrame(() => { fillFrame = requestAnimationFrame(() => { fillFrame = null; fill(); }); });
      });
    });
    observer.observe(node);
    if (fillHeight) fillFrame = requestAnimationFrame(() => { fillFrame = null; fill(); });
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      if (fillFrame !== null) cancelAnimationFrame(fillFrame);
    };
  }, [fillHeight]);
  const plotHeight = fillHeight && filledHeight !== null ? filledHeight : LAYOUT.height;
  const layout = { ...LAYOUT, width, height: width < 480 ? 200 : plotHeight };
  // Drawing geometry depends only on the series and the axis choice, so reading values by hovering does not redo it.
  const includeZero = props.includeZero ?? false;
  const geometry = useMemo(() => computeLineChart(props.series, { ...LAYOUT, width, height: width < 480 ? 200 : plotHeight, includeZero }), [props.series, includeZero, width, plotHeight]);
  const axis = useAxisLabels(geometry.xTicks.map(tick => ({ key: String(tick.time), text: props.formatTime(tick.time), x: tick.x })), geometry.plot.left, geometry.plot.left + geometry.plot.width, !geometry.empty);
  const times = useMemo(() => [...new Set(props.series.flatMap((entry) => entry.points.map((point) => point.time)))].sort(
    (left, right) => left - right,
  ), [props.series]);
  // A shorter period must not retain an observation or series that is no longer present.
  useEffect(() => {
    setScrubbed(current => current !== null && times.includes(current) ? current : null);
    setHovered(null);
    setHighlighted(current => props.series.some(entry => entry.id === current) ? current : null);
  }, [props.series, times]);
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

  const xByTime = new Map(geometry.series.flatMap((entry) => entry.points.map((point) => [point.time, point.x] as const)));
  // The chart opens on the latest line observation, not on a checkpoint that happens to be newer.
  const lineTimes = new Set(props.series.filter((entry) => entry.markers !== true).flatMap((entry) => entry.points.map((point) => point.time)));
  const lastTime = [...times].reverse().find((time) => lineTimes.has(time)) ?? times[times.length - 1];
  const selectedTime = scrubbed !== null && times.includes(scrubbed) ? scrubbed : null;
  const hoveredTime = hovered !== null && times.includes(hovered) ? hovered : null;
  const activeTime = hoveredTime ?? selectedTime ?? lastTime;
  const activeX = activeTime === undefined ? undefined : xByTime.get(activeTime);
  const baseline = geometry.plot.top + geometry.plot.height;
  const show = (value: number): string => (hidden ? maskNumbers(props.formatValue(value)) : props.formatValue(value));
  const observation = props.formatObservation ?? props.formatTime;
  const valueSummary = geometry.series.filter(entry => !entry.muted).map(entry => {
    const point = entry.points.find(candidate => candidate.time === activeTime);
    return `${entry.label}: ${point === undefined ? "Unavailable" : show(point.value)}${point?.detail == null ? "" : ` (${point.detail})`}`;
  }).join("; ");

  function resetInspection(): void {
    setScrubbed(null);
    setHovered(null);
    setHighlighted(null);
  }

  // With two lines the readout above already names them. The highlight buttons stay inline only where a legend is
  // the way to tell many lines apart; otherwise they live with the chart tools.
  const legendInline = geometry.series.filter(entry => !entry.muted && !entry.markers).length > 2;
  const legend = (
    <ul class="chart-legend">
      {geometry.series.map((entry, index) =>
        entry.muted ? null : (
          <li key={entry.id} class={`chart-legend-item ${styleClass(index, entry.slot)}${entry.dashed ? " dashed" : ""}`}>
            <button type="button" class="chart-legend-button" aria-pressed={highlight === entry.id} aria-label={`Highlight ${entry.label}`} onClick={() => {
              setHighlighted(current => current === entry.id ? null : entry.id);
            }}>
              <svg class="chart-swatch" viewBox="0 0 32 8" aria-hidden="true">
                {entry.markers ? <rect class="checkpoint-swatch" x="12" y="0" width="8" height="8" transform="rotate(45 16 4)" /> : <line x1="0" x2="32" y1="4" y2="4" />}
              </svg>
              {entry.label}
            </button>
          </li>
        ),
      )}
    </ul>
  );

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
    if (event.pointerType === "touch" || (event.pointerType === "pen" && event.buttons !== 0)) setScrubbed(nearest);
    else setHovered(nearest);
  }

  return (
    <figure ref={container} class={props.controls === undefined ? "chart" : "chart chart-with-controls"} tabIndex={-1} onKeyDown={(event) => {
      if (event.key !== "Escape" || (selectedTime === null && hoveredTime === null && highlight === null)) return;
      event.preventDefault();
      resetInspection();
    }}>
      <figcaption class="chart-title" id={titleId}>
        {props.title}
      </figcaption>
      {props.controls !== undefined && <div class="chart-controls">{props.controls}</div>}
      {props.subtitle !== undefined && <p class="chart-subtitle">{props.subtitle}</p>}
      <div class="chart-readout" aria-hidden="true">
        <span class="chart-readout-date">{activeTime === undefined ? "" : observation(activeTime)}</span>
        {geometry.series.map((entry, index) => {
          if (entry.muted) return null;
          const point = entry.points.find((candidate) => candidate.time === activeTime);
          // Markers appear in the readout only where there is one, so a chart without a checkpoint keeps its two items.
          if (entry.markers && point === undefined) return null;
          return (
            <span key={entry.id} data-highlighted={highlight === entry.id} class={`chart-readout-item ${styleClass(index, entry.slot)}${entry.dashed ? " dashed" : ""}`}>
              <span class="chart-readout-label">
                <svg class="chart-swatch" viewBox="0 0 32 8" aria-hidden="true">
                  {entry.markers ? <rect class="checkpoint-swatch" x="12" y="0" width="8" height="8" transform="rotate(45 16 4)" /> : <line x1="0" x2="32" y1="4" y2="4" />}
                </svg>
                {entry.label}
              </span>
              <span class="chart-readout-value">{point === undefined ? "-" : show(point.value)}{point?.detail == null ? "" : ` (${point.detail})`}</span>
            </span>
          );
        })}
      </div>
      <svg
        ref={plot}
        class="chart-svg"
        viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        onPointerMove={scrubTo}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if (event.pointerType === "touch" || event.pointerType === "pen") touchStart.current = { previous: selectedTime };
          scrubTo(event);
        }}
        onPointerUp={() => { touchStart.current = null; }}
        onPointerCancel={() => {
          if (touchStart.current !== null) setScrubbed(touchStart.current.previous);
          touchStart.current = null;
          setHovered(null);
        }}
        onPointerLeave={() => {
          setHovered(null);
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
          <g ref={axis.group} class="chart-time-axis" aria-hidden="true">
            {axis.labels.map(label => <text key={label.key} data-axis-key={label.key} class="chart-tick" x={label.x} y={baseline + 20} text-anchor="middle" visibility={label.visible ? "visible" : "hidden"}>{label.text}</text>)}
          </g>
        </g>
        {activeX !== undefined && (selectedTime !== null || hoveredTime !== null) && (
          <line class="chart-guide" x1={activeX} x2={activeX} y1={geometry.plot.top} y2={baseline} />
        )}
        {geometry.series.map((entry, index) => (
          <g key={entry.id} class={`chart-series ${styleClass(index, entry.slot)}${entry.dashed ? " dashed" : ""}${entry.muted ? " muted" : ""}${highlight !== null && highlight !== entry.id ? " unfocused" : ""}`} data-series={entry.id}>
            {props.fillFirst === true && index === 0 && entry.areas.map((area) => <path key={area} class="area" d={area} />)}
            {entry.paths.map((path) => (
              <path key={path} class="line" d={path} fill="none" />
            ))}
            {entry.markers && entry.points.map((point) => (
              <rect
                key={point.time}
                class={`checkpoint-marker${point.time === activeTime ? " is-active" : ""}`}
                x={point.x - 5}
                y={point.y - 5}
                width={10}
                height={10}
                transform={`rotate(45 ${String(point.x)} ${String(point.y)})`}
                data-time={point.time}
                {...(hidden ? {} : { "data-value": point.value })}
              />
            ))}
            {(entry.muted || entry.markers ? [] : entry.points).map((point) => (
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
          ref={dateControl}
          type="range"
          min={0}
          max={Math.max(0, times.length - 1)}
          step={1}
          value={Math.max(0, times.indexOf(activeTime ?? 0))}
          disabled={times.length < 2}
          aria-label={`${props.title}: observation date`}
          aria-describedby={`${props.id}-inspection-help`}
          aria-valuetext={activeTime === undefined ? "No observation" : `${observation(activeTime)}. ${valueSummary}`}
          onFocus={() => { setHovered(null); }}
          onInput={(event) => { setHovered(null); setScrubbed(times[Number(event.currentTarget.value)] ?? null); }}
        />
      </label>
      {legendInline && legend}
      <details class="chart-table">
        <summary>Chart tools and values</summary>
      {props.note !== undefined && <p class="chart-note">{props.note}</p>}
      {!legendInline && legend}
      <div class="chart-inspection-actions">
        <button class="quiet-action chart-reset" type="button" disabled={selectedTime === null && hoveredTime === null && highlight === null} onClick={() => {
          resetInspection();
          if (dateControl.current?.disabled === false) dateControl.current.focus({ preventScroll: true });
          else container.current?.focus({ preventScroll: true });
        }}>Reset chart inspection</button>
        <span class="hint" id={`${props.id}-inspection-help`}>Explore dates with the slider. Escape resets inspection.</span>
      </div>

      <p class="footnote">Select a legend name to highlight its line. Select it again to show all equally. The scale stays the same.</p>

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
                  return <td key={entry.id}>{point?.value === undefined || point.value === null ? "-" : show(point.value)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>
    </figure>
  );
}
