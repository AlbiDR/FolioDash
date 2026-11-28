// Diagnoses this machine for working on FolioDash (docs/architecture/cleanstack.md STD-16): the Node release, the
// installed packages against their pins, and what the audits need. It reads and reports; it changes nothing.
//   npm run doctor

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { parseConfig, pluginFinding, SKILL_MARKER, skillFinding } from "./agent-tooling-policy.ts";
import { driftFindings, nodeFinding, type Finding, type Level } from "./doctor-policy.ts";

const CI_NODE_MAJOR = 22;
const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const run = (command: string, args: string[]): string | null => {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const installedVersion = (name: string): string | null => {
  const file = `node_modules/${name}/package.json`;
  return existsSync(file) ? ((JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version ?? null) : null;
};

const findings: Finding[] = [];
findings.push(nodeFinding(process.version, manifest.engines?.node ?? "", CI_NODE_MAJOR));

const npm = run("npm", ["--version"]);
findings.push(
  npm === null
    ? { level: "fail", name: "npm", detail: "is not available" }
    : { level: "pass", name: "npm", detail: npm },
);
const git = run("git", ["--version"]);
findings.push(
  git === null
    ? { level: "fail", name: "Git", detail: "is not available" }
    : { level: "pass", name: "Git", detail: git.replace(/^git version /, "") },
);
const branch = run("git", ["branch", "--show-current"]);
findings.push({
  level: "info",
  name: "Branch",
  detail: branch === null || branch === "" ? "detached or none" : branch,
});

if (existsSync("node_modules")) {
  const drift = driftFindings({ ...manifest.dependencies, ...manifest.devDependencies }, installedVersion);
  findings.push(
    ...(drift.length > 0
      ? drift
      : [{ level: "pass", name: "Packages", detail: "installed and matching their pins" } satisfies Finding]),
  );
} else findings.push({ level: "fail", name: "Packages", detail: "node_modules is missing; run npm run setup" });

const chrome =
  process.env["CHROME_PATH"] ??
  (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    ? "/Applications/Google Chrome.app"
    : run("which", ["google-chrome"]));
findings.push(
  chrome === null || chrome === ""
    ? { level: "warn", name: "Chrome", detail: "not found; the rendered audits need it (set CHROME_PATH)" }
    : { level: "pass", name: "Chrome", detail: `found for the rendered audits (${chrome})` },
);

const agentTooling = parseConfig(readFileSync("config/agent-tooling.json", "utf8"));
findings.push(pluginFinding(run("claude", ["plugin", "list"]), agentTooling.plugins));
findings.push(
  skillFinding(agentTooling.skills, (name) => {
    const marker = join(homedir(), ".agents", "skills", name, SKILL_MARKER);
    return existsSync(marker) ? readFileSync(marker, "utf8").trim() : null;
  }),
);

const hooksPath = run("git", ["rev-parse", "--git-path", "hooks/commit-msg"]);
const hooksOn = hooksPath !== null && existsSync(hooksPath) && readFileSync(hooksPath, "utf8").includes("setup:hooks");
findings.push({
  level: "info",
  name: "Git hooks",
  detail: hooksOn ? "installed" : "not installed (opt in with npm run setup:hooks)",
});
findings.push({
  level: "info",
  name: "Build output",
  detail: existsSync("dist/web") ? "dist/web present" : "none yet; npm run build creates it",
});

const label: Record<Level, string> = { pass: "ok  ", warn: "warn", fail: "FAIL", info: "info" };
const width = Math.max(14, ...findings.map((finding) => finding.name.length + 2));
for (const finding of findings) console.log(`${label[finding.level]}  ${finding.name.padEnd(width)}${finding.detail}`);
const failed = findings.filter((finding) => finding.level === "fail").length;
console.log(
  failed === 0 ? "\nReady to work. Next: npm run verify." : `\n${String(failed)} problems to fix before working.`,
);
process.exit(failed === 0 ? 0 : 1);
