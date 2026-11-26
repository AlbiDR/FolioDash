import { execFileSync } from "node:child_process";
import process from "node:process";

const suites = {
  interactions: ["audit:interactions"],
  recovery: [
    "audit:backfill-recovery",
    "audit:expense-recovery",
    "audit:expense-restore",
    "audit:sale-closure",
    "audit:account-outcomes",
    "audit:overview-signals",
    "audit:checkpoints",
    "audit:reload-stability",
  ],
  accessibility: ["audit:accessibility"],
  motion: ["audit:reduced-motion", "audit:choreography"],
  portfolio: ["audit:portfolio-polish"],
};

const [suite] = process.argv.slice(2);
if (suite === "--matrix") {
  console.log(JSON.stringify({ suite: Object.keys(suites) }));
} else {
  const audits =
    suite === undefined ? Object.values(suites).flat() : Object.entries(suites).find(([name]) => name === suite)?.[1];
  if (audits === undefined) throw new Error(`Unknown rendered audit suite: ${String(suite)}`);
  for (const audit of audits) execFileSync("npm", ["run", audit], { stdio: "inherit" });
}
