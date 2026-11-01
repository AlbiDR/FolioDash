import { type IsoDate, monthSerial } from "./IsoDate";
import type { HoldingStatus, LedgerState, Snapshot } from "./Ledger";
import { type EuroCents, ZERO_CENTS, addCents, subtractCents } from "./Money";

/**
 * Reporting policy "legacy-parity-v1" (decision FD-007, still open).
 *
 * These are the definitions of the existing Sheets project, kept and labelled so
 * results can be compared with it. They are not a statement that these are the
 * right definitions, and a different method needs its own decision:
 *
 * - Net invested is cumulative cash in minus cash out. A closed fund keeps its
 *   result, so realised gains stay in the totals.
 * - Gain is value minus net invested. A percentage needs a positive denominator
 *   and is otherwise unavailable, never zero.
 * - Month on month needs the previous statement to fall in the immediately
 *   preceding calendar month. Its percentage assumes cash moved before the return.
 * - Year to date is the change in gain since the January statement of the same
 *   year. It is not a return since 1 January.
 * - Year on year is the change in gain against the statement of the same
 *   calendar month one year earlier.
 *
 * None of these is annualised, and none is a time-weighted or money-weighted
 * return. Percentages that depend on when cash moved are estimates.
 */
export const REPORTING_POLICY = "legacy-parity-v1";

export interface FundMetrics {
  readonly value: EuroCents;
  readonly netInvested: EuroCents;
  readonly status: HoldingStatus;
  readonly gain: EuroCents;
  readonly gainPercent: number | null;
  readonly monthlyGain: EuroCents | null;
  readonly monthlyGainPercent: number | null;
  /** Share of the funds subtotal, 0 to 1. */
  readonly share: number | null;
}

export interface StatementMetrics {
  readonly date: IsoDate;
  readonly total: EuroCents;
  readonly invested: EuroCents;
  readonly gain: EuroCents;
  readonly gainPercent: number | null;
  /** True when the previous statement is in the immediately preceding calendar month. */
  readonly consecutive: boolean;
  /** Change in gain since the previous statement, across any gap. */
  readonly periodGain: EuroCents | null;
  readonly monthlyGain: EuroCents | null;
  readonly monthlyGainPercent: number | null;
  readonly yearToDateGain: EuroCents | null;
  readonly yearToDatePercent: number | null;
  readonly yearOverYearGain: EuroCents | null;
  readonly yearOverYearPercent: number | null;
  /** True when any cash moved or any cash figure is reconstructed, so percentages are estimates. */
  readonly estimated: boolean;
  readonly funds: Readonly<Record<string, FundMetrics>>;
}

function exact(amount: EuroCents | null): EuroCents {
  if (amount === null) throw new Error("A ledger amount is outside the supported range.");
  return amount;
}

function sum(values: readonly EuroCents[]): EuroCents {
  let total = ZERO_CENTS;
  for (const value of values) total = exact(addCents(total, value));
  return total;
}

/** An amount over a denominator, or null when the denominator is not positive. */
function ratio(amount: EuroCents | null, denominator: number): number | null {
  if (amount === null || !(denominator > 0)) return null;
  const result = amount / denominator;
  return Number.isFinite(result) ? result : null;
}

function netInvestedOf(snapshot: Snapshot): EuroCents {
  return sum(Object.values(snapshot.holdings).map((holding) => holding.netInvested));
}

/** Computes the reporting figures for every recorded statement. Pure and deterministic. */
export function computeMetrics(state: LedgerState): StatementMetrics[] {
  const results: StatementMetrics[] = [];
  const invested: EuroCents[] = [];
  const gains: EuroCents[] = [];

  state.snapshots.forEach((snapshot, index) => {
    const previous = index > 0 ? state.snapshots[index - 1] : undefined;
    const total = snapshot.fundsSubtotal;
    const netInvested = netInvestedOf(snapshot);
    const gain = exact(subtractCents(total, netInvested));
    invested.push(netInvested);
    gains.push(gain);

    const month = monthSerial(snapshot.date);
    const consecutive = previous !== undefined && monthSerial(previous.date) === month - 1;
    const previousInvested = index > 0 ? invested[index - 1] : undefined;
    const previousGain = index > 0 ? gains[index - 1] : undefined;
    const periodGain =
      previous !== undefined && previousGain !== undefined ? exact(subtractCents(gain, previousGain)) : null;
    const monthlyGain = consecutive ? periodGain : null;
    const monthlyDenominator =
      previous !== undefined && previousInvested !== undefined
        ? previous.fundsSubtotal + netInvested - previousInvested
        : 0;

    const baselineIndex = (match: (candidate: Snapshot) => boolean): number =>
      state.snapshots.slice(0, index).findIndex(match);
    const january = baselineIndex(
      (candidate) => monthSerial(candidate.date) === Math.floor(month / 12) * 12,
    );
    const lastYear = baselineIndex((candidate) => monthSerial(candidate.date) === month - 12);
    const change = (baseline: number): { gain: EuroCents; base: number } | null => {
      const baselineGain = baseline >= 0 ? gains[baseline] : undefined;
      const baselineSnapshot = baseline >= 0 ? state.snapshots[baseline] : undefined;
      if (baselineGain === undefined || baselineSnapshot === undefined) return null;
      return { gain: exact(subtractCents(gain, baselineGain)), base: baselineSnapshot.fundsSubtotal };
    };
    const yearToDate = change(january);
    const yearOverYear = change(lastYear);

    const funds: Record<string, FundMetrics> = {};
    for (const [isin, holding] of Object.entries(snapshot.holdings)) {
      const before = previous?.holdings[isin];
      const fundGain = exact(subtractCents(holding.value, holding.netInvested));
      const priorGain =
        before === undefined ? ZERO_CENTS : exact(subtractCents(before.value, before.netInvested));
      const fundPeriod = previous === undefined ? null : exact(subtractCents(fundGain, priorGain));
      const fundMonthly = consecutive ? fundPeriod : null;
      const comparable = before !== undefined && before.status === "active" && holding.status === "active" ? before : null;
      funds[isin] = {
        value: holding.value,
        netInvested: holding.netInvested,
        status: holding.status,
        gain: fundGain,
        gainPercent: ratio(fundGain, holding.netInvested),
        monthlyGain: fundMonthly,
        monthlyGainPercent:
          consecutive && comparable !== null
            ? ratio(fundMonthly, comparable.value + holding.moneyIn - holding.moneyOut)
            : null,
        share: ratio(holding.value, total),
      };
    }

    results.push({
      date: snapshot.date,
      total,
      invested: netInvested,
      gain,
      gainPercent: ratio(gain, netInvested),
      consecutive,
      periodGain,
      monthlyGain,
      monthlyGainPercent: consecutive ? ratio(monthlyGain, monthlyDenominator) : null,
      yearToDateGain: yearToDate?.gain ?? null,
      yearToDatePercent: yearToDate === null ? null : ratio(yearToDate.gain, yearToDate.base),
      yearOverYearGain: yearOverYear?.gain ?? null,
      yearOverYearPercent: yearOverYear === null ? null : ratio(yearOverYear.gain, yearOverYear.base),
      estimated: Object.values(snapshot.holdings).some(
        (holding) => holding.moneyIn !== 0 || holding.moneyOut !== 0 || !holding.cashVerified,
      ),
      funds,
    });
  });
  return results;
}
