// Accessibility audit: axe-core run in the real renderer, on every screen of the signed-out synthetic demo, at a
// desktop and a phone width, in the light and the dark scheme. Findings are held by a ratchet
// (config/accessibility-baseline.json): a new violation fails, a fixed one must leave the record.
//   npm run audit:accessibility             check
//   npm run audit:accessibility -- --shrink remove recorded violations that are fixed (never adds one)
//   npm run audit:accessibility -- --init   record the current violations once, when no record exists
// Automated rules find about a third of real accessibility problems; a pass is not a conformance claim.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { withLocalBrowser } from "../lib/local-browser.ts";
import { createSteps } from "./interactions/browser-steps.ts";
import { ratchet } from "../verify/structure-policy.ts";

const ROUTES = ["overview", "months", "checkpoints", "expenses", "import", "history", "connection"] as const;
const VIEWPORTS = [
  { name: "desktop", width: 1440 },
  { name: "phone", width: 390 },
] as const;
const SCHEMES = ["light", "dark"] as const;
const BASELINE = "config/accessibility-baseline.json";
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

const current = [...found.keys()].sort();
const output = resolve("dist/accessibility-audit");
mkdirSync(output, { recursive: true });
writeFileSync(
  resolve(output, "report.json"),
  `${JSON.stringify(
    {
      screens: ROUTES.length * VIEWPORTS.length * SCHEMES.length,
      violations: Object.fromEntries(found),
      limits: ["Synthetic local Chromium only", "Automated rules only"],
    },
    null,
    2,
  )}\n`,
);
const write = (violations: readonly string[]): void => {
  writeFileSync(BASELINE, `${JSON.stringify(violations, null, 2)}\n`);
};
const screens = ROUTES.length * VIEWPORTS.length * SCHEMES.length;

if (process.argv.includes("--init")) {
  if (existsSync(BASELINE)) throw new Error(`${BASELINE} already exists; the record may only shrink.`);
  write(current);
  console.log(`Accessibility record created: ${String(current.length)} violations across ${String(screens)} screens.`);
} else {
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as string[];
  const { added, fixed } = ratchet(current, baseline);
  if (process.argv.includes("--shrink")) {
    write(baseline.filter((violation) => !fixed.includes(violation)));
    console.log(`Accessibility record shrunk: ${String(fixed.length)} fixed violations removed.`);
  } else if (added.length > 0) {
    const detail = added.map(
      (key) =>
        `${key} (${found.get(key)?.impact ?? "?"}, ${String(found.get(key)?.nodes ?? 0)} elements: ${found.get(key)?.help ?? ""})`,
    );
    console.error(`Accessibility audit failed: ${String(added.length)} new violations.\n${detail.join("\n")}`);
    process.exit(1);
  } else if (fixed.length > 0) {
    console.error(
      `Accessibility record is stale: ${String(fixed.length)} recorded violations are fixed. Run npm run audit:accessibility -- --shrink.\n${fixed.join("\n")}`,
    );
    process.exit(1);
  } else {
    console.log(
      `Accessibility audit passed: ${String(screens)} screens, no new violation; ${String(baseline.length)} recorded violations remain to be fixed.`,
    );
  }
}
