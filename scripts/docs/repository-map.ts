// Writes docs/architecture/repository-map.md. `npm run verify:docs` checks the file is current.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { renderMap } from "./repository-map-render.ts";

const files = [
  ...new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split(
      "\0",
    ),
  ),
].filter((file) => file !== "" && existsSync(file));
writeFileSync(
  "docs/architecture/repository-map.md",
  renderMap(files, (file) => readFileSync(file, "utf8")),
);
console.log("Repository map written.");
