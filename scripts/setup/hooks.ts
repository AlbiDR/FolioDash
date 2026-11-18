// Installs, or with --uninstall removes, the local Git hooks: the commit-subject convention (STD-4) and the fast
// static checks before a commit. Opt in per clone; a hook that is not ours is never overwritten.
//   npm run setup:hooks
//   npm run setup:hooks -- --uninstall

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { HOOK_MARKER, hookScripts } from "./hook-scripts.ts";

const directory = resolve(execFileSync("git", ["rev-parse", "--git-path", "hooks"], { encoding: "utf8" }).trim());
const uninstall = process.argv.includes("--uninstall");
const ours = (path: string): boolean => readFileSync(path, "utf8").includes(HOOK_MARKER);
const skipped: string[] = [];
let changed = 0;

mkdirSync(directory, { recursive: true });
for (const [name, content] of Object.entries(hookScripts())) {
  const path = resolve(directory, name);
  if (existsSync(path) && !ours(path)) {
    skipped.push(name);
    continue;
  }
  if (uninstall) {
    if (existsSync(path)) {
      rmSync(path);
      changed++;
    }
    continue;
  }
  writeFileSync(path, content);
  chmodSync(path, 0o755);
  changed++;
}

if (skipped.length > 0) {
  console.error(`Left alone, because it is not ours: ${skipped.join(", ")} in ${directory}`);
  process.exitCode = 1;
}
console.log(`${uninstall ? "Removed" : "Installed"} ${String(changed)} hooks in ${directory}.`);
