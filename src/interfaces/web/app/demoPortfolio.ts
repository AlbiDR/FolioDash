import { type IsoDate, toIsoDate } from "../../../core/IsoDate";
import { parseIsin } from "../../../core/Isin";
import { type EuroCents, toEuroCents } from "../../../core/Money";
import type { OverviewFund, OverviewModel } from "../features/overview/OverviewModel";

/**
 * Invented portfolios for developing the screens. This stands in for the
 * application layer until real data flows; it holds no real names, amounts or
 * identifiers, and its arithmetic is demo scaffolding, not a financial rule.
 */
export type DemoVariant = "typical" | "single" | "many" | "different" | "empty";

export const DEMO_VARIANTS: readonly { readonly id: DemoVariant; readonly label: string }[] = [
  { id: "typical", label: "Typical, funds added and closed" },
  { id: "single", label: "One fund" },
  { id: "many", label: "Twelve funds" },
  { id: "different", label: "A completely different set" },
  { id: "empty", label: "No statements yet" },
];

interface DemoFundSpec {
  readonly name: string;
  readonly code: string;
  readonly startIndex: number;
  /** Last statement index the fund is held, or null while it is still held. */
  readonly endIndex: number | null;
  readonly startValue: number;
  readonly monthlyGrowth: number;
  readonly invested: number;
}

function cents(value: number): EuroCents {
  const result = toEuroCents(Math.round(value * 100));
  if (result === null) throw new Error("demo amount out of range");
  return result;
}

/** A valid ISIN built from a short code, so demo identifiers pass the same check as real ones. */
function demoIsin(code: string): string {
  const body = `XS${code.padEnd(9, "0")}`;
  for (let digit = 0; digit < 10; digit++) {
    const isin = parseIsin(`${body}${String(digit)}`);
    if (isin !== null) return isin;
  }
  throw new Error("no valid check digit");
}

function statementDates(count: number): IsoDate[] {
  return Array.from({ length: count }, (_, index) => {
    const date = toIsoDate(2025 + Math.floor(index / 12), (index % 12) + 1, 15);
    if (date === null) throw new Error("demo date out of range");
    return date;
  });
}

function build(specs: readonly DemoFundSpec[], count: number): OverviewModel {
  const dates = statementDates(count);
  const funds: OverviewFund[] = specs.map((spec) => ({
    isin: demoIsin(spec.code),
    name: spec.name,
    status: spec.endIndex === null ? "active" : "closed",
    values: dates.map((_, index) =>
      index < spec.startIndex || (spec.endIndex !== null && index > spec.endIndex)
        ? null
        : cents(spec.startValue * (1 + spec.monthlyGrowth) ** (index - spec.startIndex)),
    ),
  }));
  const totals = dates.map((_, index) => {
    let value = 0;
    let invested = 0;
    specs.forEach((spec, fundIndex) => {
      const held = funds[fundIndex]?.values[index];
      if (held !== null && held !== undefined) {
        value += held;
        invested += cents(spec.invested);
      }
    });
    const valueCents = toEuroCents(value);
    const investedCents = toEuroCents(invested);
    if (valueCents === null || investedCents === null) throw new Error("demo total out of range");
    return { value: valueCents, invested: investedCents };
  });
  return { dates, funds, totals };
}

const TYPICAL: readonly DemoFundSpec[] = [
  { name: "Demo Global Equity", code: "DEMOEQ", startIndex: 0, endIndex: null, startValue: 12000, monthlyGrowth: 0.008, invested: 11000 },
  { name: "Demo Euro Bonds", code: "DEMOBD", startIndex: 2, endIndex: null, startValue: 8000, monthlyGrowth: 0.003, invested: 8000 },
  { name: "Demo Tech Growth", code: "DEMOTC", startIndex: 0, endIndex: 5, startValue: 5000, monthlyGrowth: 0.015, invested: 4500 },
];

const DIFFERENT: readonly DemoFundSpec[] = [
  { name: "Example Property Income", code: "EXPRO", startIndex: 0, endIndex: null, startValue: 30000, monthlyGrowth: 0.004, invested: 28000 },
  { name: "Example Emerging Markets", code: "EXEMK", startIndex: 1, endIndex: 4, startValue: 9000, monthlyGrowth: -0.006, invested: 9500 },
  { name: "Example Short Duration", code: "EXSHD", startIndex: 4, endIndex: null, startValue: 15000, monthlyGrowth: 0.002, invested: 15000 },
  { name: "Example Climate Fund", code: "EXCLM", startIndex: 5, endIndex: null, startValue: 6000, monthlyGrowth: 0.011, invested: 5800 },
];

const MANY: readonly DemoFundSpec[] = Array.from({ length: 12 }, (_, index) => ({
  name: `Demo Fund ${String.fromCharCode(65 + index)}`,
  code: `DEMOF${String.fromCharCode(65 + index)}`,
  startIndex: index % 4,
  endIndex: index % 5 === 4 ? 6 : null,
  startValue: 3000 + index * 1500,
  monthlyGrowth: (index % 3) * 0.004 - 0.002,
  invested: 3000 + index * 1400,
}));

export function demoPortfolio(variant: DemoVariant): OverviewModel {
  switch (variant) {
    case "typical":
      return build(TYPICAL, 8);
    case "single":
      return build(TYPICAL.slice(0, 1), 6);
    case "many":
      return build(MANY, 10);
    case "different":
      return build(DIFFERENT, 9);
    case "empty":
      return { dates: [], funds: [], totals: [] };
  }
}

export function demoVariantFrom(search: string): DemoVariant {
  const requested = new URLSearchParams(search).get("demo");
  return DEMO_VARIANTS.find((entry) => entry.id === requested)?.id ?? "typical";
}
