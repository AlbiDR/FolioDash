import { describe, expect, it } from "vitest";
import { sha256Hex } from "./Sha256";

describe("sha256Hex", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"],
    ["é€😀", "df9226927fd572c1ee66eec85de1bb139497614899f36e4e90474cb71f6ef9d0"],
    ["FolioDash ledger record", "3b99e03659ac6f90f8d2312035b02f10765d08f0d7ca31a2ffbd3855d7f1f181"],
  ])("matches the published value for %j", (text, expected) => {
    expect(sha256Hex(text)).toBe(expected);
  });

  it("handles messages around the padding boundaries", () => {
    // 55, 56 and 64 bytes straddle the single-block and two-block padding cases.
    const hashes = [55, 56, 63, 64, 65].map((length) => sha256Hex("a".repeat(length)));
    expect(new Set(hashes).size).toBe(5);
    expect(sha256Hex("a".repeat(55))).toBe("9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318");
    expect(sha256Hex("a".repeat(56))).toBe("b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a");
    expect(sha256Hex("a".repeat(64))).toBe("ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb");
  });
});
