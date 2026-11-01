import { describe, expect, it } from "vitest";
import type { EuroCents } from "../../../../core/Money";
import { MASK, type PrivacyStorage, amountText, maskNumbers, readPrivacyChoice, writePrivacyChoice } from "./privacyChoice";

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

  it("hides the number but keeps the currency symbol", () => {
    const hidden = amountText(cents, true);
    expect(hidden).toBe(`${MASK} €`);
    expect(hidden).not.toMatch(/\d/u);
  });

  it("keeps a sign, since the figure is still read as a gain or a loss, and hides every digit", () => {
    expect(amountText(cents, true, true)).toBe(`+${MASK} €`);
    expect(amountText(-5 as EuroCents, true)).toBe(`-${MASK} €`);
    for (const value of [0, 1, 99, 100, 123456, 987654321, -123456]) {
      expect(amountText(value as EuroCents, true, true)).not.toMatch(/\d/u);
    }
  });

  it("shows the amount when not hidden", () => {
    expect(amountText(cents, false)).toContain("1.234,56");
    expect(amountText(cents, false, true)).toContain("+");
  });
});

describe("maskNumbers", () => {
  it("replaces only the number in an already formatted amount", () => {
    expect(maskNumbers("25.743,52 €")).toBe(`${MASK} €`);
    expect(maskNumbers("-806,82 €")).toBe(`-${MASK} €`);
  });
});
