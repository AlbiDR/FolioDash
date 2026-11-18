// Enforces the style contract (docs/architecture/cleanstack.md UXC-12). There is no record of exceptions: a
// duration, an easing or a colour must come from a token, and a layout property may animate only with a reasoned
// waiver written beside the declaration (see style-policy.ts).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { styleViolations } from "./style-policy.ts";

const files = [
  ...new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split(
      "\0",
    ),
  ),
]
  .filter((file) => file.startsWith("src/") && file.endsWith(".css") && existsSync(file))
  .map((path) => ({ path, text: readFileSync(path, "utf8") }));

const violations = styleViolations(files);
if (violations.length > 0) {
  console.error(
    `Style check failed: ${String(violations.length)} breaches of UXC-12. Use a token from src/interfaces/web/shared/tokens.css, animate transform and opacity, or explain a deliberate layout transition with /* style-allow layout-motion: reason */ above the declaration.\n${violations.join("\n")}`,
  );
  process.exit(1);
}
console.log(`Style check passed: ${String(files.length)} stylesheets, no breach of UXC-12.`);
