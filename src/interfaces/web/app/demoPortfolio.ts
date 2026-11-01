import { type FundCommand, type StatementInput, applyImport, planImport } from "../../../core/ImportPlan";
import { type IsoDate, toIsoDate } from "../../../core/IsoDate";
import { parseIsin } from "../../../core/Isin";
import { EMPTY_LEDGER, type LedgerState } from "../../../core/Ledger";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "../../../core/Money";
import type { OverviewModel } from "../features/overview/OverviewModel";
import { overviewFromLedger } from "./overviewFromLedger";

/**
 * Invented portfolios for developing the screens. Each one is recorded through
 * the real ledger rules and shown through the real metrics, so the demo uses the
 * same path as a user's data. It holds no real names, amounts or identifiers.
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
  /** Last statement the fund is listed on, or null while it is still held. It is closed on the next one. */
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

function valueAt(spec: DemoFundSpec, index: number): number {
  return spec.startValue * (1 + spec.monthlyGrowth) ** (index - spec.startIndex);
}

function ledgerFor(specs: readonly DemoFundSpec[], count: number): LedgerState {
  let ledger = EMPTY_LEDGER;
  statementDates(count).forEach((date, index) => {
    const listed = specs.filter(
      (spec) => index >= spec.startIndex && (spec.endIndex === null || index <= spec.endIndex),
    );
    const funds = listed.map((spec) => ({ isin: demoIsin(spec.code), name: spec.name, marketValue: cents(valueAt(spec, index)) }));
    const subtotal = toEuroCents(funds.reduce((sum, fund) => sum + fund.marketValue, 0));
    if (subtotal === null) throw new Error("demo subtotal out of range");
    const statement: StatementInput = { funds, fundsSubtotal: subtotal };

    const commands = planImport(ledger, statement).map((row): FundCommand => {
      const spec = specs.find((entry) => demoIsin(entry.code) === row.isin);
      const invested = cents(spec?.invested ?? 0);
      const base = { isin: row.isin, moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" };
      switch (row.detected) {
        case "Opening":
          return { ...base, action: "Start", openingNetInvested: invested };
        case "New":
          return { ...base, action: "Add", moneyIn: invested };
        case "Missing": {
          // Sold at its last value.
          const last = spec === undefined || spec.endIndex === null ? 0 : valueAt(spec, spec.endIndex);
          return { ...base, action: "Close", moneyOut: cents(last) };
        }
        case "Closed":
          return { ...base, action: "Closed" };
        case "Reappeared":
          return { ...base, action: "Reopen" };
        case "Held":
          return { ...base, action: "Keep" };
      }
    });
    const result = applyImport(ledger, statement, date, commands, `demo-${String(index)}`);
    if (!result.ok) throw new Error(`demo ledger rejected: ${JSON.stringify(result.issues)}`);
    ledger = result.state;
  });
  return ledger;
}

const TYPICAL: readonly DemoFundSpec[] = [
  { name: "Demo Global Equity", code: "DEMOEQ", startIndex: 0, endIndex: null, startValue: 12000, monthlyGrowth: 0.008, invested: 11000 },
  { name: "Demo Euro Bonds", code: "DEMOBD", startIndex: 2, endIndex: null, startValue: 8000, monthlyGrowth: 0.003, invested: 8000 },
  { name: "Demo Tech Growth", code: "DEMOTC", startIndex: 0, endIndex: 4, startValue: 5000, monthlyGrowth: 0.015, invested: 4500 },
];

const DIFFERENT: readonly DemoFundSpec[] = [
  { name: "Example Property Income", code: "EXPRO", startIndex: 0, endIndex: null, startValue: 30000, monthlyGrowth: 0.004, invested: 28000 },
  { name: "Example Emerging Markets", code: "EXEMK", startIndex: 1, endIndex: 3, startValue: 9000, monthlyGrowth: -0.006, invested: 9500 },
  { name: "Example Short Duration", code: "EXSHD", startIndex: 4, endIndex: null, startValue: 15000, monthlyGrowth: 0.002, invested: 15000 },
  { name: "Example Climate Fund", code: "EXCLM", startIndex: 5, endIndex: null, startValue: 6000, monthlyGrowth: 0.011, invested: 5800 },
];

const MANY: readonly DemoFundSpec[] = Array.from({ length: 12 }, (_, index) => ({
  name: `Demo Fund ${String.fromCharCode(65 + index)}`,
  code: `DEMOF${String.fromCharCode(65 + index)}`,
  startIndex: index % 4,
  endIndex: index % 5 === 4 ? 5 : null,
  startValue: 3000 + index * 1500,
  monthlyGrowth: (index % 3) * 0.004 - 0.002,
  invested: 3000 + index * 1400,
}));

/** The invented ledger behind a demo variant, built by the real ledger rules. */
export function demoLedger(variant: DemoVariant): LedgerState {
  switch (variant) {
    case "typical":
      return ledgerFor(TYPICAL, 8);
    case "single":
      return ledgerFor(TYPICAL.slice(0, 1), 6);
    case "many":
      return ledgerFor(MANY, 10);
    case "different":
      return ledgerFor(DIFFERENT, 9);
    case "empty":
      return EMPTY_LEDGER;
  }
}

export function demoPortfolio(variant: DemoVariant): OverviewModel {
  return overviewFromLedger(demoLedger(variant), "demo");
}

export function demoVariantFrom(search: string): DemoVariant {
  const requested = new URLSearchParams(search).get("demo");
  return DEMO_VARIANTS.find((entry) => entry.id === requested)?.id ?? "typical";
}
