import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { architectureProblems, pathProblems } from "./repositoryPolicy.ts";

// Include new, non-ignored files so local verification also checks unstaged additions.
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter((file) => file.length > 0 && existsSync(file));
const sources = files.filter((file) => /\.(?:tsx?|css)$/.test(file)).map((file) => ({ file, text: readFileSync(file, "utf8") }));
const problems = [...pathProblems(files), ...architectureProblems(sources)];
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Repository policy passed: ${String(files.length)} paths; dependency directions and cycles checked.`);
