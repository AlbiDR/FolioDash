// The repository health scorecard (docs/architecture/cleanstack.md STD-16), measured from tracked files alone.
//   npm run health                          this checkout
//   npm run health -- --json                the same, as JSON
//   npm run health -- --compare <directory> this checkout beside another checkout, such as an older tag
// It reports; the checks that fail a build are the ones in `npm run verify`.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { healthMetrics, type Health } from "../lib/health-metrics.ts";

function measure(root: string): Health {
  const files = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\0")
    .filter((file) => file !== "" && existsSync(join(root, file)));
  return healthMetrics(files, (path) => {
    const full = join(root, path);
    return existsSync(full) ? readFileSync(full, "utf8") : null;
  });
}

interface Row {
  readonly label: string;
  readonly value: (health: Health) => number;
  /** Which direction is better, or null when the number is only information. */
  readonly better: "lower" | "higher" | null;
}

const ROWS: readonly Row[] = [
  { label: "Root entries", value: (h) => h.rootEntries, better: "lower" },
  { label: "Code files", value: (h) => h.code.files, better: null },
  { label: "Code lines", value: (h) => h.code.lines, better: null },
  { label: "Largest code file (lines)", value: (h) => h.code.largest.lines, better: "lower" },
  { label: "95th percentile file (lines)", value: (h) => h.code.percentile95, better: "lower" },
  { label: "Files over 400 lines", value: (h) => h.code.over400, better: "lower" },
  { label: "Folders over 20 code files", value: (h) => h.code.crowdedFolders, better: "lower" },
  { label: "Most code files in one folder", value: (h) => h.code.largestFolder.files, better: "lower" },
  { label: "Test files", value: (h) => h.tests.files, better: "higher" },
  { label: "Documents", value: (h) => h.docs.documents, better: null },
  { label: "Addressable rules (IDs)", value: (h) => h.docs.ruleIds, better: "higher" },
  { label: "Production dependencies", value: (h) => h.dependencies.production, better: "lower" },
  { label: "Development dependencies", value: (h) => h.dependencies.development, better: null },
  { label: "npm scripts", value: (h) => h.checks.npmScripts, better: null },
  { label: "Steps in npm run verify", value: (h) => h.checks.verifySteps, better: "higher" },
];

const args = process.argv.slice(2);
const compareIndex = args.indexOf("--compare");
const before =
  compareIndex >= 0 && args[compareIndex + 1] !== undefined ? measure(resolve(args[compareIndex + 1] ?? "")) : null;
const now = measure(process.cwd());

if (args.includes("--json")) {
  console.log(JSON.stringify(before === null ? now : { before, now }, null, 2));
} else {
  const width = Math.max(...ROWS.map((row) => row.label.length));
  const cell = (value: number): string => value.toLocaleString("en-GB").padStart(9);
  const mark = (row: Row, from: number, to: number): string => {
    if (from === to || row.better === null) return "";
    return to < from === (row.better === "lower") ? "  better" : "  worse";
  };
  console.log(before === null ? "Health" : `${"".padEnd(width)}${"before".padStart(10)}${"now".padStart(10)}`);
  for (const row of ROWS) {
    const label = row.label.padEnd(width);
    if (before === null) console.log(`${label}${cell(row.value(now))}`);
    else
      console.log(
        `${label}${cell(row.value(before))}${cell(row.value(now))}${mark(row, row.value(before), row.value(now))}`,
      );
  }
  console.log(`\nLargest code file: ${now.code.largest.path} (${String(now.code.largest.lines)} lines)`);
  console.log(
    `Most crowded folder: ${now.code.largestFolder.path} (${String(now.code.largestFolder.files)} code files)`,
  );
}
