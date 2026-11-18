import { describe, expect, it } from "vitest";
import {
  ruleDefinitions,
  ruleProblems,
  sectionNumbers,
  type DocumentFile,
} from "../../scripts/verify/project/docs-policy";

const adr = (text: string): DocumentFile => ({ path: "docs/architecture/cleanstack.md", text });
const other = (text: string): DocumentFile => ({ path: "docs/operations/x.md", text });

const GOOD = [
  "## 3. Principles",
  "1. **PRN-1 First:** text",
  "2. **PRN-2 Second:** text",
  "## 4. Architecture",
  "### 4.1 Layers",
  "- **ARC-1** a rule",
  "- **ARC-2** another rule",
].join("\n");

describe("rule definitions", () => {
  it("reads IDs from the start of numbered and bulleted list items, in any order", () => {
    const defs = ruleDefinitions(adr(GOOD));
    expect(defs.get("PRN")).toEqual([1, 2]);
    expect(defs.get("ARC")).toEqual([1, 2]);
  });
  it("ignores IDs in running text and in fenced code", () => {
    expect([...ruleDefinitions(adr("See **PRN-9** here.\n```\n- **PRN-1** fenced\n```\n")).keys()]).toEqual([]);
  });
});

describe("section numbers", () => {
  it("collects numbered headings of every level and no unnumbered ones", () => {
    expect([...sectionNumbers(adr(GOOD + "\n## Unnumbered\n"))].sort()).toEqual(["3", "4", "4.1"]);
  });
});

describe("rule problems", () => {
  it("accepts contiguous IDs and resolving citations", () => {
    const doc = other("See PRN-2 and ARC-1. The layers are in CleanStack section 4.1 and sections 3 and 4.");
    expect(ruleProblems(adr(GOOD), [adr(GOOD), doc])).toEqual([]);
  });
  it("reports a duplicated ID and a skipped ID", () => {
    const text = "- **ARC-1** a\n- **ARC-1** b\n- **ARC-3** c\n";
    const problems = ruleProblems(adr(text), [adr(text)]);
    expect(problems).toContain("docs/architecture/cleanstack.md: rule ARC-1 is defined twice");
    expect(problems.some((p) => p.includes("ARC-2 is missing"))).toBe(true);
  });
  it("reports a cited rule that does not exist, but not a look-alike prefix the ADR never defines", () => {
    const doc = other("Uses PRN-7 and ISO-8601 and FD-013.");
    expect(ruleProblems(adr(GOOD), [doc])).toEqual(["docs/operations/x.md:1: cites unknown rule PRN-7"]);
  });
  it("reports a CleanStack section that does not exist, in another document and in the ADR itself", () => {
    const doc = other("See [CleanStack](cleanstack.md) section 9.\nAnd CleanStack sections 3 and 8.");
    const problems = ruleProblems(adr(GOOD + "\nOne more in section 12.\n"), [
      adr(GOOD + "\nOne more in section 12.\n"),
      doc,
    ]);
    expect(problems).toEqual([
      "docs/architecture/cleanstack.md:8: cites CleanStack section 12, which does not exist",
      "docs/operations/x.md:1: cites CleanStack section 9, which does not exist",
      "docs/operations/x.md:2: cites CleanStack section 8, which does not exist",
    ]);
  });
});
