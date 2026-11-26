import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { afterEach, describe, it, mock } from "node:test";
import {
  fetchPublishedScreenshots,
  preparePages,
  readFiles,
  README_IMAGES,
  treeDigest,
  writeCaptureReceipt,
} from "./pages.ts";

const REVISION = "a".repeat(40);
const temporary: string[] = [];
afterEach(() => {
  mock.restoreAll();
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

function chunk(type: string, data: Buffer): Buffer {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4, "ascii");
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}

/** A picture whose pixels are transparent except for an opaque box, given as shares of its width and height. */
function png(width: number, height: number, box?: readonly [number, number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = box === undefined ? 2 : 6;
  const stride = width * (box === undefined ? 3 : 4) + 1;
  const rows = Buffer.alloc(height * stride);
  if (box !== undefined) {
    for (let row = Math.floor(box[1] * height); row < Math.floor(box[3] * height); row++) {
      for (let pixel = Math.floor(box[0] * width); pixel < Math.floor(box[2] * width); pixel++)
        rows[row * stride + 1 + pixel * 4 + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const FRAMED = [0.03, 0.04, 0.97, 0.96] as const;

// The smallest desktop picture the assembly accepts. Every check measures shares of the picture, so a larger fixture
// proves nothing more and only slows each case: the assembly decodes all fifteen images every time it runs.
const WIDTH = 1600;
const HEIGHT = 800;

const desktop = png(2880, 1200);
const mobile = png(780, 1688, [0.02, 0, 0.98, 1]);
const clear = png(WIDTH, HEIGHT, FRAMED);

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
  for (const name of README_IMAGES)
    writeFileSync(join(paths.screenshots, name), name === "portfolio-mobile.png" ? mobile : clear);
  writeCaptureReceipt(paths.app, paths.screenshots, treeDigest(readFiles(paths.app)), REVISION);
  return paths;
}

void describe("checked Pages composition", () => {
  void it("preserves every app byte and adds only the manifest images and their receipt", () => {
    const { app, screenshots, output } = fixture();
    const before = treeDigest(readFiles(app));
    preparePages(app, screenshots, output, REVISION);
    assert.equal(treeDigest(readFiles(app)), before);
    const composed = readFiles(output);
    for (const [name, bytes] of readFiles(app)) assert.equal(composed.get(name)?.equals(bytes), true);
    assert.deepEqual(
      [...composed.keys()].sort(),
      [...readFiles(app).keys(), ...README_IMAGES.map((name) => `readme/${name}`), "readme/screenshots.json"].sort(),
    );
  });

  for (const name of ["unexpected.js", "unexpected.html"])
    void it(`rejects an unexpected presentation file: ${name}`, () => {
      const { app, screenshots, output } = fixture();
      writeFileSync(join(screenshots, name), "Synthetic extra file");
      assert.throws(() => {
        preparePages(app, screenshots, output, REVISION);
      }, /exactly the images/u);
    });

  void it("rejects app mutation after capture and leaves the last composed artifact intact", () => {
    const { app, screenshots, output } = fixture();
    preparePages(app, screenshots, output, REVISION);
    const before = treeDigest(readFiles(output));
    writeFileSync(join(app, "sw.js"), "Changed worker");
    assert.throws(() => {
      preparePages(app, screenshots, output, REVISION);
    }, /pre-capture/u);
    assert.equal(treeDigest(readFiles(output)), before);
  });

  void it("refuses a capture receipt if the app changed while the browser ran", () => {
    const { app, screenshots } = fixture();
    const before = treeDigest(readFiles(app));
    writeFileSync(join(app, "index.html"), "Changed app");
    assert.throws(() => {
      writeCaptureReceipt(app, screenshots, before, REVISION);
    }, /changed during/u);
  });

  void it("rejects a valid but replaced PNG from another generation", () => {
    const { app, screenshots, output } = fixture();
    writeFileSync(join(screenshots, "portfolio-mobile.png"), png(780, 1688 + 2));
    assert.throws(() => {
      preparePages(app, screenshots, output, REVISION);
    }, /dimensions/u);
    const changed = Buffer.from(mobile);
    // A changed harmless ancillary chunk preserves a valid PNG but changes its receipt hash.
    writeFileSync(
      join(screenshots, "portfolio-mobile.png"),
      Buffer.concat([
        changed.subarray(0, -12),
        chunk("tEXt", Buffer.from("Synthetic generation change")),
        changed.subarray(-12),
      ]),
    );
    assert.throws(() => {
      preparePages(app, screenshots, output, REVISION);
    }, /capture receipt/u);
  });

  void it("rejects corrupted PNG checksums and truncated image content", () => {
    const { app, screenshots, output } = fixture();
    const damaged = Buffer.from(mobile);
    damaged[40] = (damaged[40] ?? 0) ^ 1;
    writeFileSync(join(screenshots, "portfolio-mobile.png"), damaged);
    assert.throws(() => {
      preparePages(app, screenshots, output, REVISION);
    }, /checksum/u);
    writeFileSync(join(screenshots, "portfolio-mobile.png"), mobile.subarray(0, -12));
    assert.throws(() => {
      preparePages(app, screenshots, output, REVISION);
    }, /Incomplete PNG/u);
  });

  void it("rejects symlinks in both input compartments", () => {
    const { app, screenshots, output } = fixture();
    const image = join(screenshots, "hero-light.png");
    rmSync(image);
    symlinkSync(join(screenshots, "hero-dark.png"), image);
    assert.throws(() => {
      preparePages(app, screenshots, output, REVISION);
    }, /ordinary PNG/u);
    rmSync(image);
    writeFileSync(image, desktop);
    const linkedRoot = `${screenshots}-link`;
    symlinkSync(screenshots, linkedRoot, "dir");
    assert.throws(() => {
      preparePages(app, linkedRoot, output, REVISION);
    }, /ordinary directory/u);
    symlinkSync(join(app, "index.html"), join(app, "assets", "linked.html"));
    assert.throws(() => {
      preparePages(app, screenshots, output, REVISION);
    }, /symlink/u);
  });

  void it("rejects an image that is drawn on an opaque page background", () => {
    const { app, screenshots, output } = fixture();
    writeFileSync(join(screenshots, "hero-light.png"), png(WIDTH, HEIGHT, [0, 0, 1, 1]));
    assert.throws(() => {
      writeCaptureReceipt(app, screenshots, treeDigest(readFiles(app)), REVISION);
    }, /without a page background/u);
    assert.throws(() => {
      preparePages(app, screenshots, output, REVISION);
    }, /without a page background/u);
  });

  for (const [problem, box, pattern] of [
    ["content cut off at an edge", [0.03, 0.04, 0.97, 1], /touches the bottom edge/u],
    ["a crop that is far too loose", [0.2, 0.2, 0.8, 0.8], /cropped too loosely/u],
    ["a picture that fills only one side", [0.03, 0.04, 0.55, 0.96], /lopsided/u],
  ] as const)
    void it(`rejects ${problem}`, () => {
      const { app, screenshots } = fixture();
      writeFileSync(join(screenshots, "hero-light.png"), png(WIDTH, HEIGHT, box));
      assert.throws(() => {
        writeCaptureReceipt(app, screenshots, treeDigest(readFiles(app)), REVISION);
      }, pattern);
    });

  void it("rejects receipts for another revision or carrying extra fields", () => {
    const { app, screenshots, output } = fixture();
    assert.throws(() => {
      preparePages(app, screenshots, output, "b".repeat(40));
    }, /another revision/u);
    const receiptPath = join(screenshots, "screenshots.json");
    const receipt: unknown = JSON.parse(readFileSync(receiptPath, "utf8"));
    writeFileSync(
      receiptPath,
      JSON.stringify({ ...(receipt as Record<string, unknown>), unexpected: "Synthetic extra field" }),
    );
    assert.throws(() => {
      preparePages(app, screenshots, output, REVISION);
    }, /Unexpected screenshot receipt fields/u);
  });

  void it("carries over a published set from an earlier revision and app, and says so", () => {
    const { app, screenshots, output } = fixture();
    writeFileSync(join(app, "index.html"), "Synthetic app of a later revision");
    assert.throws(() => {
      preparePages(app, screenshots, output, "b".repeat(40));
    }, /another revision/u);
    const log = mock.method(console, "log", () => undefined);
    preparePages(app, screenshots, output, "b".repeat(40), true);
    assert.match(
      String(log.mock.calls[0]?.arguments[0]),
      new RegExp(`carried over from the release of ${REVISION}`, "u"),
    );
    const composed = readFiles(output);
    for (const [name, bytes] of readFiles(app)) assert.equal(composed.get(name)?.equals(bytes), true);
    for (const name of [...README_IMAGES, "screenshots.json"])
      assert.equal(composed.get(`readme/${name}`)?.equals(readFileSync(join(screenshots, name))), true);
  });

  void it("still rejects a carried-over image that differs from its published receipt", () => {
    const { app, screenshots, output } = fixture();
    const changed = Buffer.from(mobile);
    writeFileSync(
      join(screenshots, "portfolio-mobile.png"),
      Buffer.concat([changed.subarray(0, -12), chunk("tEXt", Buffer.from("Synthetic change")), changed.subarray(-12)]),
    );
    assert.throws(() => {
      preparePages(app, screenshots, output, "b".repeat(40), true);
    }, /capture receipt/u);
  });

  void it("downloads only the manifest's images and the receipt from the live site", async () => {
    const { screenshots } = fixture();
    const target = join(screenshots, "..", "published");
    const requested: string[] = [];
    mock.method(globalThis, "fetch", (url: URL) => {
      requested.push(url.href);
      return Promise.resolve(new Response(readFileSync(join(screenshots, url.pathname.split("/").pop() ?? ""))));
    });
    await fetchPublishedScreenshots("https://synthetic.example/FolioDash", target);
    assert.deepEqual(
      requested.sort(),
      ["screenshots.json", ...README_IMAGES].map((name) => `https://synthetic.example/FolioDash/readme/${name}`).sort(),
    );
    for (const name of ["screenshots.json", ...README_IMAGES])
      assert.equal(readFileSync(join(target, name)).equals(readFileSync(join(screenshots, name))), true);
  });

  void it("refuses a live site that is not HTTPS or that is missing an image", async () => {
    const { screenshots } = fixture();
    const target = join(screenshots, "..", "published");
    await assert.rejects(fetchPublishedScreenshots("http://synthetic.example/", target), /HTTPS/u);
    mock.method(globalThis, "fetch", () => Promise.resolve(new Response("Not found", { status: 404 })));
    await assert.rejects(fetchPublishedScreenshots("https://synthetic.example/", target), /HTTP 404/u);
  });
});
