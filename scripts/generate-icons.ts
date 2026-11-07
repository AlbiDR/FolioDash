// Draws the app icons from one piece of geometry: a ring cut by an off-centre cross into four pieces.
// Run `node scripts/generate-icons.ts` to regenerate src/interfaces/web/public/icons/ (SVG and PNG, no image library).
// The SVG and every PNG come from the numbers below. Use --check to detect stale assets.
//
// The mark is a portfolio ring (the pieces are the shares) cut by the grid of a dashboard (the straight gaps).
// The cross sits off-centre, so the pieces differ in size; the smallest is the one bright spark.
// The ring has one size and the gaps one width, so the mark keeps its shape at any size and on any background.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { pngContent } from "./png-content.ts";

type Point = readonly [number, number];
type Colour = readonly [number, number, number];
type Step =
  | { readonly kind: "line"; readonly to: Point }
  | { readonly kind: "arc"; readonly to: Point; readonly radius: number; readonly clockwise: boolean };

const OUTPUT = "src/interfaces/web/public/icons";
const GRID = 512;
const TILE_RADIUS = 112;
const SAMPLES = 6;

const RING = { centre: [256, 256] as Point, inner: 88, outer: 160, fillet: 10 } as const;
// The vertical gap sits right of the ring's centre and the horizontal gap above it.
const CUT = { x: 292, y: 225, gap: 22 } as const;

const TILE_TOP: Colour = [61, 124, 255];
const TILE_BOTTOM: Colour = [18, 63, 209];
// A soft light from the top left keeps the tile from reading as a flat fill.
const GLOW = { x: 0.28, y: 0.1, radius: 0.75, opacity: 0.16 } as const;
const WHITE: Colour = [255, 255, 255];
const SPARK: Colour = [255, 185, 56];

interface Piece {
  readonly right: boolean;
  readonly below: boolean;
  readonly colour: Colour;
  readonly opacity: number;
}
const PIECES: readonly Piece[] = [
  { right: false, below: true, colour: WHITE, opacity: 1 },
  { right: true, below: true, colour: WHITE, opacity: 0.62 },
  { right: false, below: false, colour: WHITE, opacity: 0.36 },
  { right: true, below: false, colour: SPARK, opacity: 1 },
];

const mix = (from: Colour, to: Colour, amount: number): Colour => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
];

// Every piece is the ring cut by two straight gaps, with each of its four corners rounded by the same radius.
// A rounded corner is a circle of that radius tucked into the corner, so the centres of those circles
// outline a smaller sharp-cornered piece (the core). Drawing and filling both start from the same centres.
interface Corner {
  readonly centre: Point;
  readonly onCut: Point;
  readonly onRing: Point;
}
interface PieceGeometry {
  readonly across: number;
  readonly down: number;
  readonly cutX: number;
  readonly cutY: number;
  readonly outerVertical: Corner;
  readonly outerHorizontal: Corner;
  readonly innerVertical: Corner;
  readonly innerHorizontal: Corner;
}

function geometry(piece: Piece): PieceGeometry {
  const [cx, cy] = RING.centre;
  const { inner, outer, fillet } = RING;
  const across = piece.right ? 1 : -1;
  const down = piece.below ? 1 : -1;
  const cutX = CUT.x + (across * CUT.gap) / 2;
  const cutY = CUT.y + (down * CUT.gap) / 2;
  const centreX = cutX + across * fillet;
  const centreY = cutY + down * fillet;
  const outerReach = outer - fillet;
  const innerReach = inner + fillet;
  const along = (radius: number, offset: number): number => Math.sqrt(radius * radius - offset * offset);
  const onRing = (centre: Point, radius: number, reach: number): Point => [cx + ((centre[0] - cx) * radius) / reach, cy + ((centre[1] - cy) * radius) / reach];
  const vertical = (reach: number, radius: number): Corner => {
    const centre: Point = [centreX, cy + down * along(reach, centreX - cx)];
    return { centre, onCut: [cutX, centre[1]], onRing: onRing(centre, radius, reach) };
  };
  const horizontal = (reach: number, radius: number): Corner => {
    const centre: Point = [cx + across * along(reach, centreY - cy), centreY];
    return { centre, onCut: [centre[0], cutY], onRing: onRing(centre, radius, reach) };
  };
  return {
    across,
    down,
    cutX,
    cutY,
    outerVertical: vertical(outerReach, outer),
    outerHorizontal: horizontal(outerReach, outer),
    innerVertical: vertical(innerReach, inner),
    innerHorizontal: horizontal(innerReach, inner),
  };
}

/** The outline of a piece, walked clockwise: rounded corners and the ring's arcs, with straight runs along the gaps. */
function outline(piece: Piece): { readonly start: Point; readonly steps: readonly Step[] } {
  const g = geometry(piece);
  const { inner, outer, fillet } = RING;
  const horizontalFirst = g.across * g.down === 1;
  const [first, second, innerSecond, innerFirst] = horizontalFirst
    ? [g.outerHorizontal, g.outerVertical, g.innerVertical, g.innerHorizontal]
    : [g.outerVertical, g.outerHorizontal, g.innerHorizontal, g.innerVertical];
  return {
    start: first.onCut,
    steps: [
      { kind: "arc", to: first.onRing, radius: fillet, clockwise: true },
      { kind: "arc", to: second.onRing, radius: outer, clockwise: true },
      { kind: "arc", to: second.onCut, radius: fillet, clockwise: true },
      { kind: "line", to: innerSecond.onCut },
      { kind: "arc", to: innerSecond.onRing, radius: fillet, clockwise: true },
      { kind: "arc", to: innerFirst.onRing, radius: inner, clockwise: false },
      { kind: "arc", to: innerFirst.onCut, radius: fillet, clockwise: true },
    ],
  };
}

const wrap = (angle: number): number => {
  let turn = angle % (2 * Math.PI);
  if (turn > Math.PI) turn -= 2 * Math.PI;
  if (turn <= -Math.PI) turn += 2 * Math.PI;
  return turn;
};

function distanceToSegment(x: number, y: number, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const along = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + along * dx), y - (ay + along * dy));
}

/** Distance from a point to the arc of a circle around the ring's centre, between two points of that circle. */
function distanceToArc(x: number, y: number, radius: number, from: Point, to: Point): number {
  const [cx, cy] = RING.centre;
  const start = Math.atan2(from[1] - cy, from[0] - cx);
  const span = wrap(Math.atan2(to[1] - cy, to[0] - cx) - start);
  const offset = wrap(Math.atan2(y - cy, x - cx) - start);
  const within = span >= 0 ? offset >= 0 && offset <= span : offset <= 0 && offset >= span;
  if (within) return Math.abs(Math.hypot(x - cx, y - cy) - radius);
  return Math.min(Math.hypot(x - from[0], y - from[1]), Math.hypot(x - to[0], y - to[1]));
}

/** Whether a point lies inside a piece: inside its core, or within the corner radius of the core. */
function insidePiece(g: PieceGeometry, x: number, y: number): boolean {
  const [cx, cy] = RING.centre;
  const { inner, outer, fillet } = RING;
  const distance = Math.hypot(x - cx, y - cy);
  if (distance < inner || distance > outer) return false;
  const across = g.across * (x - g.cutX);
  const down = g.down * (y - g.cutY);
  if (across < 0 || down < 0) return false;
  if (distance >= inner + fillet && distance <= outer - fillet && across >= fillet && down >= fillet) return true;
  const toCore = Math.min(
    distanceToArc(x, y, outer - fillet, g.outerVertical.centre, g.outerHorizontal.centre),
    distanceToArc(x, y, inner + fillet, g.innerVertical.centre, g.innerHorizontal.centre),
    distanceToSegment(x, y, g.outerVertical.centre, g.innerVertical.centre),
    distanceToSegment(x, y, g.outerHorizontal.centre, g.innerHorizontal.centre),
  );
  return toCore <= fillet;
}

/** Whether a point lies inside a square with rounded corners, or anywhere when the radius is zero. */
function insideTile(x: number, y: number, radius: number): boolean {
  if (radius === 0) return true;
  const cx = Math.min(Math.max(x, radius), GRID - radius);
  const cy = Math.min(Math.max(y, radius), GRID - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

const SHAPES = PIECES.map((piece) => ({ piece, geometry: geometry(piece) }));

/** The colour and opacity of one point of the icon, before any smoothing. */
function sample(x: number, y: number, cornerRadius: number): readonly [number, number, number, number] {
  if (!insideTile(x, y, cornerRadius)) return [0, 0, 0, 0];
  let colour = mix(TILE_TOP, TILE_BOTTOM, y / GRID);
  const reach = Math.hypot(x - GLOW.x * GRID, y - GLOW.y * GRID) / (GLOW.radius * GRID);
  colour = mix(colour, WHITE, GLOW.opacity * Math.max(0, 1 - reach));
  for (const { piece, geometry: shape } of SHAPES) {
    if (insidePiece(shape, x, y)) colour = mix(colour, piece.colour, piece.opacity);
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
  { file: "favicon-48.png", size: 48, corner: TILE_RADIUS },
  // "Any" icons have rounded corners and transparent edges.
  { file: "icon-192.png", size: 192, corner: TILE_RADIUS },
  { file: "icon-512.png", size: 512, corner: TILE_RADIUS },
  // A maskable icon fills the whole square: the launcher cuts the shape. The Apple icon is the same, because iOS rounds it.
  { file: "icon-maskable-192.png", size: 192, corner: 0 },
  { file: "icon-maskable-512.png", size: 512, corner: 0 },
  { file: "apple-touch-icon.png", size: 180, corner: 0 },
];

// The whole ring must fit in the central safe CIRCLE (radius 40% of the canvas) that Android guarantees to keep.
if (RING.outer > GRID * 0.4) throw new Error("Icon foreground escapes the Android maskable safe circle.");

const hex = (colour: Colour): string => `#${colour.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
const number = (value: number): string => String(Math.round(value * 10) / 10);
const at = (point: Point): string => `${number(point[0])} ${number(point[1])}`;

function pathData(piece: Piece): string {
  const { start, steps } = outline(piece);
  const parts = steps.map((step) => (step.kind === "line" ? `L${at(step.to)}` : `A${number(step.radius)} ${number(step.radius)} 0 0 ${step.clockwise ? "1" : "0"} ${at(step.to)}`));
  return `M${at(start)}${parts.join("")}Z`;
}

const pieces = PIECES.map((piece) => `  <path d="${pathData(piece)}" fill="${hex(piece.colour)}"${piece.opacity < 1 ? ` fill-opacity="${String(piece.opacity)}"` : ""}/>`).join("\n");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(GRID)} ${String(GRID)}">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hex(TILE_TOP)}"/>
      <stop offset="1" stop-color="${hex(TILE_BOTTOM)}"/>
    </linearGradient>
    <radialGradient id="glow" cx="${String(GLOW.x)}" cy="${String(GLOW.y)}" r="${String(GLOW.radius)}">
      <stop offset="0" stop-color="#ffffff" stop-opacity="${String(GLOW.opacity)}"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${String(GRID)}" height="${String(GRID)}" rx="${String(TILE_RADIUS)}" fill="url(#tile)"/>
  <rect width="${String(GRID)}" height="${String(GRID)}" rx="${String(TILE_RADIUS)}" fill="url(#glow)"/>
${pieces}
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
