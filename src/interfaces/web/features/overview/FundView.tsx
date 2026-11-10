import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { CHART_RANGES, type ChartRange, rangeStart } from "./chartRange";
import { RangeSelector } from "../../shared/ui/RangeSelector";
import { LineChart } from "../../presentation/charts/LineChart";
import type { ChartSeries } from "../../presentation/charts/lineChartGeometry";
import { Amount } from "../../presentation/privacy/privacy";
import { euroLabel, euros, monthLabel, utcTime } from "./chartData";
import type { OverviewModel } from "./OverviewModel";
import { Percent, Pill, Signed } from "./parts";

/** One fund: its value and net invested over time, and its latest figures, on the shared time range. */
export function FundView(props: { readonly model: OverviewModel; readonly isin: string; readonly range: ChartRange; readonly onRangeChange: (range: ChartRange) => void }): JSX.Element {
  const [copyFeedback, setCopyFeedback] = useState<{ isin: string; message: string; ok: boolean } | null>(null);
  const [copying, setCopying] = useState(false);
  const copyPending = useRef(false);
  async function copyIsin(isin: string): Promise<void> {
    if (copyPending.current) return;
    copyPending.current = true;
    setCopying(true);
    setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(isin);
      setCopyFeedback({ isin, message: "ISIN copied.", ok: true });
    } catch {
      setCopyFeedback({ isin, message: "Could not copy. Select and copy the ISIN above.", ok: false });
    } finally {
      copyPending.current = false;
      setCopying(false);
    }
  }
  const fund = props.model.funds.find((entry) => entry.isin === props.isin);
  if (fund === undefined) {
    return (
      <section class="screen" aria-labelledby="fund-heading">
        <div class="card"><h2 id="fund-heading" class="card-title">Fund not found</h2><p>No fund with that identifier is in the ledger.</p></div>
      </section>
    );
  }

  const { dates } = props.model;
  const start = rangeStart(dates, props.range);
  const shown = dates.slice(start);
  const series: ChartSeries[] = [
    { id: "value", label: "Value", points: shown.map((date, index) => ({ time: utcTime(date), value: euros(fund.values[start + index] ?? null) })) },
    { id: "invested", label: "Net invested", dashed: true, points: shown.map((date, index) => ({ time: utcTime(date), value: euros(fund.netInvested[start + index] ?? null) })) },
  ];
  const latest = fund.latest;

  return (
    <div class="dash">
      <div class="card hero cell-4">
        <div class="hero-header">
          <p class="hero-context isin-code">{fund.isin}</p>
          <button class="hero-action" type="button" disabled={copying} onClick={() => { void copyIsin(fund.isin); }}>{copying ? "Copying…" : copyFeedback?.isin === fund.isin && copyFeedback.ok ? "Copied" : "Copy ISIN"}</button>
        </div>
        <p class="copy-feedback" role="status" aria-atomic="true">{copying ? "Copying ISIN…" : copyFeedback?.isin === fund.isin && <span key={copyFeedback.message} class={copyFeedback.ok ? "visually-hidden" : "copy-result"}>{copyFeedback.message}</span>}</p>
        <p class="hero-label">Value</p>
        <p class="hero-value"><Amount cents={latest?.value ?? null} /></p>
        <div class="hero-gain"><p class="hero-label">Gain{fund.status === "closed" ? " · closed" : ""}</p><p class="hero-sub">
          <Signed cents={latest?.gain ?? null} />
          <Pill ratio={latest?.gainPercent ?? null} signed />
        </p></div>
      </div>
      <div class="cell-8">
        <LineChart
          id="fund-chart"
          updateKey={props.range}
          title="Performance"
          note="Value and net invested for this fund. The chart period changes the chart, not your latest figures."
          controls={<RangeSelector label="Chart time range (charts only)" options={CHART_RANGES} value={props.range} onChange={props.onRangeChange} />}
          description="Two lines over time for this fund: its value, and the cash invested in it, dashed."
          series={series}
          fillFirst
          formatTime={monthLabel}
          formatValue={euroLabel}
          emptyMessage="This fund has no value to plot yet."
        />
      </div>
      <div class="card cell-12">
        <h2 class="card-title">Latest figures</h2>
        <dl class="facts grid">
          <div><dt>Net invested</dt><dd><Amount cents={latest?.netInvested ?? null} /></dd></div>
          <div><dt>Share of portfolio</dt><dd><Percent ratio={latest?.share ?? null} /></dd></div>
          <div><dt>Month on month</dt><dd><Signed cents={latest?.monthlyGain ?? null} /></dd></div>
          <div><dt>Month on month %</dt><dd><Percent ratio={latest?.monthlyGainPercent ?? null} signed /></dd></div>
        </dl>
        <p class="footnote">Net invested is cash in minus cash out. Gain % is measured against it.</p>
      </div>
    </div>
  );
}
