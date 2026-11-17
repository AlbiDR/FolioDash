// Enforces the coverage ratchet (docs/architecture/cleanstack.md STD-6). `npm test` writes the measurement;
// this compares it with config/coverage-baseline.json.
//   npm run verify:coverage             check
//   npm run verify:coverage -- --raise  raise floors to the measured values (a floor never falls)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import {
  coverageByArea,
  coverageProblems,
  raisedFloors,
  type AreaCoverage,
  type FileCoverage,
} from "./coverage-policy.ts";

const SUMMARY = "dist/coverage/coverage-summary.json";
const BASELINE = "config/coverage-baseline.json";

if (!existsSync(SUMMARY)) {
  console.error(`${SUMMARY} is missing: run npm test first, which measures coverage.`);
  process.exit(1);
}
const summary = JSON.parse(readFileSync(SUMMARY, "utf8")) as Record<string, FileCoverage>;
const files = Object.fromEntries(
  Object.entries(summary)
    .filter(([path]) => path !== "total")
    .map(([path, value]) => [path.slice(path.indexOf("/src/") + 1), value]),
);
const current = coverageByArea(files);
const floors = existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, AreaCoverage>) : {};

if (process.argv.includes("--raise")) {
  writeFileSync(BASELINE, `${JSON.stringify(raisedFloors(current, floors), null, 2)}\n`);
  console.log(`Coverage floors raised for ${String(Object.keys(current).length)} areas.`);
} else {
  const problems = coverageProblems(current, floors);
  if (problems.length > 0) {
    console.error(`Coverage check failed: ${String(problems.length)} problems.\n${problems.join("\n")}`);
    process.exit(1);
  }
  const summaryLine = ["src/core", "src/applications", "src/adapters"]
    .map((area) => `${area} ${String(current[area]?.lines)}%`)
    .join(", ");
  console.log(`Coverage check passed: no area below its floor (${summaryLine}).`);
}
