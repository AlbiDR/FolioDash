// Builds a local design artifact, outside the production application and public assets.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { STUDY_HTML } from "./portfolio-study/markup.ts";
import { STUDY_CSS } from "./portfolio-study/styles.ts";
import { STUDY_JS } from "./portfolio-study/interactions.ts";

export function buildPortfolioStudy(): string {
  const output = resolve("dist/portfolio-study-preview");
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, "index.html"), STUDY_HTML);
  writeFileSync(resolve(output, "portfolio-layout-study.css"), STUDY_CSS);
  writeFileSync(resolve(output, "portfolio-layout-study.js"), STUDY_JS);
  const notes = readFileSync("docs/design/portfolio-layout-study.md", "utf8")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  writeFileSync(
    resolve(output, "design-notes.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portfolio study notes</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="portfolio-layout-study.css"><body><main><h1>Design notes</h1><a class="text-link" href="index.html">Return to the study</a><pre class="design-notes">${notes}</pre></main></body></html>`,
  );
  for (const [source, target] of [
    ["src/interfaces/web/shared/tokens.css", "tokens.css"],
    ["src/interfaces/web/shared/ui/control-feedback.css", "control-feedback.css"],
    ["src/interfaces/web/public/icons/icon.svg", "icon.svg"],
  ] as const) {
    copyFileSync(source, resolve(output, target));
  }
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(`Study built: ${buildPortfolioStudy()}/index.html`);
