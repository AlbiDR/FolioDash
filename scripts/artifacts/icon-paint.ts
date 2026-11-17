// Paints and the compositing canvas of the icon rasteriser: gradients, flat colour and source-over painting.

import { type Paint, type Rgb, type Stop, at } from "./icon-raster.ts";

/** A linear gradient along the line from one point to another. */
export function linear(x1: number, y1: number, x2: number, y2: number, stops: readonly Stop[]): Paint {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  return (x, y, out) => {
    ramp(stops, Math.max(0, Math.min(1, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / length)), out);
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
