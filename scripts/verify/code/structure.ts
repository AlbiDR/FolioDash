// Enforces the naming and size contract (docs/architecture/naming-contract.md). The record of tolerated violations
// is empty, so the check is plainly blocking (docs/architecture/cleanstack.md STD-6): any violation fails.
//   npm run verify:structure

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { structureViolations, type CodeFile, type StructureOptions } from "./structure-policy.ts";

const CONFIG = "config/structure.json";

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
if (current.length > 0) {
  console.error(
    `Structure check failed: ${String(current.length)} violations of docs/architecture/naming-contract.md.\n${current.join("\n")}`,
  );
  process.exit(1);
}
console.log(`Structure check passed: ${String(files.length)} code files, no violation.`);
