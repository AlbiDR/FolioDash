// Which agent aids a development machine should have, as pure functions: the pinned plugin and skill list, the
// commands that install it and the judgement of what is already there. The setup:agents entry runs the commands; the
// doctor entry only reports. The list lives in config/agent-tooling.json.

import type { Finding } from "./doctor-policy.ts";

export interface AgentMarketplace {
  readonly name: string;
  readonly source: string;
}

export interface AgentSkill {
  readonly name: string;
  readonly repository: string;
  readonly commit: string;
  readonly path: string;
}

export interface AgentToolingConfig {
  readonly marketplaces: readonly AgentMarketplace[];
  readonly plugins: readonly string[];
  readonly skills: readonly AgentSkill[];
}

/** Marker written into an installed skill folder, so a folder that is not ours is never overwritten. */
export const SKILL_MARKER = ".installed-by-setup-agents";

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Reads and checks the configuration; a malformed list fails loudly instead of installing something half known. */
export function parseConfig(text: string): AgentToolingConfig {
  const raw: unknown = JSON.parse(text);
  if (!isRecord(raw) || !Array.isArray(raw["marketplaces"]) || !Array.isArray(raw["plugins"]))
    throw new Error("agent-tooling.json needs marketplaces, plugins and skills lists");
  if (!Array.isArray(raw["skills"])) throw new Error("agent-tooling.json needs marketplaces, plugins and skills lists");
  const marketplaces = raw["marketplaces"].map((entry: unknown): AgentMarketplace => {
    if (!isRecord(entry) || !isText(entry["name"]) || !isText(entry["source"]))
      throw new Error("a marketplace needs a name and a source");
    return { name: entry["name"], source: entry["source"] };
  });
  const plugins = raw["plugins"].map((entry: unknown): string => {
    if (!isText(entry) || !entry.includes("@")) throw new Error("a plugin is written as name@marketplace");
    return entry;
  });
  const skills = raw["skills"].map((entry: unknown): AgentSkill => {
    if (
      !isRecord(entry) ||
      !isText(entry["name"]) ||
      !isText(entry["repository"]) ||
      !isText(entry["path"]) ||
      !isText(entry["commit"]) ||
      !/^[0-9a-f]{40}$/.test(entry["commit"])
    )
      throw new Error("a skill needs a name, a repository, a path and a full 40 character commit");
    return { name: entry["name"], repository: entry["repository"], commit: entry["commit"], path: entry["path"] };
  });
  return { marketplaces, plugins, skills };
}

/** The Claude Code commands, each as an argument list, that make the plugins available to every project of an account. */
export function claudeCommands(config: AgentToolingConfig): string[][] {
  return [
    ...config.marketplaces.map((marketplace) => ["plugin", "marketplace", "add", marketplace.source]),
    ...config.plugins.map((plugin) => ["plugin", "install", plugin, "--scope", "user"]),
  ];
}

/** The plugins that the output of `claude plugin list` does not show as installed. */
export function missingPlugins(listOutput: string, plugins: readonly string[]): string[] {
  return plugins.filter((plugin) => !listOutput.includes(plugin));
}

export function pluginFinding(listOutput: string | null, plugins: readonly string[]): Finding {
  if (listOutput === null)
    return { level: "info", name: "Agent plugins", detail: "the Claude Code command is not available here" };
  const missing = missingPlugins(listOutput, plugins);
  return missing.length === 0
    ? { level: "pass", name: "Agent plugins", detail: `${plugins.join(", ")} installed` }
    : { level: "info", name: "Agent plugins", detail: `${missing.join(", ")} not installed (npm run setup:agents)` };
}

export function skillFinding(skills: readonly AgentSkill[], installedCommit: (name: string) => string | null): Finding {
  const behind = skills.filter((skill) => installedCommit(skill.name) !== skill.commit).map((skill) => skill.name);
  return behind.length === 0
    ? { level: "pass", name: "Agent skills", detail: "installed at their pinned commits" }
    : {
        level: "info",
        name: "Agent skills",
        detail: `${behind.join(", ")} missing or not at the pin (npm run setup:agents)`,
      };
}
