// Adds synthetic README screenshots beside the checked app without changing its bytes.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pngContent } from "./png-content.ts";
import { MOBILE_IMAGES, README_IMAGES } from "../docs/readme-views.ts";

export { README_IMAGES };
const RECEIPT = "screenshots.json";
const HEX = /^[a-f0-9]{64}$/u;

const MIN_CLEAR_SHARE = 0.02;
const SOLID_ALPHA = 128;
const BAND = 0.12;

export interface Layout {
  /** Share of fully transparent pixels. */
  readonly clear: number;
  /** Empty margin on each side, as a share of the image, around everything that is at least half opaque. */
  readonly margin: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  /** Share of the outer left and right bands that is painted. */
  readonly bands: { readonly left: number; readonly right: number };
}

const MIN_MARGIN = 0.01;
const MAX_MARGIN = 0.12;
const MIN_BALANCE = 0.4;

/** What is wrong with the framing of a desktop picture, in words; empty when it is framed well. A phone shot is a whole screen, so it is exempt. */
export function framingProblems(layout: Layout): string[] {
  const problems: string[] = [];
  for (const [side, margin] of Object.entries(layout.margin)) {
    if (margin < MIN_MARGIN) problems.push(`content touches the ${side} edge, so something is cut off`);
    else if (margin > MAX_MARGIN)
      problems.push(
        `the ${side} margin is ${String(Math.round(margin * 100))}% of the picture, so it is cropped too loosely`,
      );
  }
  const wider = Math.max(layout.bands.left, layout.bands.right);
  if (wider > 0 && Math.min(layout.bands.left, layout.bands.right) / wider < MIN_BALANCE)
    problems.push("one side is much emptier than the other, so it looks lopsided");
  return problems;
}

/** Measures 8-bit RGBA rows after undoing the PNG row filters. */
export function layoutOf(rows: Buffer, width: number, height: number): Layout {
  const stride = width * 4;
  const band = Math.max(1, Math.floor(width * BAND));
  let previous = new Uint8Array(stride);
  let current = new Uint8Array(stride);
  let clear = 0;
  let leftBand = 0;
  let rightBand = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let row = 0; row < height; row++) {
    const start = row * (stride + 1);
    const filter = rows[start] ?? 0;
    for (let index = 0; index < stride; index++) {
      const raw = rows[start + 1 + index] ?? 0;
      const left = index >= 4 ? (current[index - 4] ?? 0) : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= 4 ? (previous[index - 4] ?? 0) : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        predictor = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      }
      const value = (raw + predictor) & 255;
      current[index] = value;
      if (index % 4 !== 3) continue;
      const x = (index - 3) / 4;
      if (value === 0) clear++;
      if (value >= SOLID_ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (row < minY) minY = row;
        if (row > maxY) maxY = row;
        if (x < band) leftBand++;
        else if (x >= width - band) rightBand++;
      }
    }
    [previous, current] = [current, previous];
  }
  const painted = maxX >= 0;
  return {
    clear: clear / (width * height),
    margin: painted
      ? {
          left: minX / width,
          top: minY / height,
          right: (width - 1 - maxX) / width,
          bottom: (height - 1 - maxY) / height,
        }
      : { left: 1, top: 1, right: 1, bottom: 1 },
    bands: { left: leftBand / (band * height), right: rightBand / (band * height) },
  };
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function readFiles(root: string): Map<string, Buffer> {
  if (!lstatSync(root).isDirectory()) throw new Error("Artifact roots must be ordinary directories.");
  const files = new Map<string, Buffer>();
  function visit(directory: string, prefix: string): void {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const path = prefix + name;
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) visit(absolute, `${path}/`);
      else if (stat.isFile()) files.set(path, readFileSync(absolute));
      else throw new Error(`Artifact contains a symlink or special file: ${path}`);
    }
  }
  visit(root, "");
  return files;
}

export function treeDigest(files: ReadonlyMap<string, Buffer>): string {
  return sha256(
    Buffer.from(
      JSON.stringify(
        [...files]
          .sort(([left], [right]) => left.localeCompare(right, "en"))
          .map(([name, bytes]) => [name, sha256(bytes)]),
      ),
    ),
  );
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid screenshot receipt.");
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, expected: readonly string[]): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort()))
    throw new Error("Unexpected screenshot receipt fields.");
}

function images(root: string): { name: string; sha256: string; width: number; height: number }[] {
  if (!lstatSync(root).isDirectory()) throw new Error("Screenshot root must be an ordinary directory.");
  const names = readdirSync(root).sort();
  if (JSON.stringify(names.filter((name) => name !== RECEIPT)) !== JSON.stringify([...README_IMAGES].sort()))
    throw new Error("Screenshot folder does not hold exactly the images in scripts/docs/readme-views.ts.");
  const result = README_IMAGES.map((name) => {
    const file = join(root, name);
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024)
      throw new Error("Screenshot must be an ordinary PNG file within its size limit.");
    const bytes = readFileSync(file);
    if (bytes.length < 33 || bytes.toString("ascii", 12, 16) !== "IHDR" || bytes.readUInt32BE(8) !== 13)
      throw new Error("Missing PNG image header.");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (
      MOBILE_IMAGES.has(name)
        ? width !== 780 || height !== 1688
        : width < 1600 || width > 2880 || width % 2 !== 0 || height < 800 || height > 4000 || height % 2 !== 0
    )
      throw new Error("Unexpected README screenshot dimensions.");
    const channels = bytes[25] === 2 ? 3 : bytes[25] === 6 ? 4 : 0;
    if (bytes[24] !== 8 || channels === 0 || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0)
      throw new Error("Unsupported screenshot PNG encoding.");
    const content = pngContent(bytes);
    let compressedSize = 0;
    for (let offset = 8; offset < bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      if (bytes.toString("ascii", offset + 4, offset + 8) === "IDAT") compressedSize += length + 12;
      offset += length + 12;
    }
    const rowSize = width * channels + 1;
    const pixels = content.subarray(bytes.length - compressedSize);
    if (pixels.length !== height * rowSize) throw new Error("Incomplete screenshot pixel rows.");
    // Every README image is drawn without a page background, so a real share of its pixels is fully transparent.
    const layout = channels === 4 ? layoutOf(pixels, width, height) : undefined;
    if (layout === undefined || layout.clear < MIN_CLEAR_SHARE)
      throw new Error(`${name} must be drawn without a page background.`);
    const framing = MOBILE_IMAGES.has(name) ? [] : framingProblems(layout);
    if (framing.length > 0)
      throw new Error(
        `${name} is framed badly: ${framing.join("; ")}. Adjust its crop in scripts/docs/readme-views.ts.`,
      );
    for (let row = 0; row < height; row++)
      if ((pixels[row * rowSize] ?? 255) > 4) throw new Error("Invalid screenshot row filter.");
    return { name, sha256: sha256(bytes), width, height };
  });
  for (const light of result.filter((image) => image.name.endsWith("-light.png"))) {
    const dark = result.find((image) => image.name === light.name.replace("-light.png", "-dark.png"));
    if (dark?.height !== light.height) throw new Error("Light and dark screenshot framing must match.");
  }
  return result;
}

/** Called only after capture; the digest was recorded before launching the browser. */
export function writeCaptureReceipt(app: string, screenshots: string, appDigest: string, revision: string): void {
  if (!/^[a-f0-9]{40,64}$/u.test(revision) || !HEX.test(appDigest)) throw new Error("Invalid capture provenance.");
  if (treeDigest(readFiles(app)) !== appDigest) throw new Error("The checked app changed during screenshot capture.");
  const receipt = { version: 1, synthetic: true, revision, appSha256: appDigest, images: images(screenshots) };
  writeFileSync(join(screenshots, RECEIPT), `${JSON.stringify(receipt, null, 2)}\n`);
}

export function preparePages(app: string, screenshots: string, output: string, revision: string): void {
  const roots = [app, screenshots, output].map((root) => resolve(root));
  if (
    roots.some((left, index) =>
      roots.some((right, other) => index !== other && (left === right || left.startsWith(`${right}${sep}`))),
    )
  )
    throw new Error("Artifact input and output directories must be separate.");
  const appFiles = readFiles(app);
  for (const required of ["index.html", "sw.js", "manifest.webmanifest"])
    if (!appFiles.has(required)) throw new Error(`Checked app is missing ${required}.`);
  if ([...appFiles.keys()].some((name) => name === "readme" || name.startsWith("readme/")))
    throw new Error("The app already owns the README asset path.");
  const imageRecords = images(screenshots);
  const receiptPath = join(screenshots, RECEIPT);
  if (!lstatSync(receiptPath).isFile()) throw new Error("Screenshot receipt must be an ordinary file.");
  const receiptBytes = readFileSync(receiptPath);
  if (receiptBytes.length > 8192) throw new Error("Screenshot receipt is too large.");
  const receipt = object(JSON.parse(receiptBytes.toString("utf8")) as unknown);
  keys(receipt, ["version", "synthetic", "revision", "appSha256", "images"]);
  if (
    receipt["version"] !== 1 ||
    receipt["synthetic"] !== true ||
    typeof receipt["revision"] !== "string" ||
    !/^[a-f0-9]{40,64}$/u.test(receipt["revision"])
  )
    throw new Error("Invalid synthetic screenshot provenance.");
  if (receipt["revision"] !== revision) throw new Error("Screenshots were captured for another revision.");
  if (receipt["appSha256"] !== treeDigest(appFiles))
    throw new Error("Checked app differs from the pre-capture receipt.");
  if (JSON.stringify(receipt["images"]) !== JSON.stringify(imageRecords))
    throw new Error("Screenshot bytes or dimensions differ from the capture receipt.");
  const expected = new Map(appFiles);
  for (const name of [...README_IMAGES, RECEIPT]) expected.set(`readme/${name}`, readFileSync(join(screenshots, name)));
  rmSync(output, { recursive: true, force: true });
  for (const [name, bytes] of expected) {
    const target = join(output, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  const copied = readFiles(output);
  if (copied.size !== expected.size || [...expected].some(([name, bytes]) => !copied.get(name)?.equals(bytes)))
    throw new Error("Pages composition changed a checked file or introduced an extra file.");
  if (treeDigest(readFiles(app)) !== receipt["appSha256"])
    throw new Error("The checked app changed during Pages composition.");
  console.log(
    `Prepared Pages: ${String(appFiles.size)} byte-identical app files, ${String(README_IMAGES.length)} verified synthetic PNGs and their capture receipt.`,
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  preparePages(resolve("dist/web"), resolve("dist/readme"), resolve("dist/pages"), revision);
}
