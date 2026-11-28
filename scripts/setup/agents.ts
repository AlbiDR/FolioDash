// Installs the agent aids listed in config/agent-tooling.json on this machine, opt in like the Git hooks: the Claude
// Code plugins for each account, and the same skills as plain skill folders for any agent that reads ~/.agents/skills.
// Skills come from the pinned upstream commit, are fetched into a fresh empty folder and only copied, never run, and a
// folder that is not ours is never overwritten. Nothing is added to the repository.
//   npm run setup:agents
//   npm run setup:agents -- --claude-config ~/second-account-folder --claude-config ~/third-account-folder
//   npm run setup:agents -- --skills-dir ~/.agents/skills

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { claudeCommands, parseConfig, SKILL_MARKER, type AgentSkill } from "./agent-tooling-policy.ts";

const config = parseConfig(readFileSync("config/agent-tooling.json", "utf8"));
const argumentsList = process.argv.slice(2);
const valuesOf = (flag: string): string[] =>
  argumentsList.flatMap((argument, index) => (argument === flag ? [argumentsList[index + 1] ?? ""] : []));
const claudeConfigs = valuesOf("--claude-config").map((path) => resolve(path.replace(/^~(?=\/)/, homedir())));
const skillsDirectory = resolve((valuesOf("--skills-dir")[0] ?? "~/.agents/skills").replace(/^~(?=\/)/, homedir()));
let failed = false;

const claudeAvailable = spawnSync("claude", ["--version"], { stdio: "ignore" }).status === 0;
if (!claudeAvailable) console.log("Claude Code: the command is not available here, so no plugin was installed.");
else {
  for (const configDirectory of claudeConfigs.length > 0 ? claudeConfigs : [null]) {
    const environment = configDirectory === null ? process.env : { ...process.env, CLAUDE_CONFIG_DIR: configDirectory };
    console.log(`Claude Code plugins for ${configDirectory ?? "the default account"}:`);
    for (const args of claudeCommands(config)) {
      const result = spawnSync("claude", args, { env: environment, encoding: "utf8" });
      const output = `${result.stdout}${result.stderr}`.trim().split("\n").pop() ?? "";
      if (result.status !== 0 && !/already/i.test(output)) failed = true;
      console.log(
        `  ${result.status === 0 || /already/i.test(output) ? "ok  " : "FAIL"} claude ${args.join(" ")}  ${output}`,
      );
    }
  }
}

const installedCommit = (target: string): string | null => {
  const marker = join(target, SKILL_MARKER);
  return existsSync(marker) ? readFileSync(marker, "utf8").trim() : null;
};

const installSkill = (skill: AgentSkill): void => {
  const target = join(skillsDirectory, skill.name);
  if (existsSync(target) && installedCommit(target) === null) {
    console.error(`  Left alone, because it is not ours: ${target}`);
    failed = true;
    return;
  }
  if (installedCommit(target) === skill.commit) {
    console.log(`  ok   ${skill.name} already at ${skill.commit.slice(0, 7)}`);
    return;
  }
  const scratch = mkdtempSync(join(tmpdir(), "foliodash-skill-"));
  try {
    const git = (...args: string[]): void => {
      execFileSync("git", ["-C", scratch, ...args], { stdio: "ignore" });
    };
    git("init", "-q");
    git("fetch", "-q", "--depth", "1", skill.repository, skill.commit);
    git("checkout", "-q", "FETCH_HEAD");
    rmSync(target, { recursive: true, force: true });
    cpSync(join(scratch, skill.path), target, { recursive: true });
    writeFileSync(join(target, SKILL_MARKER), `${skill.commit}\n`);
    console.log(`  ok   ${skill.name} installed at ${skill.commit.slice(0, 7)} in ${target}`);
  } catch (error) {
    console.error(`  FAIL ${skill.name}: ${error instanceof Error ? error.message : String(error)}`);
    failed = true;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

console.log(`Agent skills in ${skillsDirectory}:`);
for (const skill of config.skills) installSkill(skill);
process.exit(failed ? 1 : 0);
