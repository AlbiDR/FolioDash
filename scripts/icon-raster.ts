// A small software rasteriser for the app icon: no image library, plain arithmetic only, so the same
// pixels come out on every Node version and the generator's --check can compare them exactly.
// It draws what the icon needs: filled paths, strokes of a given width, gradients, blurred shadows,
// source-over compositing and an area-averaging resize. It is not a general SVG engine.

export type Point = readonly [number, number];
export type Polygon = readonly Point[];
export type Rgb = readonly [number, number, number];

export interface Stop {
  readonly offset: number;
  readonly colour: Rgb;
  readonly alpha: number;
}

/** Writes red, green and blue (0 to 1, not premultiplied) and alpha for the pixel centred at x, y. */
export type Paint = (x: number, y: number, out: Float64Array) => void;

export interface Transform {
  readonly scale: number;
  readonly dx: number;
  readonly dy: number;
}

const ARC_STEP = 0.035; // radians per flattened arc segment: about 0.05 px of error on a 250 px radius
const CURVE_STEPS = 24;
const SUB_ROWS = 4; // vertical samples per pixel; horizontal coverage is exact
const FAR = 1e9;

/** Reads an element that must exist, or fails loudly. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Missing item ${String(index)}`);
  return item;
}

/** "#rrggbb" as 0 to 1 channels. */
export function parseColour(hex: string): Rgb {
  const value = /^#([0-9a-f]{6})$/iu.exec(hex)?.[1];
  if (value === undefined) throw new Error(`Not a six-digit hex colour: ${hex}`);
  const channel = (offset: number): number => parseInt(value.slice(offset, offset + 2), 16) / 255;
  return [channel(0), channel(2), channel(4)];
}

/** Flattens a path of absolute M, L, H, V, circular A, Q and Z commands into closed polygons. */
export function flattenPath(d: string): Polygon[] {
  const tokens = d.match(/[MLHVAQZ]|-?\d*\.?\d+/gu) ?? [];
  const polygons: Point[][] = [];
  let ring: Point[] = [];
  let here: Point = [0, 0];
  let start: Point = [0, 0];
  let cursor = 0;
  const number = (): number => {
    const token = tokens[cursor++];
    if (token === undefined) throw new Error("The path ended inside a command");
    return Number(token);
  };
  const close = (): void => {
    if (ring.length > 2) polygons.push(ring);
    ring = [];
  };
  while (cursor < tokens.length) {
    const command = tokens[cursor++];
    if (command === "M") {
      close();
      here = [number(), number()];
      start = here;
      ring = [here];
    } else if (command === "L") {
      here = [number(), number()];
      ring.push(here);
    } else if (command === "H") {
      here = [number(), here[1]];
      ring.push(here);
    } else if (command === "V") {
      here = [here[0], number()];
      ring.push(here);
    } else if (command === "Q") {
      const control: Point = [number(), number()];
      const end: Point = [number(), number()];
      for (let step = 1; step <= CURVE_STEPS; step++) {
        const t = step / CURVE_STEPS;
        const u = 1 - t;
        ring.push([u * u * here[0] + 2 * u * t * control[0] + t * t * end[0], u * u * here[1] + 2 * u * t * control[1] + t * t * end[1]]);
      }
      here = end;
    } else if (command === "A") {
      const radius = number();
      number(); // the y radius: the icon only uses circles
      number(); // rotation
      const large = number() === 1;
      const sweep = number() === 1;
      const end: Point = [number(), number()];
      ring.push(...arc(here, end, radius, large, sweep));
      here = end;
    } else if (command === "Z") {
      here = start;
      close();
    } else throw new Error(`Unsupported path command ${String(command)}`);
  }
  close();
  return polygons;
}

/** The points of a circular arc from one point to another, excluding the start. */
function arc(from: Point, to: Point, radius: number, large: boolean, sweep: boolean): Point[] {
  const halfX = (from[0] - to[0]) / 2;
  const halfY = (from[1] - to[1]) / 2;
  const half = halfX * halfX + halfY * halfY;
  if (radius === 0 || half === 0) return [to];
  const reach = Math.max(radius * radius, half);
  const offset = Math.sqrt(Math.max(0, (reach - half) / half)) * (large === sweep ? -1 : 1);
  const centre: Point = [(from[0] + to[0]) / 2 + offset * halfY, (from[1] + to[1]) / 2 - offset * halfX];
  const r = Math.sqrt(Math.max(reach, half));
  const first = Math.atan2(from[1] - centre[1], from[0] - centre[0]);
  let span = Math.atan2(to[1] - centre[1], to[0] - centre[0]) - first;
  if (sweep && span < 0) span += 2 * Math.PI;
  if (!sweep && span > 0) span -= 2 * Math.PI;
  const steps = Math.max(1, Math.ceil(Math.abs(span) / ARC_STEP));
  const points: Point[] = [];
  for (let step = 1; step < steps; step++) {
    const angle = first + (span * step) / steps;
    points.push([centre[0] + r * Math.cos(angle), centre[1] + r * Math.sin(angle)]);
  }
  points.push(to);
  return points;
}

/** Maps polygons by a uniform scale and a shift. */
export function place(polygons: readonly Polygon[], transform: Transform, resolution: number): Polygon[] {
  return polygons.map((polygon) => polygon.map(([x, y]): Point => [(x * transform.scale + transform.dx) * resolution, (y * transform.scale + transform.dy) * resolution]));
}

export function bounds(polygons: readonly Polygon[]): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  let minX = FAR;
  let minY = FAR;
  let maxX = -FAR;
  let maxY = -FAR;
  for (const polygon of polygons) {
    for (const [x, y] of polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Anti-aliased coverage (0 to 1) of polygons on a square grid: exact horizontally, four samples vertically. */
export function fillMask(polygons: readonly Polygon[], size: number, rule: "nonzero" | "evenodd" = "nonzero"): Float32Array {
  const mask = new Float32Array(size * size);
  const edges: number[] = [];
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index++) {
      const a = at(polygon, index);
      const b = at(polygon, (index + 1) % polygon.length);
      if (a[1] !== b[1]) edges.push(a[0], a[1], b[0], b[1]);
    }
  }
  const byRow: number[][] = Array.from({ length: size }, () => []);
  for (let edge = 0; edge < edges.length / 4; edge++) {
    const y0 = edges[edge * 4 + 1] ?? 0;
    const y1 = edges[edge * 4 + 3] ?? 0;
    const last = Math.min(size - 1, Math.floor(Math.max(y0, y1)));
    for (let row = Math.max(0, Math.floor(Math.min(y0, y1))); row <= last; row++) byRow[row]?.push(edge);
  }
  const accumulated = new Float32Array(size + 1);
  const xs: number[] = [];
  const winding: number[] = [];
  for (let row = 0; row < size; row++) {
    const active = byRow[row] ?? [];
    if (active.length === 0) continue;
    accumulated.fill(0);
    for (let sub = 0; sub < SUB_ROWS; sub++) {
      const y = row + (sub + 0.5) / SUB_ROWS;
      xs.length = 0;
      winding.length = 0;
      for (const edge of active) {
        const x0 = edges[edge * 4] ?? 0;
        const y0 = edges[edge * 4 + 1] ?? 0;
        const x1 = edges[edge * 4 + 2] ?? 0;
        const y1 = edges[edge * 4 + 3] ?? 0;
        if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) {
          const x = x0 + ((y - y0) * (x1 - x0)) / (y1 - y0);
          const direction = y1 > y0 ? 1 : -1;
          let slot = xs.length;
          while (slot > 0 && (xs[slot - 1] ?? 0) > x) slot--;
          xs.splice(slot, 0, x);
          winding.splice(slot, 0, direction);
        }
      }
      let total = 0;
      for (let index = 0; index + 1 < xs.length; index++) {
        total = rule === "evenodd" ? (total + 1) % 2 : total + (winding[index] ?? 0);
        if (total !== 0) span(accumulated, xs[index] ?? 0, xs[index + 1] ?? 0, size);
      }
    }
    for (let column = 0; column < size; column++) mask[row * size + column] = (accumulated[column] ?? 0) / SUB_ROWS;
  }
  return mask;
}

function span(row: Float32Array, from: number, to: number, size: number): void {
  const a = Math.max(0, from);
  const b = Math.min(size, to);
  if (b <= a) return;
  const first = Math.floor(a);
  const last = Math.floor(b);
  if (first === last) {
    row[first] = (row[first] ?? 0) + (b - a);
    return;
  }
  row[first] = (row[first] ?? 0) + (first + 1 - a);
  for (let column = first + 1; column < last; column++) row[column] = (row[column] ?? 0) + 1;
  if (last < size) row[last] = (row[last] ?? 0) + (b - last);
}

/** Distance from each pixel centre to the nearest polygon edge, measured only within reach (FAR beyond it). */
export function boundaryDistance(polygons: readonly Polygon[], size: number, reach: number): Float32Array {
  const distance = new Float32Array(size * size).fill(FAR);
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index++) {
      const a = at(polygon, index);
      const b = at(polygon, (index + 1) % polygon.length);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = dx * dx + dy * dy;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - reach));
      const x1 = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0]) + reach));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - reach));
      const y1 = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1]) + reach));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5 - a[0];
          const py = y + 0.5 - a[1];
          const along = length === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / length));
          const ex = px - along * dx;
          const ey = py - along * dy;
          const d = Math.sqrt(ex * ex + ey * ey);
          const slot = y * size + x;
          if (d < (distance[slot] ?? FAR)) distance[slot] = d;
        }
      }
    }
  }
  return distance;
}

/** Coverage of a stroke of the given width centred on an edge, from distances to that edge. */
export function strokeCoverage(distance: Float32Array, width: number): Float32Array {
  const coverage = new Float32Array(distance.length);
  const half = width / 2;
  for (let slot = 0; slot < distance.length; slot++) coverage[slot] = Math.max(0, Math.min(1, half - (distance[slot] ?? FAR) + 0.5));
  return coverage;
}

export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const product = new Float32Array(a.length);
  for (let slot = 0; slot < a.length; slot++) product[slot] = (a[slot] ?? 0) * (b[slot] ?? 0);
  return product;
}

/** A linear gradient along the line from one point to another. */
export function linear(x1: number, y1: number, x2: number, y2: number, stops: readonly Stop[]): Paint {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  return (x, y, out) => {
    ramp(stops, Math.max(0, Math.min(1, (((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / length))), out);
  };
}

export function radial(cx: number, cy: number, radius: number, stops: readonly Stop[]): Paint {
  return (x, y, out) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    ramp(stops, Math.min(1, Math.sqrt(dx * dx + dy * dy) / radius), out);
  };
}

export function solid(colour: Rgb, alpha: number): Paint {
  return (_x, _y, out) => {
    out[0] = colour[0];
    out[1] = colour[1];
    out[2] = colour[2];
    out[3] = alpha;
  };
}

/** Interpolates colour and alpha separately between stops, as SVG gradients do. */
function ramp(stops: readonly Stop[], t: number, out: Float64Array): void {
  const first = at(stops, 0);
  const last = at(stops, stops.length - 1);
  if (t <= first.offset) {
    stopInto(first, first, 0, out);
    return;
  }
  for (let index = 1; index < stops.length; index++) {
    const upper = at(stops, index);
    if (t <= upper.offset) {
      const lower = at(stops, index - 1);
      const width = upper.offset - lower.offset;
      stopInto(lower, upper, width === 0 ? 1 : (t - lower.offset) / width, out);
      return;
    }
  }
  stopInto(last, last, 0, out);
}

function stopInto(lower: Stop, upper: Stop, amount: number, out: Float64Array): void {
  out[0] = lower.colour[0] + (upper.colour[0] - lower.colour[0]) * amount;
  out[1] = lower.colour[1] + (upper.colour[1] - lower.colour[1]) * amount;
  out[2] = lower.colour[2] + (upper.colour[2] - lower.colour[2]) * amount;
  out[3] = lower.alpha + (upper.alpha - lower.alpha) * amount;
}

/** A square premultiplied RGBA image. */
export class Canvas {
  readonly size: number;
  readonly data: Float32Array;

  constructor(size: number) {
    this.size = size;
    this.data = new Float32Array(size * size * 4);
  }

  /** Source-over: paints through a coverage mask, optionally limited by a clip mask and an opacity. */
  paint(mask: Float32Array, paint: Paint, opacity = 1, clip?: Float32Array): void {
    const colour = new Float64Array(4);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const slot = y * this.size + x;
        const coverage = (mask[slot] ?? 0) * (clip === undefined ? 1 : (clip[slot] ?? 0)) * opacity;
        if (coverage <= 0) continue;
        paint(x, y, colour);
        const alpha = (colour[3] ?? 0) * coverage;
        if (alpha <= 0) continue;
        const base = slot * 4;
        const keep = 1 - alpha;
        this.data[base] = (colour[0] ?? 0) * alpha + (this.data[base] ?? 0) * keep;
        this.data[base + 1] = (colour[1] ?? 0) * alpha + (this.data[base + 1] ?? 0) * keep;
        this.data[base + 2] = (colour[2] ?? 0) * alpha + (this.data[base + 2] ?? 0) * keep;
        this.data[base + 3] = alpha + (this.data[base + 3] ?? 0) * keep;
      }
    }
  }
}

/** The SVG specification's box-blur approximation of a Gaussian blur, applied to a coverage mask. */
export function blur(mask: Float32Array, size: number, sigma: number): Float32Array {
  const d = Math.floor((sigma * 3 * Math.sqrt(2 * Math.PI)) / 4 + 0.5);
  if (d < 1) return mask;
  const passes: readonly (readonly [number, number])[] =
    d % 2 === 1
      ? [[(d - 1) / 2, (d - 1) / 2], [(d - 1) / 2, (d - 1) / 2], [(d - 1) / 2, (d - 1) / 2]]
      : [[d / 2, d / 2 - 1], [d / 2 - 1, d / 2], [d / 2, d / 2]];
  let current = mask;
  for (const [before, after] of passes) {
    current = box(box(current, size, before, after, true), size, before, after, false);
  }
  return current;
}

function box(source: Float32Array, size: number, before: number, after: number, horizontal: boolean): Float32Array {
  const result = new Float32Array(source.length);
  const width = before + after + 1;
  for (let line = 0; line < size; line++) {
    const read = (index: number): number => (index < 0 || index >= size ? 0 : (source[horizontal ? line * size + index : index * size + line] ?? 0));
    let sum = 0;
    for (let index = -before; index <= after; index++) sum += read(index);
    for (let index = 0; index < size; index++) {
      result[horizontal ? line * size + index : index * size + line] = sum / width;
      sum += read(index + after + 1) - read(index - before);
    }
  }
  return result;
}

/** Area-averaging resize of a premultiplied RGBA image to a smaller or equal square size. */
export function resample(source: Float32Array, from: number, to: number): Float32Array {
  const across = new Float32Array(to * from * 4);
  const ratio = from / to;
  for (let row = 0; row < from; row++) {
    for (let column = 0; column < to; column++) {
      const low = column * ratio;
      const high = (column + 1) * ratio;
      for (let x = Math.floor(low); x < Math.min(from, Math.ceil(high)); x++) {
        const weight = (Math.min(high, x + 1) - Math.max(low, x)) / ratio;
        for (let channel = 0; channel < 4; channel++) {
          const target = (row * to + column) * 4 + channel;
          across[target] = (across[target] ?? 0) + (source[(row * from + x) * 4 + channel] ?? 0) * weight;
        }
      }
    }
  }
  const result = new Float32Array(to * to * 4);
  for (let row = 0; row < to; row++) {
    const low = row * ratio;
    const high = (row + 1) * ratio;
    for (let y = Math.floor(low); y < Math.min(from, Math.ceil(high)); y++) {
      const weight = (Math.min(high, y + 1) - Math.max(low, y)) / ratio;
      for (let column = 0; column < to; column++) {
        for (let channel = 0; channel < 4; channel++) {
          const target = (row * to + column) * 4 + channel;
          result[target] = (result[target] ?? 0) + (across[(y * to + column) * 4 + channel] ?? 0) * weight;
        }
      }
    }
  }
  return result;
}

/** Straight (non-premultiplied) 8-bit RGBA bytes from a premultiplied float image. */
export function toBytes(premultiplied: Float32Array): Uint8Array {
  const bytes = new Uint8Array(premultiplied.length);
  const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
  for (let slot = 0; slot < premultiplied.length; slot += 4) {
    const alpha = premultiplied[slot + 3] ?? 0;
    if (alpha <= 0) continue;
    for (let channel = 0; channel < 3; channel++) bytes[slot + channel] = clamp(((premultiplied[slot + channel] ?? 0) / alpha) * 255);
    bytes[slot + 3] = clamp(alpha * 255);
  }
  return bytes;
}
