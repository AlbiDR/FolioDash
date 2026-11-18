import { describe, expect, it } from "vitest";
import { COMMIT_TYPES, MAX_SUBJECT_LENGTH, subjectProblem } from "../../scripts/verify/project/commit-message-policy";

describe("commit subjects", () => {
  it.each(COMMIT_TYPES)("accepts the type %s", (type) => {
    expect(subjectProblem(`${type}: say what changed`)).toBeNull();
  });

  it("accepts a scope, a body and the subjects Git writes itself", () => {
    expect(subjectProblem("feat(import): read the second sheet\n\nLonger explanation.")).toBeNull();
    expect(subjectProblem("Merge branch 'main' into work")).toBeNull();
    expect(subjectProblem('Revert "feat: x"')).toBeNull();
    expect(subjectProblem("fixup! fix: y")).toBeNull();
  });

  it.each([
    ["", "the subject is empty"],
    ["Update the thing", "use"],
    ["feat:no space", "use"],
    ["feature: wrong word", "not a commit type"],
    ["fix: ends with a stop.", "full stop"],
    ["fix:  leading space is not a summary", "use"],
  ])("rejects %j", (subject, reason) => {
    expect(subjectProblem(subject)).toContain(reason);
  });

  it("rejects a subject over the length limit and counts only the first line", () => {
    expect(subjectProblem(`fix: ${"x".repeat(MAX_SUBJECT_LENGTH)}`)).toContain("characters");
    expect(subjectProblem(`fix: short\n${"x".repeat(500)}`)).toBeNull();
  });
});
