// Production-renderer control discovery and state probes. Only the synthetic, signed-out demo is used.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { withLocalBrowser } from "../lib/local-browser.ts";
import { createSteps } from "./interactions/browser-steps.ts";
import { portfolioJourney } from "./interactions/portfolio-journey.ts";
import { rangeSelectorJourney } from "./interactions/range-selector-journey.ts";
import { disclosuresJourney } from "./interactions/disclosures-journey.ts";
import { holdingsJourney } from "./interactions/holdings-journey.ts";
import { expensesImportJourney } from "./interactions/expenses-import-journey.ts";
import { historyJourney } from "./interactions/history-journey.ts";
import { phoneJourney } from "./interactions/phone-journey.ts";
import { earlierHistoryJourney } from "./interactions/earlier-history-journey.ts";
import { counters, problems, report } from "./interactions/state.ts";
import { surveyStates } from "./interactions/survey.ts";

// The whole audit is these parts in this order, so a journey cannot exist outside a part. CI gives each part its own
// runner (scripts/audit/rendered.ts); with no argument every part runs in one browser. Within a part the order matters:
// the disclosures journey continues on the Portfolio that the range selector journey leaves open.
const parts = {
  portfolio: [portfolioJourney, rangeSelectorJourney, disclosuresJourney],
  records: [holdingsJourney, expensesImportJourney, historyJourney],
  phone: [phoneJourney, earlierHistoryJourney],
};
const [part] = process.argv.slice(2);
const journeys =
  part === undefined ? Object.values(parts).flat() : Object.entries(parts).find(([name]) => name === part)?.[1];
if (journeys === undefined)
  throw new Error(`Unknown interaction audit part: ${String(part)}. Use one of ${Object.keys(parts).join(", ")}.`);
const reportName = part === undefined ? "report.json" : `report.${part}.json`;

const output = resolve(process.env["FOLIODASH_AUDIT_OUTPUT"] ?? "dist/interaction-audit");
mkdirSync(output, { recursive: true });
execFileSync("npm", ["run", "build:fixtures"], { stdio: "ignore" });

await withLocalBrowser(
  async (browser) => {
    const { call } = browser;
    await call("DOM.enable");
    await call("CSS.enable");
    await call("Emulation.setFocusEmulationEnabled", { enabled: true });
    const context = { ...browser, ...createSteps(browser), ...surveyStates(browser) };
    for (const journey of journeys) await journey(context);
  },
  Number(process.env["FOLIODASH_AUDIT_PORT"] ?? 4197),
);

const { assertions, controlSamples } = counters;
writeFileSync(
  resolve(output, reportName),
  `${JSON.stringify({ assertions, controlSamples, states: report, problems, limits: ["Synthetic local Chromium only", "Pseudo-state sampling proves CSS response; actual range keys/clicks are tested separately", "Real Google, physical devices, other engines and screen readers not verified", "The fine-pointer card lift is asserted only where the renderer reports a fine pointer; elsewhere the absence of a lift is asserted"] }, null, 2)}\n`,
);
if (problems.length) throw new Error(`Interaction audit failed:\n${problems.join("\n")}`);
console.log(
  `Interaction audit ${part === undefined ? "passed" : `part ${part} passed`}: ${String(assertions)} journey assertions and ${String(controlSamples)} control samples across ${String(report.length)} rendered states. Report: dist/interaction-audit/${reportName}`,
);
