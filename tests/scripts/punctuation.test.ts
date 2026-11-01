import { describe, expect, it } from "vitest";
import { findDashes } from "../../scripts/punctuation.mjs";

// The forbidden characters are built from code points so this file never contains them.
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);

describe("findDashes", () => {
  it("finds nothing in text that uses plain hyphens, minus signs and other punctuation", () => {
    expect(findDashes("a-b, c: d; (e) 1-2 − • ...")).toEqual([]);
  });

  it("finds an em dash and an en dash, with their line and column", () => {
    expect(findDashes(`one${EM}two\nthree ${EN} four`)).toEqual([
      { line: 1, column: 4, name: "em dash" },
      { line: 2, column: 7, name: "en dash" },
    ]);
  });

  it("finds every one, in reading order, even several on one line", () => {
    const found = findDashes(`${EN}${EM}${EN}\nx`);
    expect(found.map((dash) => [dash.line, dash.column, dash.name])).toEqual([
      [1, 1, "en dash"],
      [1, 2, "em dash"],
      [1, 3, "en dash"],
    ]);
  });

  it("does not mistake a hyphen-minus, a minus sign or a figure dash for the forbidden ones", () => {
    expect(findDashes("-−‒‐‑")).toEqual([]);
  });
});
