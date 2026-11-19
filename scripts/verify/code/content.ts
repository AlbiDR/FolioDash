// Scans tracked files, and the built output when it exists, for credentials and financial identifiers
// (docs/architecture/cleanstack.md PRV-1, GAT-5). Matched text is never printed, only where it was found.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { contentProblems, type ContentFile } from "./content-policy.ts";

const BUILT = ["dist/web"];

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const tracked = [
  ...new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split(
      "\0",
    ),
  ),
].filter((file) => file !== "" && existsSync(file));
const built = BUILT.filter(existsSync).flatMap(filesUnder);
const read = (path: string): ContentFile | null => {
  const bytes = readFileSync(path);
  // A NUL byte marks a binary file, which a text scan cannot judge.
  return bytes.includes(0) ? null : { path, text: bytes.toString("utf8") };
};
const files = [...tracked, ...built].map(read).filter((file): file is ContentFile => file !== null);

const problems = contentProblems(files);
if (problems.length > 0) {
  console.error(
    `Content check failed: ${String(problems.length)} findings. Remove the value; if it was ever pushed, rotate it.\n${problems.join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `Content check passed: ${String(tracked.length)} tracked files${built.length > 0 ? ` and ${String(built.length)} built files` : " (no build output present)"}, no credential or financial identifier found.`,
);
