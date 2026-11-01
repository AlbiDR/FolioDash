import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/** Which commit this build was made from, with "-dirty" if it holds changes that are not committed. A build with no git around says so. */
function buildStamp(): string {
  let revision = "unknown";
  try {
    revision = execFileSync("git", ["describe", "--always", "--dirty", "--abbrev=7"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // Built outside a git checkout.
  }
  return `${revision} - built ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const root = fileURLToPath(new URL("../src/interfaces/web", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("../dist/web", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
  define: { __APP_BUILD__: JSON.stringify(buildStamp()) },
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
});
