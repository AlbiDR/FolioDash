import { describe, expect, it } from "vitest";
import { testsWithoutAssertions } from "../../scripts/verify/code/tests-policy";

const file = (path: string, text: string) => ({ path, text });

describe("tests that assert nothing", () => {
  it.each([
    ['import { it, expect } from "vitest";\nit("a", () => { expect(1).toBe(1); });'],
    ["it('a', () => { assert.equal(1, 1); });"],
    ["it('a', () => { assert(true); });"],
    ["it('a', () => { fc.assert(fc.property(fc.integer(), () => true)); });"],
  ])("accepts a file with an assertion: %s", (text) => {
    expect(testsWithoutAssertions([file("src/x/a.test.ts", text)])).toEqual([]);
  });

  it("reports a test file that only prints", () => {
    const text = 'import { it } from "vitest";\nit("explore", () => { console.log(1 + 1); });';
    expect(testsWithoutAssertions([file("tests/x/explore.test.ts", text)])).toEqual([
      "tests/x/explore.test.ts: contains no assertion, so it can never fail",
    ]);
  });

  it("is not fooled by an assertion that only appears in a comment", () => {
    const text = "// expect(x).toBe(1) would go here\n/* assert.equal(1, 1) */\nit('a', () => { console.log(1); });";
    expect(testsWithoutAssertions([file("src/x/a.test.ts", text)])).toHaveLength(1);
  });

  it("looks only at test files", () => {
    expect(testsWithoutAssertions([file("src/x/support.ts", "export const x = 1;")])).toEqual([]);
  });
});
