import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claudeCommands, missingPlugins, parseConfig, pluginFinding, skillFinding } from "./agent-tooling-policy.ts";

const commit = "a".repeat(40);
const text = JSON.stringify({
  marketplaces: [{ name: "market", source: "owner/repo" }],
  plugins: ["tool@market"],
  skills: [{ name: "tool", repository: "https://example.test/repo.git", commit, path: "skills/tool" }],
});

void describe("agent tooling list", () => {
  void it("reads a well formed list", () => {
    const config = parseConfig(text);
    assert.equal(config.plugins[0], "tool@market");
    assert.equal(config.skills[0]?.commit, commit);
  });

  void it("rejects a skill that is not pinned to a full commit", () => {
    const loose = text.replace(commit, "main");
    assert.throws(() => parseConfig(loose), /40 character commit/);
  });

  void it("rejects a plugin without a marketplace and a list that is missing", () => {
    assert.throws(() => parseConfig(text.replace("tool@market", "tool")), /name@marketplace/);
    assert.throws(() => parseConfig("{}"), /needs marketplaces/);
    assert.throws(() => parseConfig(text.replace('"owner/repo"', "7")), /name and a source/);
  });

  void it("installs the marketplaces first and the plugins for the whole account", () => {
    assert.deepEqual(claudeCommands(parseConfig(text)), [
      ["plugin", "marketplace", "add", "owner/repo"],
      ["plugin", "install", "tool@market", "--scope", "user"],
    ]);
  });

  void it("names what the plugin list does not show", () => {
    assert.deepEqual(missingPlugins("tool@market  enabled", ["tool@market", "other@market"]), ["other@market"]);
  });
});

void describe("agent tooling findings", () => {
  const plugins = ["tool@market"];
  void it("never fails a machine, only informs", () => {
    assert.equal(pluginFinding(null, plugins).level, "info");
    assert.equal(pluginFinding("nothing", plugins).level, "info");
    assert.equal(pluginFinding("tool@market", plugins).level, "pass");
  });

  void it("compares the installed commit with the pin", () => {
    const skills = parseConfig(text).skills;
    assert.equal(skillFinding(skills, () => commit).level, "pass");
    assert.match(skillFinding(skills, () => null).detail, /tool missing/);
    assert.equal(skillFinding(skills, () => "b".repeat(40)).level, "info");
  });
});
