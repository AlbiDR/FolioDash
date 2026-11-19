// Neutrality oracle for structural refactors: a reorganisation must not change a single built byte.
//   npm run verify:oracle -- write <file>   builds with a pinned stamp and records every built file's hash
//   npm run verify:oracle -- check <file>   builds the same way and fails when any built file differs
// The normal build stamps the git revision and the current minute into the bundle, which renames every
// content-hashed file, so the oracle pins that stamp. The snapshot holds file hashes only, never contents.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { digestDifferences, digestTree, parseDigest } from "./oracle-snapshot.ts";

// Only the build output: dist/ also collects audit reports and other files that are not product.
const OUTPUTS = ["web"] as const;
const [mode, file] = process.argv.slice(2);

if ((mode !== "write" && mode !== "check") || file === undefined) {
  console.error("Usage: npm run verify:oracle -- write|check <snapshot.json>");
  process.exit(2);
}

const env = { ...process.env, FOLIODASH_BUILD_STAMP: "oracle" };
execFileSync("npm", ["run", "--silent", "build"], { env, stdio: ["ignore", "ignore", "inherit"] });
const current = Object.fromEntries(
  OUTPUTS.flatMap((output) =>
    Object.entries(digestTree(`dist/${output}`)).map(([name, digest]) => [`${output}/${name}`, digest]),
  ),
);

if (mode === "write") {
  writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Oracle recorded: ${String(Object.keys(current).length)} built files.`);
} else {
  const recorded = parseDigest(JSON.parse(readFileSync(file, "utf8")));
  const differences = digestDifferences(recorded, current);
  if (differences.length > 0) {
    console.error(`Oracle check failed: ${String(differences.length)} built files differ.\n${differences.join("\n")}`);
    process.exit(1);
  }
  console.log(`Oracle check passed: ${String(Object.keys(current).length)} built files are byte-identical.`);
}
