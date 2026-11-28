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
  readonly nodes: readonly { readonly target: readonly unknown[]; readonly summary: string }[];
}

const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
// The selector is a fixed literal written straight into the page script, so no value is escaped or interpolated into code.
const WEEK_ROW_COUNT = `document.querySelectorAll(".expense-week-list button").length`;
/** Presses one week row once it is enabled and reports whether it is now the selected day. */
function selectWeekRow(index: number): string {
  return `(()=>{const b=document.querySelectorAll(".expense-week-list button")[${String(Math.trunc(index))}];if(!b||b.disabled)return false;if(b.getAttribute("aria-pressed")!=="true")b.click();return b.getAttribute("aria-pressed")==="true"})()`;
}
let screens = 0;
const found = new Map<string, { help: string; impact: string; nodes: number; elements: string[] }>();

await withLocalBrowser(
  async (browser) => {
    const { call, evaluate } = browser;
    await call("DOM.enable");
    const steps = createSteps(browser);
    for (const route of ROUTES) {
      for (const viewport of VIEWPORTS) {
        await steps.visit(route, viewport.width);
        await steps.openDetails();
        // Expenses opens on today, so which week row is selected depends on the calendar: none at a weekend, a
        // different one each weekday. Selecting every row in turn audits each day state on the selected background
        // whatever the date of the run, so a weekend pass can no longer hide a weekday failure.
        const selections =
          route === "expenses"
            ? Array.from({ length: Number(await evaluate(WEEK_ROW_COUNT)) }, (_, index) => index)
            : [undefined];
        if (route === "expenses" && selections.length === 0) throw new Error("Expenses: no week rows to select.");
        for (const selection of selections) {
          if (selection !== undefined) {
            await browser.waitFor(
              async () => (await evaluate(selectWeekRow(selection))) === true,
              `expenses: select week row ${String(selection + 1)}`,
            );
          }
          const screen = `${route} ${viewport.name}${selection === undefined ? "" : ` day ${String(selection + 1)}`}`;
          for (const scheme of SCHEMES) {
            await call("Emulation.setEmulatedMedia", {
              features: [
                { name: "prefers-color-scheme", value: scheme },
                { name: "prefers-reduced-motion", value: "reduce" },
              ],
            });
            screens++;
            // Navigation replaces the page, so axe is injected again on each screen.
            await evaluate(`${axeSource};true`);
            const violations = (await evaluate(
              `axe.run(document,{runOnly:{type:"tag",values:${JSON.stringify(TAGS)}}}).then(r=>JSON.stringify(r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,summary:(n.failureSummary||"").replace(/\\s+/g," ").trim()}))}))))`,
            )) as string;
            for (const violation of JSON.parse(violations) as Violation[]) {
              found.set(`${violation.id} ${screen} ${scheme}`, {
                help: violation.help,
                impact: violation.impact ?? "unknown",
                nodes: violation.nodes.length,
                // The selector and axe's own explanation (for contrast: the colours and ratio) make a CI failure
                // diagnosable from the log alone.
                elements: violation.nodes.map((node) => `${node.target.map(String).join(" ")}: ${node.summary}`),
              });
            }
          }
        }
      }
    }
  },
  Number(process.env["FOLIODASH_A11Y_PORT"] ?? 4196),
);

const output = resolve("dist/accessibility-audit");
mkdirSync(output, { recursive: true });
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
  const detail = [...found]
    .sort()
    .map(
      ([key, v]) =>
        `${key} (${v.impact}, ${String(v.nodes)} elements: ${v.help})${v.elements.map((element) => `\n  ${element}`).join("")}`,
    );
  console.error(`Accessibility audit failed: ${String(found.size)} violations.\n${detail.join("\n")}`);
  process.exit(1);
}
console.log(`Accessibility audit passed: ${String(screens)} screens, no violation.`);
