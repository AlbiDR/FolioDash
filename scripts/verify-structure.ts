// Enforces the naming and size contract (docs/architecture/naming-contract.md) as a ratchet.
// Existing violations are recorded in config/structure-baseline.json and tolerated; a new violation fails, and so
// does a recorded violation that no longer exists, so the record can only shrink.
//   npm run verify:structure             check
//   npm run verify:structure -- --shrink remove recorded violations that are fixed (it never adds one)
//   npm run verify:structure -- --init   record the current violations once, when no record exists

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { ratchet, structureViolations, type CodeFile, type StructureOptions } from "./structure-policy.ts";

const CONFIG = "config/structure.json";
const BASELINE = "config/structure-baseline.json";

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string")) {
    throw new Error(`${name} must be an array of strings.`);
  }
  return value;
}

function readOptions(): StructureOptions {
  const raw: unknown = JSON.parse(readFileSync(CONFIG, "utf8"));
  if (typeof raw !== "object" || raw === null) throw new Error(`${CONFIG} must be an object.`);
  const record = raw as Record<string, unknown>;
  const number = (key: string): number => {
    const value = record[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new Error(`${CONFIG}: ${key} must be a positive integer.`);
    }
    return value;
  };
  return {
    codeExtensions: strings(record["codeExtensions"], "codeExtensions"),
    namedAreas: strings(record["namedAreas"], "namedAreas"),
    maxLinesPerFile: number("maxLinesPerFile"),
    maxCodeFilesPerDirectory: number("maxCodeFilesPerDirectory"),
  };
}

const options = readOptions();
const paths = [
  ...new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split(
      "\0",
    ),
  ),
].filter(
  (file) =>
    existsSync(file) &&
    options.namedAreas.some((area) => file.startsWith(`${area}/`)) &&
    options.codeExtensions.some((extension) => file.endsWith(extension)),
);
const files: CodeFile[] = paths.map((path) => ({
  path,
  lines: readFileSync(path, "utf8").split("\n").length - 1,
}));
const current = structureViolations(files, options);
const write = (violations: readonly string[]): void => {
  writeFileSync(BASELINE, `${JSON.stringify(violations, null, 2)}\n`);
};

if (process.argv.includes("--init")) {
  if (existsSync(BASELINE)) throw new Error(`${BASELINE} already exists; the record may only shrink.`);
  write(current);
  console.log(`Structure record created: ${String(current.length)} violations recorded.`);
} else {
  const baseline = strings(JSON.parse(readFileSync(BASELINE, "utf8")), BASELINE);
  const { added, fixed } = ratchet(current, baseline);
  if (process.argv.includes("--shrink")) {
    write(baseline.filter((violation) => !fixed.includes(violation)));
    console.log(`Structure record shrunk: ${String(fixed.length)} fixed violations removed.`);
  } else if (added.length > 0) {
    console.error(
      `Structure check failed: ${String(added.length)} new violations of docs/architecture/naming-contract.md.\n${added.join("\n")}`,
    );
    process.exit(1);
  } else if (fixed.length > 0) {
    console.error(
      `Structure record is stale: ${String(fixed.length)} recorded violations are fixed. Run npm run verify:structure -- --shrink.\n${fixed.join("\n")}`,
    );
    process.exit(1);
  } else {
    console.log(
      `Structure check passed: no new violations; ${String(baseline.length)} recorded violations remain to be fixed.`,
    );
  }
}
