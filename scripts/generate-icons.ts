// Draws the app icons from one scene: the owner's FD monogram on a tile cut into bento cards (FD-024).
// Run `node scripts/generate-icons.ts` to regenerate src/interfaces/web/public/icons/ (SVG and PNG, no image library).
// The scene lives in icon-mark.ts and is drawn twice from the same numbers: as SVG text and, by icon-raster.ts,
// into pixels. Use --check to detect stale assets, including the mark embedded in the social banner.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import process from "node:process";
import { MASTER, SAFE_RADIUS, TILE_RADIUS, foregroundReach, markSvg, markSvgBody, renderMark } from "./icon-mark.ts";
import { resample, toBytes } from "./icon-raster.ts";
import { pngContent } from "./png-content.ts";

const OUTPUT = "src/interfaces/web/public/icons";
const BANNER = "src/interfaces/web/public/social/preview.svg";
const BANNER_START = "<!-- mark:start -->";
const BANNER_END = "<!-- mark:end -->";

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

const ICONS: readonly { readonly file: string; readonly size: number; readonly rounded: boolean }[] = [
  { file: "favicon-48.png", size: 48, rounded: true },
  // "Any" icons have rounded corners and transparent edges.
  { file: "icon-192.png", size: 192, rounded: true },
  { file: "icon-512.png", size: 512, rounded: true },
  // A maskable icon fills the whole square: the launcher cuts the shape. The Apple icon is the same, because iOS rounds it.
  { file: "icon-maskable-192.png", size: 192, rounded: false },
  { file: "icon-maskable-512.png", size: 512, rounded: false },
  { file: "apple-touch-icon.png", size: 180, rounded: false },
];

// The letters must fit in the central safe CIRCLE that Android guarantees to keep. The tile, grid, shadow and glow
// are full-bleed or soft decoration and are meant to be cropped.
if (foregroundReach() > SAFE_RADIUS) throw new Error("Icon foreground escapes the Android maskable safe circle.");

const checkOnly = process.argv.includes("--check");
if (!checkOnly) mkdirSync(OUTPUT, { recursive: true });

function output(path: string, bytes: Buffer, kind: "svg" | "png"): void {
  if (checkOnly) {
    const actual = readFileSync(path);
    const matches = kind === "png" ? pngContent(actual).equals(pngContent(bytes)) : actual.equals(bytes);
    if (!matches) throw new Error(`Stale icon: ${path}. Run node scripts/generate-icons.ts.`);
  } else {
    writeFileSync(path, bytes);
    process.stdout.write(`Wrote ${path}\n`);
  }
}

output(`${OUTPUT}/icon.svg`, Buffer.from(markSvg()), "svg");

const masters = new Map<boolean, Float32Array>();
for (const { file, size, rounded } of ICONS) {
  let master = masters.get(rounded);
  if (master === undefined) {
    master = renderMark(rounded ? TILE_RADIUS : 0);
    masters.set(rounded, master);
  }
  output(`${OUTPUT}/${file}`, png(size, toBytes(size === MASTER ? master : resample(master, MASTER, size))), "png");
}

// The social banner embeds the same mark, between two markers, with its own id prefix.
const banner = readFileSync(BANNER, "utf8");
const start = banner.indexOf(BANNER_START);
const end = banner.indexOf(BANNER_END);
if (start < 0 || end < start) throw new Error(`${BANNER} needs ${BANNER_START} and ${BANNER_END} around the mark.`);
const embedded = `${BANNER_START}\n  <g transform="translate(72 62) scale(0.1133)">\n${markSvgBody(TILE_RADIUS, "mark-")}\n  </g>\n  ${BANNER_END}`;
const updated = `${banner.slice(0, start)}${embedded}${banner.slice(end + BANNER_END.length)}`;
if (checkOnly) {
  if (updated !== banner) throw new Error(`Stale banner mark: ${BANNER}. Run node scripts/generate-icons.ts.`);
} else {
  writeFileSync(BANNER, updated);
  process.stdout.write(`Wrote ${BANNER} (mark only; render preview.png from it)\n`);
}
