// Checks commit subjects against the convention (docs/architecture/cleanstack.md STD-4).
//   node scripts/verify/project/commit-message.ts <message-file>   what a commit-msg hook passes
//   node scripts/verify/project/commit-message.ts --range <range>  every commit in a range such as origin/main..HEAD
// Early history is not rewritten, so a range is checked only when asked for.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { subjectProblem } from "./commit-message-policy.ts";

const [first, second] = process.argv.slice(2);
const failures: string[] = [];

if (first === "--range" && second !== undefined) {
  const log = execFileSync("git", ["log", "--format=%h%x09%s", second], { encoding: "utf8" });
  for (const line of log.split("\n").filter(Boolean)) {
    const [hash = "", subject = ""] = line.split("\t");
    const problem = subjectProblem(subject);
    if (problem !== null) failures.push(`${hash} ${subject}: ${problem}`);
  }
} else if (first !== undefined && first !== "--range") {
  const problem = subjectProblem(readFileSync(first, "utf8"));
  if (problem !== null) failures.push(problem);
} else {
  console.error("Usage: node scripts/verify/project/commit-message.ts <message-file> | --range <range>");
  process.exit(2);
}

if (failures.length > 0) {
  console.error(`Commit subject does not follow the convention (cleanstack.md STD-4):\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("Commit subjects follow the convention.");
