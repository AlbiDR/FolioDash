// Enforces the style contract (docs/architecture/cleanstack.md UXC-12). There is no record of exceptions: a
// duration, an easing or a colour must come from a token, and a layout property may animate only with a reasoned
// waiver written beside the declaration (see style-policy.ts). It also keeps the motion layer's owner table complete:
// every stylesheet that carries motion, including a `<style>` block in a page, has one owner (see motion-owners.ts).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { MOTION_OWNER_RECORD, motionOwnerProblems } from "./motion-owners.ts";
import { styleViolations, TOKEN_FILES, tokenDrift } from "./style-policy.ts";

const tracked = [
  ...new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split(
      "\0",
    ),
  ),
].filter((file) => file.startsWith("src/") && existsSync(file));

const stylesheets = tracked
  .filter((file) => file.endsWith(".css"))
  .map((path) => ({ path, text: readFileSync(path, "utf8") }));
// A page's own `<style>` blocks are stylesheets too, held to UXC-12. A standalone page defines the tokens it uses in
// its own `:root`, and any it shares with the token file must keep the same value.
const pageStyles = tracked
  .filter((file) => file.endsWith(".html"))
  .map((path) => ({
    path,
    text: [...readFileSync(path, "utf8").matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((match) => match[1] ?? "")
      .join("\n"),
  }));

const tokenFile = stylesheets.find((file) => file.path === TOKEN_FILES[0]);
const breaches = [
  ...styleViolations([...stylesheets, ...pageStyles]),
  ...(tokenFile === undefined ? [] : tokenDrift(pageStyles, tokenFile)),
];
const unowned = motionOwnerProblems(
  [...stylesheets, ...pageStyles],
  readFileSync(MOTION_OWNER_RECORD, "utf8"),
  TOKEN_FILES,
);
if (breaches.length > 0) {
  console.error(
    `Style check failed: ${String(breaches.length)} breaches of UXC-12. Use a token from src/interfaces/web/shared/tokens.css, animate transform and opacity, keep the rebound easing for a selected chart mark, or explain a deliberate layout transition with /* style-allow layout-motion: reason */ above the declaration.\n${breaches.join("\n")}`,
  );
}
if (unowned.length > 0) {
  console.error(
    `Motion owner check failed: ${String(unowned.length)} problems. Every stylesheet that carries motion has exactly one row, with an owner, in the table of ${MOTION_OWNER_RECORD}, and the table lists nothing that no longer moves.\n${unowned.join("\n")}`,
  );
}
if (breaches.length > 0 || unowned.length > 0) process.exit(1);
console.log(
  `Style check passed: ${String(stylesheets.length)} stylesheets, no breach of UXC-12; every motion stylesheet and page style has one owner.`,
);
