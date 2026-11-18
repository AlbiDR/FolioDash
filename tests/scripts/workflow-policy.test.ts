import { describe, expect, it } from "vitest";
import { unpinnedActions } from "../../scripts/verify/project/workflow-policy";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";

describe("pinned actions", () => {
  it("accepts a full commit SHA with a trailing version comment, a nested action path and a local workflow", () => {
    const workflow = [
      `      - uses: actions/checkout@${SHA} # v7.0.1`,
      `        uses: github/codeql-action/init@${SHA}`,
      "    uses: ./.github/workflows/verify.yml",
    ].join("\n");
    expect(unpinnedActions(workflow)).toEqual([]);
  });

  it.each([
    "actions/checkout@v4",
    "actions/checkout@main",
    `actions/checkout@${SHA.slice(0, 39)}`,
    "actions/checkout",
    "docker://alpine:3.20",
  ])("reports %s", (reference) => {
    expect(unpinnedActions(`      - uses: ${reference}`)).toEqual([`line 1: ${reference}`]);
  });

  it("accepts a docker image pinned by digest", () => {
    expect(unpinnedActions(`uses: docker://alpine@sha256:${"a".repeat(64)}`)).toEqual([]);
  });

  it("gives the line number and ignores text that only mentions uses", () => {
    const workflow = "name: x\n# uses: actions/checkout@v4 in a comment\n      - uses: a/b@v1";
    expect(unpinnedActions(workflow)).toEqual(["line 3: a/b@v1"]);
  });
});
