// Checks the documentation against the repository: links and heading anchors resolve, backticked repository
// paths exist, and every document is reachable from docs/README.md. See docs/architecture/naming-contract.md.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { renderMap } from "../docs/repository-map-render.ts";
import { linkProblems, orphanProblems, pathProblems, type DocumentFile } from "./docs-policy.ts";

const files = [
  ...new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split(
      "\0",
    ),
  ),
].filter((file) => file !== "" && existsSync(file));
const known = new Set(files);
const folders = new Set(
  files.flatMap((file) =>
    file
      .split("/")
      .slice(0, -1)
      .map((_, i, parts) => parts.slice(0, i + 1).join("/")),
  ),
);
const exists = (path: string): boolean => known.has(path) || folders.has(path);

const documents: DocumentFile[] = files
  .filter(
    (file) => file.endsWith(".md") && (file.startsWith("docs/") || !file.includes("/") || file.startsWith(".github/")),
  )
  .map((path) => ({ path, text: readFileSync(path, "utf8") }));

const MAP = "docs/architecture/repository-map.md";
const mapProblems =
  exists(MAP) && readFileSync(MAP, "utf8") === renderMap(files, (file) => readFileSync(file, "utf8"))
    ? []
    : [`${MAP}: missing or out of date; run npm run docs:map`];
const problems = [
  ...linkProblems(documents, exists),
  ...pathProblems(documents, exists),
  ...orphanProblems(documents),
  ...mapProblems,
];
if (problems.length > 0) {
  console.error(`Documentation check failed: ${String(problems.length)} problems.\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(
  `Documentation check passed: ${String(documents.length)} documents, every link and repository path resolves.`,
);
