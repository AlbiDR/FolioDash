import { describe, expect, it } from "vitest";
import { canonicalJson } from "./CanonicalJson";

describe("canonicalJson", () => {
  it("sorts keys at every depth, whatever order the object was built in", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("writes strings with escapes and keeps array order", () => {
    expect(canonicalJson(["b", "a", 'q"uote'])).toBe('["b","a","q\\"uote"]');
  });

  it("refuses values that are not plain JSON", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow();
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson(() => 1)).toThrow();
    expect(() => canonicalJson(1n)).toThrow();
  });
});
