import { describe, expect, it } from "vitest";
import type { EuroCents } from "../../../../core/Money";
import { MASK, type PrivacyStorage, amountText, readPrivacyChoice, writePrivacyChoice } from "./privacyChoice";

const memory = (): PrivacyStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
};
const blocked: () => PrivacyStorage = () => {
  throw new Error("blocked");
};

describe("privacy choice", () => {
  it("hides amounts until the person chooses to show them", () => {
    const store = memory();
    expect(readPrivacyChoice(() => store)).toBe(true);
    writePrivacyChoice(() => store, false);
    expect(readPrivacyChoice(() => store)).toBe(false);
    writePrivacyChoice(() => store, true);
    expect(readPrivacyChoice(() => store)).toBe(true);
  });

  it("stays hidden, and does not fail, when storage is blocked", () => {
    expect(readPrivacyChoice(blocked)).toBe(true);
    expect(() => {
      writePrivacyChoice(blocked, false);
    }).not.toThrow();
  });

  it("stores only the choice, never an amount", () => {
    const store = memory();
    writePrivacyChoice(() => store, false);
    expect([...store.data.values()]).toEqual(["shown"]);
  });
});

describe("amountText", () => {
  const cents = 123456 as EuroCents;
  it("masks an amount without leaving any digit of it, signed or not", () => {
    for (const signed of [false, true]) {
      const hidden = amountText(cents, true, signed);
      expect(hidden).toBe(MASK);
      expect(hidden).not.toMatch(/\d/u);
    }
  });

  it("shows the amount when not hidden", () => {
    expect(amountText(cents, false)).toContain("1.234,56");
    expect(amountText(cents, false, true)).toContain("+");
  });
});
