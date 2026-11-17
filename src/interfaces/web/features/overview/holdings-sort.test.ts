import { describe, expect, it } from "vitest";
import { describeSort, nextSort, sortHoldings } from "./holdings-sort";
import type { OverviewFund } from "./overview-model";
import { toEuroCents, type EuroCents } from "../../../../core/money";

function cents(value: number): EuroCents {
  const result = toEuroCents(value);
  if (result === null) throw new Error("Invalid synthetic amount");
  return result;
}

function fund(
  name: string,
  status: "active" | "closed",
  value: number | null,
  percent: number | null = null,
): OverviewFund {
  return {
    isin: name,
    name,
    status,
    values: [],
    netInvested: [],
    latest:
      value === null
        ? null
        : {
            value: cents(value),
            netInvested: cents(1000),
            gain: cents(value - 1000),
            gainPercent: percent,
            monthlyGain: null,
            monthlyGainPercent: null,
            share: value / 10000,
          },
  };
}

const funds = [
  fund("Beta", "active", 3000, 0.1),
  fund("Alpha", "active", 5000, 0.3),
  fund("Gamma", "active", 1000, null),
  fund("Old", "closed", 9000, 0.5),
  fund("Empty", "active", null),
];
const names = (sorted: readonly OverviewFund[]): string[] => sorted.map((entry) => entry.name);

describe("holdings sort", () => {
  it("keeps the incoming order without a sort, without changing the list", () => {
    const before = names(funds);
    expect(names(sortHoldings(funds, null))).toEqual(before);
    expect(names(funds)).toEqual(before);
  });

  it("sorts figures high to low and reverses them, keeping sold funds and missing figures last", () => {
    expect(names(sortHoldings(funds, { key: "value", direction: "desc" }))).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
      "Empty",
      "Old",
    ]);
    expect(names(sortHoldings(funds, { key: "value", direction: "asc" }))).toEqual([
      "Gamma",
      "Beta",
      "Alpha",
      "Empty",
      "Old",
    ]);
  });

  it("puts a fund without a percentage after those that have one in either direction", () => {
    expect(names(sortHoldings(funds, { key: "gainPercent", direction: "desc" }))).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
      "Empty",
      "Old",
    ]);
    expect(names(sortHoldings(funds, { key: "gainPercent", direction: "asc" }))).toEqual([
      "Beta",
      "Alpha",
      "Gamma",
      "Empty",
      "Old",
    ]);
  });

  it("sorts names alphabetically", () => {
    expect(names(sortHoldings(funds, { key: "name", direction: "asc" }))).toEqual([
      "Alpha",
      "Beta",
      "Empty",
      "Gamma",
      "Old",
    ]);
  });

  it("cycles a column through its first direction, the reverse and the default order", () => {
    const first = nextSort(null, "value");
    expect(first).toEqual({ key: "value", direction: "desc" });
    expect(nextSort(first, "value")).toEqual({ key: "value", direction: "asc" });
    expect(nextSort(nextSort(first, "value"), "value")).toBeNull();
    expect(nextSort(first, "gain")).toEqual({ key: "gain", direction: "desc" });
    expect(nextSort(null, "name")).toEqual({ key: "name", direction: "asc" });
  });

  it("describes each order in words", () => {
    expect(describeSort(null)).toBe("Default order");
    expect(describeSort({ key: "value", direction: "desc" })).toBe("Value, highest first");
    expect(describeSort({ key: "name", direction: "asc" })).toBe("Fund, A to Z");
  });
});
