import { describe, expect, it } from "vitest";
import { parseIsin } from "./Isin";

describe("parseIsin", () => {
  // Public ISO 6166 example identifiers, not holdings.
  it.each(["US0378331005", "AU0000XVGZA3", "GB0002634946"])("accepts %s", (isin) => {
    expect(parseIsin(isin)).toBe(isin);
  });

  it("returns the canonical form for padded or lower-case input", () => {
    expect(parseIsin("  us0378331005 ")).toBe("US0378331005");
  });

  it("rejects a wrong check digit", () => {
    expect(parseIsin("US0378331006")).toBeNull();
  });

  it.each(["", "US037833100", "US03783310055", "1S0378331005", "US0378331O05 ", "US-378331005"])(
    "rejects malformed input %j",
    (value) => {
      expect(parseIsin(value)).toBeNull();
    },
  );
});
