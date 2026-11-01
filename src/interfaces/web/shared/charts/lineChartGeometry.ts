import { scaleLinear, scaleUtc } from "d3-scale";
import { line } from "d3-shape";

/** Domain-blind chart input: times are UTC milliseconds, values are plain numbers. */
export interface ChartPoint {
  readonly time: number;
  /** Null is a gap (no observation). Zero is a real value. */
  readonly value: number | null;
}

export interface ChartSeries {
  readonly id: string;
  readonly label: string;
  /** Draw dashed. For a series that is a different measure, never for the same measure from another source. */
  readonly dashed?: boolean;
  /** The palette slot, so a companion series can share its fund's colour. Defaults to the series' position. */
  readonly slot?: number;
  /** A quiet companion line (dotted, faded) in the colour of its slot. It is left out of the legend and the readout. */
  readonly muted?: boolean;
  readonly points: readonly ChartPoint[];
}

export interface ChartLayout {
  readonly width: number;
  readonly height: number;
  readonly margin: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  /** Extend the value axis to include zero. Off for series where the baseline carries no meaning. */
  readonly includeZero: boolean;
}

export interface PlottedPoint {
  readonly seriesId: string;
  readonly time: number;
  readonly value: number;
  readonly x: number;
  readonly y: number;
}

export interface PlottedSeries {
  readonly id: string;
  readonly label: string;
  readonly dashed: boolean;
  readonly slot: number | null;
  readonly muted: boolean;
  /** One path per unbroken run of two or more points. A gap always splits the line. */
  readonly paths: readonly string[];
  /** The filled shape under each run, down to the bottom of the plot. */
  readonly areas: readonly string[];
  readonly points: readonly PlottedPoint[];
}

export interface ChartGeometry {
  readonly empty: boolean;
  readonly plot: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly xTicks: readonly { readonly time: number; readonly x: number }[];
  readonly yTicks: readonly { readonly value: number; readonly y: number }[];
  readonly series: readonly PlottedSeries[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TICK_TARGET = 5;
/** Headroom above the highest and below the lowest value, as a share of the range. Deliberately small. */
const VALUE_BUFFER = 0.03;
/** An intermediate tick closer than this share of the range to an end tick is dropped, so labels do not collide. */
const TICK_CLEARANCE = 0.14;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Pure layout for a multi-series time line chart. The time axis is true elapsed
 * time, every series shares one set of axes so all plotted values inform the
 * bounds, and a missing observation breaks the line instead of being joined.
 */
export function computeLineChart(series: readonly ChartSeries[], layout: ChartLayout): ChartGeometry {
  const plot = {
    left: layout.margin.left,
    top: layout.margin.top,
    width: layout.width - layout.margin.left - layout.margin.right,
    height: layout.height - layout.margin.top - layout.margin.bottom,
  };
  const observed = series.flatMap((entry) =>
    entry.points.flatMap((point) => (point.value === null ? [] : [{ time: point.time, value: point.value }])),
  );
  if (observed.length === 0) return { empty: true, plot, xTicks: [], yTicks: [], series: [] };

  let minTime = Math.min(...observed.map((point) => point.time));
  let maxTime = Math.max(...observed.map((point) => point.time));
  if (minTime === maxTime) {
    minTime -= DAY_MS;
    maxTime += DAY_MS;
  }
  let minValue = Math.min(...observed.map((point) => point.value));
  let maxValue = Math.max(...observed.map((point) => point.value));
  if (layout.includeZero) {
    minValue = Math.min(minValue, 0);
    maxValue = Math.max(maxValue, 0);
  }
  if (minValue === maxValue) {
    const pad = Math.abs(minValue) > 0 ? Math.abs(minValue) * 0.1 : 1;
    minValue -= pad;
    maxValue += pad;
  }

  const xScale = scaleUtc().domain([new Date(minTime), new Date(maxTime)]).range([plot.left, plot.left + plot.width]);
  // The axis runs from the lowest to the highest plotted value plus a small buffer. It is not rounded outwards.
  const buffer = (maxValue - minValue) * VALUE_BUFFER;
  const yScale = scaleLinear().domain([minValue - buffer, maxValue + buffer]).range([plot.top + plot.height, plot.top]);
  const span = maxValue - minValue;
  const between = yScale
    .ticks(TICK_TARGET)
    .filter((value) => value - minValue > span * TICK_CLEARANCE && maxValue - value > span * TICK_CLEARANCE);
  const yTickValues = [minValue, ...between, maxValue];
  const path = line<PlottedPoint>()
    .x((point) => point.x)
    .y((point) => point.y)
    .digits(2);

  const plotted = series.map((entry): PlottedSeries => {
    const ordered = [...entry.points].sort((left, right) => left.time - right.time);
    const points: PlottedPoint[] = [];
    const paths: string[] = [];
    const areas: string[] = [];
    const base = round(plot.top + plot.height);
    let run: PlottedPoint[] = [];
    const flush = (): void => {
      const drawn = run.length >= 2 ? path(run) : null;
      const first = run[0];
      const last = run[run.length - 1];
      if (drawn !== null && first !== undefined && last !== undefined) {
        paths.push(drawn);
        areas.push(`${drawn}L${String(last.x)},${String(base)}L${String(first.x)},${String(base)}Z`);
      }
      run = [];
    };
    for (const point of ordered) {
      if (point.value === null) {
        flush();
        continue;
      }
      const placed: PlottedPoint = {
        seriesId: entry.id,
        time: point.time,
        value: point.value,
        x: round(xScale(new Date(point.time))),
        y: round(yScale(point.value)),
      };
      points.push(placed);
      run.push(placed);
    }
    flush();
    return { id: entry.id, label: entry.label, dashed: entry.dashed === true, slot: entry.slot ?? null, muted: entry.muted === true, paths, areas, points };
  });

  return {
    empty: false,
    plot,
    xTicks: xScale.ticks(TICK_TARGET).map((date) => ({ time: date.getTime(), x: round(xScale(date)) })),
    yTicks: yTickValues.map((value) => ({ value, y: round(yScale(value)) })),
    series: plotted,
  };
}
