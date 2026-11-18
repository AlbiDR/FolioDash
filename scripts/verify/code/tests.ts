// Fails when a test file asserts nothing (docs/architecture/cleanstack.md STD-15).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { testsWithoutAssertions } from "./tests-policy.ts";

const files = [
  ...new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split(
      "\0",
    ),
  ),
]
  .filter((file) => /\.test\.tsx?$/.test(file) && existsSync(file))
  .map((path) => ({ path, text: readFileSync(path, "utf8") }));

const problems = testsWithoutAssertions(files);
if (problems.length > 0) {
  console.error(
    `Test check failed: ${String(problems.length)} files assert nothing (cleanstack.md STD-15).\n${problems.join("\n")}`,
  );
  process.exit(1);
}
console.log(`Test check passed: ${String(files.length)} test files, every one asserts something.`);
