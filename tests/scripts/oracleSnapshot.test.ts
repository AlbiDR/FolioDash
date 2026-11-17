import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { digestDifferences, digestTree, parseDigest } from "../../scripts/oracleSnapshot";

const temporary: string[] = [];
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

function builtTree(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "foliodash-oracle-"));
  temporary.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

describe("digestTree", () => {
  it("keys nested files by their slash-separated path in sorted order and skips source maps", () => {
    const root = builtTree({ "web/b.js": "b", "web/assets/a.js": "a", "web/a.js.map": "{}" });
    expect(Object.keys(digestTree(root))).toEqual(["web/assets/a.js", "web/b.js"]);
  });
  it("changes only the digest of a file whose bytes changed", () => {
    const before = digestTree(builtTree({ "x.js": "1", "y.js": "2" }));
    const after = digestTree(builtTree({ "x.js": "1", "y.js": "3" }));
    expect(digestDifferences(before, after)).toEqual(["changed: y.js"]);
  });
});

describe("digestDifferences", () => {
  it("is empty for identical output", () => {
    expect(digestDifferences({ "a.js": "1" }, { "a.js": "1" })).toEqual([]);
  });
  it("reports added, removed and changed files in name order", () => {
    expect(digestDifferences({ "b.js": "1", "c.js": "1" }, { "a.js": "1", "b.js": "2" })).toEqual([
      "added: a.js",
      "changed: b.js",
      "removed: c.js",
    ]);
  });
});

describe("parseDigest", () => {
  it("accepts a digest object", () => {
    expect(parseDigest({ "a.js": "abc" })).toEqual({ "a.js": "abc" });
  });
  it.each([null, [], "text", { "a.js": 1 }])("rejects a corrupt snapshot %j", (value) => {
    expect(() => parseDigest(value)).toThrow();
  });
});
