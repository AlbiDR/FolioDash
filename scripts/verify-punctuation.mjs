// Fails when any tracked text file contains an em dash or an en dash. Use a plain
// hyphen, a colon, a comma or a full stop instead. There is no exception: quoted text
// is rewritten with a hyphen too.
// Dependency-free: Node built-ins only, so it runs before any tooling decision (FD-008).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { findDashes } from "./punctuation.mjs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\0")
  .filter((file) => file.length > 0);

const problems = [];
let scanned = 0;
for (const file of files) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    continue; // listed by git but not on disk, for example a file removed in the working tree
  }
  if (bytes.includes(0)) continue; // binary
  scanned += 1;
  for (const { line, column, name } of findDashes(bytes.toString("utf8"))) {
    problems.push(`${file}:${String(line)}:${String(column)}: ${name}`);
  }
}

if (problems.length > 0) {
  console.error(`Punctuation policy failed: ${String(problems.length)} forbidden dash${problems.length === 1 ? "" : "es"} found. Use a plain hyphen instead.`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Punctuation policy passed: no em or en dash in ${String(scanned)} tracked text files.`);
