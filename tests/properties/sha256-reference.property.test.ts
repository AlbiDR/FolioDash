import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/core/integrity/sha256";

describe("sha256Hex against an independent implementation", () => {
  const reference = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

  it("agrees with Node's crypto for every length around the 64-byte block", () => {
    for (let length = 0; length <= 200; length++) {
      const text = "x".repeat(length);
      expect(sha256Hex(text)).toBe(reference(text));
    }
  });

  it("encodes one, two, three and four byte UTF-8 characters", () => {
    for (const text of ["é", "€", "😀", "naïve - €5 😀 ok", "\u{10FFFF}"]) {
      expect(sha256Hex(text)).toBe(reference(text));
    }
  });
});
