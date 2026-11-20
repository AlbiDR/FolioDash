// Accessibility audit: axe-core run in the real renderer, on every screen of the signed-out synthetic demo, at a
// desktop and a phone width, in the light and the dark scheme. There is no record of exceptions: any violation fails.
// Automated rules find about a third of real accessibility problems; a pass is not a conformance claim.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { withLocalBrowser } from "../lib/local-browser.ts";
import { createSteps } from "./interactions/browser-steps.ts";

const ROUTES = [
  "overview",
  "months",
  "checkpoints",
  "expenses",
  "activity",
  "import",
  "history",
  "connection",
] as const;
const VIEWPORTS = [
  { name: "desktop", width: 1440 },
  { name: "phone", width: 390 },
] as const;
const SCHEMES = ["light", "dark"] as const;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface Violation {
  readonly id: string;
  readonly impact: string | null;
  readonly help: string;
  readonly nodes: readonly { readonly target: readonly unknown[] }[];
}

const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const found = new Map<string, { help: string; impact: string; nodes: number }>();

await withLocalBrowser(
  async (browser) => {
    const { call, evaluate } = browser;
    await call("DOM.enable");
    const steps = createSteps(browser);
    for (const route of ROUTES) {
      for (const viewport of VIEWPORTS) {
        await steps.visit(route, viewport.width);
        await steps.openDetails();
        for (const scheme of SCHEMES) {
          await call("Emulation.setEmulatedMedia", {
            features: [
              { name: "prefers-color-scheme", value: scheme },
              { name: "prefers-reduced-motion", value: "reduce" },
            ],
          });
          // Navigation replaces the page, so axe is injected again on each screen.
          await evaluate(`${axeSource};true`);
          const violations = (await evaluate(
            `axe.run(document,{runOnly:{type:"tag",values:${JSON.stringify(TAGS)}}}).then(r=>JSON.stringify(r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target}))}))))`,
          )) as string;
          for (const violation of JSON.parse(violations) as Violation[]) {
            found.set(`${violation.id} ${route} ${viewport.name} ${scheme}`, {
              help: violation.help,
              impact: violation.impact ?? "unknown",
              nodes: violation.nodes.length,
            });
          }
        }
      }
    }
  },
  Number(process.env["FOLIODASH_A11Y_PORT"] ?? 4196),
);

const output = resolve("dist/accessibility-audit");
mkdirSync(output, { recursive: true });
const screens = ROUTES.length * VIEWPORTS.length * SCHEMES.length;
writeFileSync(
  resolve(output, "report.json"),
  `${JSON.stringify(
    {
      screens,
      violations: Object.fromEntries(found),
      limits: ["Synthetic local Chromium only", "Automated rules only"],
    },
    null,
    2,
  )}\n`,
);
if (found.size > 0) {
  const detail = [...found].sort().map(([key, v]) => `${key} (${v.impact}, ${String(v.nodes)} elements: ${v.help})`);
  console.error(`Accessibility audit failed: ${String(found.size)} violations.\n${detail.join("\n")}`);
  process.exit(1);
}
console.log(`Accessibility audit passed: ${String(screens)} screens, no violation.`);
