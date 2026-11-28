import { execFileSync } from "node:child_process";
import process from "node:process";

// GitHub starts at most five macOS jobs at once for this repository, so a sixth suite would wait for a free runner
// instead of running alongside the others. The suites are balanced by the times measured on 2026-11-26
// (docs/operations/github-actions.md#gate-timing-2026-11-26); rebalance them when an audit grows or is added.
const MACOS_RUNNERS = 5;

const suites = {
  "interactions-portfolio": ["audit:interactions -- portfolio"],
  "interactions-records-and-reload": ["audit:interactions -- records", "audit:reload-stability", "audit:page-overflow"],
  "interactions-phone-and-choreography": ["audit:interactions -- phone", "audit:choreography"],
  "accessibility-and-polish": ["audit:accessibility", "audit:portfolio-polish", "test:browser"],
  "reduced-motion-and-recovery": [
    "audit:reduced-motion",
    "audit:backfill-recovery",
    "audit:expense-recovery",
    "audit:expense-restore",
    "audit:sale-closure",
    "audit:account-outcomes",
    "audit:overview-signals",
    "audit:checkpoints",
  ],
};

const [suite] = process.argv.slice(2);
if (suite === "--matrix") {
  if (Object.keys(suites).length > MACOS_RUNNERS)
    throw new Error(`Rendered audits need at most ${String(MACOS_RUNNERS)} suites, one per concurrent macOS runner.`);
  console.log(JSON.stringify({ suite: Object.keys(suites) }));
} else {
  const audits =
    suite === undefined ? Object.values(suites).flat() : Object.entries(suites).find(([name]) => name === suite)?.[1];
  if (audits === undefined) throw new Error(`Unknown rendered audit suite: ${String(suite)}`);
  for (const audit of audits) execFileSync("npm", ["run", ...audit.split(" ")], { stdio: "inherit" });
}
