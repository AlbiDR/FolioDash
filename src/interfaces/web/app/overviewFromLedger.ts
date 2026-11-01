import type { LedgerState } from "../../../core/Ledger";
import { computeMetrics } from "../../../core/Metrics";
import type { OverviewFund, OverviewKpi, OverviewModel } from "../features/overview/OverviewModel";

/**
 * Turns a ledger into the overview's model using the metrics kernel. This is the
 * composition root's stand-in for an application-layer query. The labels carry
 * the reporting policy's exact definitions so nothing is presented as more than
 * it is.
 */
export function overviewFromLedger(state: LedgerState, source: OverviewModel["source"]): OverviewModel {
  const metrics = computeMetrics(state);
  const latest = metrics[metrics.length - 1];
  const dates = state.snapshots.map((snapshot) => snapshot.date);

  const funds: OverviewFund[] = state.funds.map((fund) => {
    const current = latest?.funds[fund.isin];
    return {
      isin: fund.isin,
      name: fund.name,
      status: current?.status ?? "active",
      // A fund shows no value before it was held, nor after the statement that closed it.
      values: state.snapshots.map((snapshot) => {
        const holding = snapshot.holdings[fund.isin];
        return holding === undefined || holding.action === "Closed" ? null : holding.value;
      }),
      netInvested: state.snapshots.map((snapshot) => {
        const holding = snapshot.holdings[fund.isin];
        return holding === undefined || holding.action === "Closed" ? null : holding.netInvested;
      }),
      latest: current === undefined
        ? null
        : {
            value: current.value,
            netInvested: current.netInvested,
            gain: current.gain,
            gainPercent: current.gainPercent,
            monthlyGain: current.monthlyGain,
            monthlyGainPercent: current.monthlyGainPercent,
            share: current.share,
          },
    };
  });

  const kpis: OverviewKpi[] =
    latest === undefined
      ? []
      : [
          { label: "Fund value", amount: latest.total, percent: null, signed: false, note: "The bank's funds-only total. Account cash is not included." },
          { label: "Net invested", amount: latest.invested, percent: null, signed: false, note: "Cash paid in minus full proceeds received, including funds you have sold." },
          { label: "Current gain", amount: latest.gain, percent: latest.gainPercent, signed: true, note: "Value minus net invested. Includes results already realised from sold funds. The percentage is on net invested; it is not annualised." },
          { label: "Month on month", amount: latest.monthlyGain, percent: latest.monthlyGainPercent, signed: true, note: "Change in gain since the previous statement, only when that was the month before. Cash you moved is excluded." },
          { label: "Year to date", amount: latest.yearToDateGain, percent: latest.yearToDatePercent, signed: true, note: "Change in gain since this year's January statement. This is not a return since 1 January." },
          { label: "Year on year", amount: latest.yearOverYearGain, percent: latest.yearOverYearPercent, signed: true, note: "Change in gain against the statement from the same month last year." },
        ];

  return {
    source,
    dates,
    funds,
    totals: metrics.map((entry) => ({ value: entry.total, invested: entry.invested })),
    kpis,
    months: metrics.map((entry) => ({
      date: entry.date,
      value: entry.total,
      gain: entry.gain,
      gainPercent: entry.gainPercent,
      monthlyGain: entry.monthlyGain,
      monthlyGainPercent: entry.monthlyGainPercent,
      yearToDateGain: entry.yearToDateGain,
      yearToDatePercent: entry.yearToDatePercent,
      yearOverYearGain: entry.yearOverYearGain,
      yearOverYearPercent: entry.yearOverYearPercent,
    })),
    estimated: metrics.some((entry) => entry.estimated),
  };
}
