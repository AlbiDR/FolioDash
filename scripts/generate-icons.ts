// Draws the app icons as PNG files with no image library: a rising line on a dark tile.
// Run `node scripts/generate-icons.ts` to regenerate src/interfaces/web/public/icons/.
// This also generates the SVG tab icon from the same geometry. Use --check to detect stale assets.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { pngContent } from "./png-content.ts";

type Point = readonly [number, number];
type Colour = readonly [number, number, number];

const OUTPUT = "src/interfaces/web/public/icons";
const GRID = 512;

// All foreground geometry must fit in the central safe CIRCLE (radius 40% of the canvas).
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
  { file: "favicon-48.png", size: 48, corner: 112 },
  // "Any" icons have rounded corners and transparent edges.
  { file: "icon-192.png", size: 192, corner: 112 },
  { file: "icon-512.png", size: 512, corner: 112 },
  // A maskable icon fills the whole square: the launcher cuts the shape. The Apple icon is the same, because iOS rounds it.
  { file: "icon-maskable-192.png", size: 192, corner: 0 },
  { file: "icon-maskable-512.png", size: 512, corner: 0 },
  { file: "apple-touch-icon.png", size: 180, corner: 0 },
];

// A capsule around each segment stays inside the circle when its endpoints do.
for (const [index, point] of LINE.entries()) {
  const radius = index === LINE.length - 1 ? Math.max(DOT_RADIUS, STROKE / 2) : STROKE / 2;
  if (Math.hypot(point[0] - GRID / 2, point[1] - GRID / 2) + radius > GRID * 0.4) {
    throw new Error("Icon foreground escapes the Android maskable safe circle.");
  }
}

const hex = (colour: Colour): string => `#${colour.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(GRID)} ${String(GRID)}">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hex(TOP)}"/>
      <stop offset="1" stop-color="${hex(BOTTOM)}"/>
    </linearGradient>
    <linearGradient id="line" gradientUnits="userSpaceOnUse" x1="${String(LINE[0]?.[0])}" y1="0" x2="${String(LINE.at(-1)?.[0])}" y2="0">
      <stop offset="0" stop-color="${hex(LINE_START)}"/>
      <stop offset="1" stop-color="${hex(LINE_END)}"/>
    </linearGradient>
  </defs>
  <rect width="${String(GRID)}" height="${String(GRID)}" rx="112" fill="url(#tile)"/>
  <polyline points="${LINE.map((point) => point.join(",")).join(" ")}" fill="none" stroke="url(#line)" stroke-width="${String(STROKE)}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${String(LINE.at(-1)?.[0])}" cy="${String(LINE.at(-1)?.[1])}" r="${String(DOT_RADIUS)}" fill="${hex(LINE_END)}"/>
</svg>
`;
const checkOnly = process.argv.includes("--check");
if (!checkOnly) mkdirSync(OUTPUT, { recursive: true });
function output(file: string, bytes: Buffer): void {
  const path = `${OUTPUT}/${file}`;
  if (checkOnly) {
    const actual = readFileSync(path);
    const matches = file.endsWith(".png") ? pngContent(actual).equals(pngContent(bytes)) : actual.equals(bytes);
    if (!matches) throw new Error(`Stale icon: ${path}. Run node scripts/generate-icons.ts.`);
  } else {
    writeFileSync(path, bytes);
    process.stdout.write(`Wrote ${path}\n`);
  }
}
output("icon.svg", Buffer.from(svg));
for (const { file, size, corner } of ICONS) output(file, png(size, render(size, corner)));
