import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/core/integrity/sha256";

const nodeHash = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

describe("SHA-256 in plain code", () => {
  it("matches the platform implementation for text of any content", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 300 }), (text) => {
        expect(sha256Hex(text)).toBe(nodeHash(text));
      }),
    );
  });

  it("matches it across every padding boundary, where block-size mistakes hide", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 300 }), fc.constantFrom("a", "é", "€", "\u{1F4B6}"), (length, unit) => {
        const text = unit.repeat(length);
        expect(sha256Hex(text)).toBe(nodeHash(text));
      }),
    );
  });
});
