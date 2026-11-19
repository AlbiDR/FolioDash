import { describe, expect, it } from "vitest";
import { unpinnedActions, workflowNameViolations } from "../../scripts/verify/project/workflow-policy";

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

describe("workflow names", () => {
  it("accepts a file named for its display name, including a proper noun", () => {
    expect(workflowNameViolations("codeql.yml", "name: CodeQL\n")).toEqual([]);
    expect(workflowNameViolations("deploy-apps-script.yml", "name: Deploy Apps Script\n")).toEqual([]);
    expect(
      workflowNameViolations("deploy-site.yml", "name: Deploy site\n\njobs:\n  release:\n    name: Verify\n"),
    ).toEqual([]);
  });

  it("reports a file name that does not match, ignoring job names", () => {
    expect(workflowNameViolations("deploy-pages.yml", "name: Deploy site\n")).toEqual([
      'deploy-pages.yml: file name must be deploy-site.yml to match display name "Deploy site"',
    ]);
  });

  it("reports a display name without a leading capital or with double spaces", () => {
    expect(workflowNameViolations("verify.yml", "name: verify\n")).toEqual([
      'verify.yml: display name "verify" must start with a capital and use single spaces',
    ]);
    expect(workflowNameViolations("a-b.yml", "name: A  b\n")[0]).toContain("single spaces");
  });

  it("reports a workflow with no top-level name", () => {
    expect(workflowNameViolations("verify.yml", "jobs:\n  build:\n    name: Verify\n")).toEqual([
      "verify.yml: no top-level display name",
    ]);
  });
});
