// Draws the app icons as PNG files with no image library: a rising line on a dark tile.
// Run `node scripts/generate-icons.ts` to regenerate src/interfaces/web/public/icons/.
// The same shapes are in public/icons/icon.svg, which the browser tab uses.

import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

type Point = readonly [number, number];
type Colour = readonly [number, number, number];

const OUTPUT = "src/interfaces/web/public/icons";
const GRID = 512;

// The chart, on a 512 grid, kept inside the central 80 percent that a maskable icon may not crop.
const LINE: readonly Point[] = [
  [122, 332],
  [208, 252],
  [278, 302],
  [394, 180],
];
const STROKE = 36;
const DOT_RADIUS = 34;
const TOP: Colour = [22, 31, 62];
const BOTTOM: Colour = [6, 9, 20];
const LINE_START: Colour = [11, 95, 255];
const LINE_END: Colour = [140, 182, 255];
const SAMPLES = 3;

const mix = (from: Colour, to: Colour, amount: number): Colour => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
];

function distanceToSegment(x: number, y: number, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const along = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + along * dx), y - (ay + along * dy));
}

/** Whether a point lies inside a square with rounded corners, or anywhere when the radius is zero. */
function insideTile(x: number, y: number, radius: number): boolean {
  if (radius === 0) return true;
  const cx = Math.min(Math.max(x, radius), GRID - radius);
  const cy = Math.min(Math.max(y, radius), GRID - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

/** The colour and opacity of one point of the icon, before any smoothing. */
function sample(x: number, y: number, cornerRadius: number): readonly [number, number, number, number] {
  if (!insideTile(x, y, cornerRadius)) return [0, 0, 0, 0];
  let colour = mix(TOP, BOTTOM, y / GRID);
  const first = LINE[0] as Point;
  const dot = LINE[LINE.length - 1] as Point;
  if (Math.hypot(x - dot[0], y - dot[1]) <= DOT_RADIUS) {
    colour = LINE_END;
  } else {
    for (let index = 0; index < LINE.length - 1; index++) {
      if (distanceToSegment(x, y, LINE[index] as Point, LINE[index + 1] as Point) <= STROKE / 2) {
        colour = mix(LINE_START, LINE_END, (x - first[0]) / (dot[0] - first[0]));
        break;
      }
    }
  }
  return [colour[0], colour[1], colour[2], 255];
}

/** Draws the icon at a size, averaging several samples per pixel so the edges are smooth. */
function render(size: number, cornerRadius: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const scale = GRID / size;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const [r, g, b, a] = sample((column + (sx + 0.5) / SAMPLES) * scale, (row + (sy + 0.5) / SAMPLES) * scale, cornerRadius);
          red += r * a;
          green += g * a;
          blue += b * a;
          alpha += a;
        }
      }
      const offset = (row * size + column) * 4;
      if (alpha > 0) {
        pixels[offset] = Math.round(red / alpha);
        pixels[offset + 1] = Math.round(green / alpha);
        pixels[offset + 2] = Math.round(blue / alpha);
      }
      pixels[offset + 3] = Math.round(alpha / (SAMPLES * SAMPLES));
    }
  }
  return pixels;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function png(size: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let row = 0; row < size; row++) {
    rows[row * (size * 4 + 1)] = 0; // no filter
    rows.set(pixels.subarray(row * size * 4, (row + 1) * size * 4), row * (size * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", new Uint8Array(0))]);
}

const ICONS: readonly { readonly file: string; readonly size: number; readonly corner: number }[] = [
  // "Any" icons have rounded corners and transparent edges.
  { file: "icon-192.png", size: 192, corner: 112 },
  { file: "icon-512.png", size: 512, corner: 112 },
  // A maskable icon fills the whole square: the launcher cuts the shape. The Apple icon is the same, because iOS rounds it.
  { file: "icon-maskable-512.png", size: 512, corner: 0 },
  { file: "apple-touch-icon.png", size: 180, corner: 0 },
];

mkdirSync(OUTPUT, { recursive: true });
for (const { file, size, corner } of ICONS) {
  writeFileSync(`${OUTPUT}/${file}`, png(size, render(size, corner)));
  process.stdout.write(`Wrote ${OUTPUT}/${file}\n`);
}
