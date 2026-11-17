import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json";

/** The same value with every object's keys inserted in the opposite order. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reverseKeys(child)]),
    );
  }
  return value;
}

describe("canonical JSON", () => {
  it("does not depend on the order in which an object's keys were inserted", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(canonicalJson(reverseKeys(value))).toBe(canonicalJson(value));
      }),
    );
  });

  it("is a fixed point: canonicalising its own output changes nothing", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const once = canonicalJson(value);
        expect(canonicalJson(JSON.parse(once))).toBe(once);
      }),
    );
  });

  it("gives equal text only to values that are equal once their keys are sorted", () => {
    const sorted = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sorted);
      if (typeof value === "object" && value !== null) {
        return Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([key, child]) => [key, sorted(child)]),
        );
      }
      return value;
    };
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (left, right) => {
        if (canonicalJson(left) === canonicalJson(right)) {
          expect(JSON.stringify(sorted(left))).toBe(JSON.stringify(sorted(right)));
        }
      }),
    );
  });
});
