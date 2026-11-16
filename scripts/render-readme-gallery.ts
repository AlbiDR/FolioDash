// Rewrites the README gallery from scripts/readmeViews.ts. `--check` fails instead of writing.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { withGallery } from "./readmeViews.ts";

const path = resolve("README.md");
const current = readFileSync(path, "utf8");
const next = withGallery(current);
if (next === null) throw new Error("README.md has no readme-gallery markers.");
if (process.argv.includes("--check")) {
  if (next !== current) throw new Error("README gallery is out of date. Run npm run docs:readme and commit README.md.");
  console.log("README gallery matches the screenshot manifest.");
} else {
  writeFileSync(path, next);
  console.log(next === current ? "README gallery already current." : "README gallery updated.");
}
