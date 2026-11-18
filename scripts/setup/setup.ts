// Prepares a fresh clone (docs/architecture/cleanstack.md STD-16): checks the Node release, installs exactly what the
// lockfile says without running package scripts, and shows what to do next. It changes no setting and installs no
// Git hook; that is opt in (npm run setup:hooks).
//   npm run setup

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { nodeFinding } from "./doctor-policy.ts";

const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { engines?: { node?: string } };
const node = nodeFinding(process.version, manifest.engines?.node ?? "", 22);
if (node.level === "fail") {
  console.error(
    `${node.name}: ${node.detail}. Install a supported release (the engines field in package.json names the minimum), then run this again.`,
  );
  process.exit(1);
}
console.log(`${node.name}: ${node.detail}`);

console.log("Installing exactly what package-lock.json records, without running package scripts...");
const install = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { stdio: "inherit" });
if (install.status !== 0) {
  console.error("npm ci failed. Nothing else was changed.");
  process.exit(install.status ?? 1);
}
console.log(
  "\nDone. Next:\n  npm run doctor   check this machine\n  npm run verify   run every gate\n  npm run health   see where the repository stands",
);
