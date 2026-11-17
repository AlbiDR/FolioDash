import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CAPTURED, README_IMAGES, VIEWS, renderGallery, withGallery } from "./readmeViews.ts";

const readme = readFileSync("README.md", "utf8");

void describe("README screenshot manifest", () => {
  void it("keeps the generated README gallery in step with the manifest", () => {
    assert.equal(
      withGallery(readme),
      readme,
      "README gallery is out of date. Run npm run docs:readme and commit README.md.",
    );
  });

  void it("shows every captured view somewhere in the README", () => {
    for (const image of README_IMAGES) assert.ok(readme.includes(`/readme/${image}`), `README does not show ${image}`);
  });

  void it("does not link a README image that is never captured", () => {
    const linked = [...readme.matchAll(/FolioDash\/readme\/([\w-]+\.png)/gu)].map((match) => match[1]);
    for (const name of linked)
      assert.ok(README_IMAGES.includes(name ?? ""), `README links ${String(name)}, which no capture produces`);
  });

  void it("explains every skipped route and gives each capture a unique file", () => {
    for (const [name, entry] of Object.entries(VIEWS))
      if ("skip" in entry) assert.ok(entry.skip.length > 20, `${name} needs a reason`);
    assert.equal(new Set(README_IMAGES).size, README_IMAGES.length);
    assert.ok(CAPTURED.length >= 2);
    assert.ok(renderGallery().includes("readme-gallery:end"));
  });
});
