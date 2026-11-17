import { describe, expect, it } from "vitest";
import {
  headingSlugs,
  linkProblems,
  orphanProblems,
  pathProblems,
  slug,
  type DocumentFile,
} from "../../scripts/verify/docs-policy";

const present = new Set(["docs/README.md", "docs/architecture/a.md", "docs/operations/b.md", "src/core/money.ts"]);
const folders = new Set(["docs", "docs/architecture", "docs/operations", "src", "src/core"]);
const exists = (path: string): boolean => present.has(path) || folders.has(path);
const doc = (path: string, text: string): DocumentFile => ({ path, text });

describe("heading anchors", () => {
  it("follows the GitHub rule: lower case, punctuation dropped, spaces to hyphens", () => {
    expect(slug("4.3 Lean root contract")).toBe("43-lean-root-contract");
    expect(slug("Why `checkpoint` is reserved")).toBe("why-checkpoint-is-reserved");
  });
  it("numbers a repeated heading the way GitHub does and ignores headings inside code fences", () => {
    const slugs = headingSlugs("# A\n## Same\n## Same\n```\n# not a heading\n```\n");
    expect([...slugs]).toEqual(["a", "same", "same-1"]);
  });
});

describe("links", () => {
  const a = doc("docs/architecture/a.md", "# Top\n## Rules\n");
  it("accepts a resolving link and a resolving anchor", () => {
    const b = doc(
      "docs/operations/b.md",
      "See [a](../architecture/a.md#rules) and [source](../../src/core/money.ts#L12).",
    );
    expect(linkProblems([a, b], exists)).toEqual([]);
  });
  it("reports a missing file, a missing anchor and a folder that does not exist", () => {
    const b = doc("docs/operations/b.md", "[x](../architecture/gone.md) [y](../architecture/a.md#nope) [z](../nope/)");
    const problems = linkProblems([a, b], exists);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("missing docs/architecture/gone.md");
    expect(problems[1]).toContain("no heading #nope");
  });
  it("ignores web links, links in code spans and links in code fences", () => {
    const b = doc("docs/operations/b.md", "[w](https://example.com) `[c](gone.md)`\n```\n[f](gone.md)\n```\n");
    expect(linkProblems([b], exists)).toEqual([]);
  });
});

describe("repository paths in prose", () => {
  it("accepts existing files and folders and skips globs and placeholders", () => {
    const text = "`src/core/money.ts` `src/core/` `src/**/*.ts` `src/<layer>/x.ts` `private/decision-register.md`";
    expect(pathProblems([doc("docs/README.md", text)], exists)).toEqual([]);
  });
  it("reports a path that no longer exists", () => {
    const problems = pathProblems([doc("docs/README.md", "Rules live in `src/core/gone.ts`.")], exists);
    expect(problems).toEqual(["docs/README.md:1: names missing path src/core/gone.ts"]);
  });
});

describe("reachability", () => {
  it("reports a document the index does not link, and a missing index", () => {
    const index = doc("docs/README.md", "[a](architecture/a.md)");
    const orphan = doc("docs/operations/b.md", "");
    expect(orphanProblems([index, doc("docs/architecture/a.md", ""), orphan])).toEqual([
      "docs/operations/b.md: not linked from docs/README.md",
    ]);
    expect(orphanProblems([orphan])).toEqual(["docs/README.md: the documentation index is missing"]);
  });
});
