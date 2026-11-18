// Enforces the style contract as a ratchet (docs/architecture/cleanstack.md UXC-1, STD-6). Existing exceptions are
// recorded in config/style-baseline.json and tolerated; a new one fails, and so does a recorded one that is fixed.
//   npm run verify:style             check
//   npm run verify:style -- --shrink remove recorded exceptions that are fixed (it never adds one)
//   npm run verify:style -- --init   record the current exceptions once, when no record exists

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { ratchet } from "./structure-policy.ts";
import { styleViolations } from "./style-policy.ts";

const BASELINE = "config/style-baseline.json";
const files = [
  ...new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split(
      "\0",
    ),
  ),
]
  .filter((file) => file.startsWith("src/") && file.endsWith(".css") && existsSync(file))
  .map((path) => ({ path, text: readFileSync(path, "utf8") }));
const current = styleViolations(files);
const write = (violations: readonly string[]): void => {
  writeFileSync(BASELINE, `${JSON.stringify(violations, null, 2)}\n`);
};

if (process.argv.includes("--init")) {
  if (existsSync(BASELINE)) throw new Error(`${BASELINE} already exists; the record may only shrink.`);
  write(current);
  console.log(`Style record created: ${String(current.length)} exceptions recorded.`);
} else {
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as string[];
  const { added, fixed } = ratchet(current, baseline);
  if (process.argv.includes("--shrink")) {
    write(baseline.filter((violation) => !fixed.includes(violation)));
    console.log(`Style record shrunk: ${String(fixed.length)} fixed exceptions removed.`);
  } else if (added.length > 0) {
    console.error(
      `Style check failed: ${String(added.length)} new exceptions to UXC-1. Use a token from src/interfaces/web/shared/tokens.css, or animate transform and opacity.\n${added.join("\n")}`,
    );
    process.exit(1);
  } else if (fixed.length > 0) {
    console.error(
      `Style record is stale: ${String(fixed.length)} recorded exceptions are fixed. Run npm run verify:style -- --shrink.\n${fixed.join("\n")}`,
    );
    process.exit(1);
  } else {
    console.log(
      `Style check passed: ${String(files.length)} stylesheets, no new exception; ${String(baseline.length)} recorded exceptions remain to be fixed.`,
    );
  }
}
