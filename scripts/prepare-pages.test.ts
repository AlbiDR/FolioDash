import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { afterEach, describe, it } from "node:test";
import { preparePages, readFiles, README_IMAGES, treeDigest, writeCaptureReceipt } from "./prepare-pages.ts";

const REVISION = "a".repeat(40);
const temporary: string[] = [];
afterEach(() => { for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true }); });

function chunk(type: string, data: Buffer): Buffer {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4, "ascii");
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}

function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.alloc(height * (width * 3 + 1)))), chunk("IEND", Buffer.alloc(0))]);
}

const desktop = png(2880, 1200);
const mobile = png(780, 1688);

function fixture(): { app: string; screenshots: string; output: string } {
  const root = mkdtempSync(join(tmpdir(), "foliodash-pages-test-"));
  temporary.push(root);
  const paths = { app: join(root, "web"), screenshots: join(root, "readme"), output: join(root, "pages") };
  mkdirSync(join(paths.app, "assets"), { recursive: true });
  mkdirSync(paths.screenshots);
  writeFileSync(join(paths.app, "index.html"), "Synthetic checked application");
  writeFileSync(join(paths.app, "sw.js"), "Synthetic checked service worker");
  writeFileSync(join(paths.app, "manifest.webmanifest"), "{}");
  writeFileSync(join(paths.app, "assets", "main.js"), "Synthetic checked module");
  for (const name of README_IMAGES) writeFileSync(join(paths.screenshots, name), name === "portfolio-mobile.png" ? mobile : desktop);
  writeCaptureReceipt(paths.app, paths.screenshots, treeDigest(readFiles(paths.app)), REVISION);
  return paths;
}

void describe("checked Pages composition", () => {
  void it("preserves every app byte and adds only the five images and their receipt", () => {
    const { app, screenshots, output } = fixture();
    const before = treeDigest(readFiles(app));
    preparePages(app, screenshots, output, REVISION);
    assert.equal(treeDigest(readFiles(app)), before);
    const composed = readFiles(output);
    for (const [name, bytes] of readFiles(app)) assert.equal(composed.get(name)?.equals(bytes), true);
    assert.deepEqual([...composed.keys()].sort(), [...readFiles(app).keys(), ...README_IMAGES.map(name => `readme/${name}`), "readme/screenshots.json"].sort());
  });

  for (const name of ["unexpected.js", "unexpected.html"]) void it(`rejects an unexpected presentation file: ${name}`, () => {
    const { app, screenshots, output } = fixture();
    writeFileSync(join(screenshots, name), "Synthetic extra file");
    assert.throws(() => { preparePages(app, screenshots, output, REVISION); }, /exactly five/u);
  });

  void it("rejects app mutation after capture and leaves the last composed artifact intact", () => {
    const { app, screenshots, output } = fixture();
    preparePages(app, screenshots, output, REVISION);
    const before = treeDigest(readFiles(output));
    writeFileSync(join(app, "sw.js"), "Changed worker");
    assert.throws(() => { preparePages(app, screenshots, output, REVISION); }, /pre-capture/u);
    assert.equal(treeDigest(readFiles(output)), before);
  });

  void it("refuses a capture receipt if the app changed while the browser ran", () => {
    const { app, screenshots } = fixture();
    const before = treeDigest(readFiles(app));
    writeFileSync(join(app, "index.html"), "Changed app");
    assert.throws(() => { writeCaptureReceipt(app, screenshots, before, REVISION); }, /changed during/u);
  });

  void it("rejects a valid but replaced PNG from another generation", () => {
    const { app, screenshots, output } = fixture();
    writeFileSync(join(screenshots, "portfolio-mobile.png"), png(780, 1688 + 2));
    assert.throws(() => { preparePages(app, screenshots, output, REVISION); }, /dimensions/u);
    const changed = Buffer.from(mobile);
    // A changed harmless ancillary chunk preserves a valid PNG but changes its receipt hash.
    writeFileSync(join(screenshots, "portfolio-mobile.png"), Buffer.concat([changed.subarray(0, -12), chunk("tEXt", Buffer.from("Synthetic generation change")), changed.subarray(-12)]));
    assert.throws(() => { preparePages(app, screenshots, output, REVISION); }, /capture receipt/u);
  });

  void it("rejects corrupted PNG checksums and truncated image content", () => {
    const { app, screenshots, output } = fixture();
    const damaged = Buffer.from(mobile);
    damaged[40] = (damaged[40] ?? 0) ^ 1;
    writeFileSync(join(screenshots, "portfolio-mobile.png"), damaged);
    assert.throws(() => { preparePages(app, screenshots, output, REVISION); }, /checksum/u);
    writeFileSync(join(screenshots, "portfolio-mobile.png"), mobile.subarray(0, -12));
    assert.throws(() => { preparePages(app, screenshots, output, REVISION); }, /Incomplete PNG/u);
  });

  void it("rejects symlinks in both input compartments", () => {
    const { app, screenshots, output } = fixture();
    const image = join(screenshots, "hero-light.png");
    rmSync(image);
    symlinkSync(join(screenshots, "hero-dark.png"), image);
    assert.throws(() => { preparePages(app, screenshots, output, REVISION); }, /ordinary PNG/u);
    rmSync(image);
    writeFileSync(image, desktop);
    const linkedRoot = `${screenshots}-link`;
    symlinkSync(screenshots, linkedRoot, "dir");
    assert.throws(() => { preparePages(app, linkedRoot, output, REVISION); }, /ordinary directory/u);
    symlinkSync(join(app, "index.html"), join(app, "assets", "linked.html"));
    assert.throws(() => { preparePages(app, screenshots, output, REVISION); }, /symlink/u);
  });

  void it("rejects receipts for another revision or carrying extra fields", () => {
    const { app, screenshots, output } = fixture();
    assert.throws(() => { preparePages(app, screenshots, output, "b".repeat(40)); }, /another revision/u);
    const receiptPath = join(screenshots, "screenshots.json");
    const receipt: unknown = JSON.parse(readFileSync(receiptPath, "utf8"));
    writeFileSync(receiptPath, JSON.stringify({ ...(receipt as Record<string, unknown>), unexpected: "Synthetic extra field" }));
    assert.throws(() => { preparePages(app, screenshots, output, REVISION); }, /Unexpected screenshot receipt fields/u);
  });
});
