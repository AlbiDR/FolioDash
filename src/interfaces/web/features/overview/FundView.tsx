import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { type ChartRange, rangeStart } from "./chartRange";
import { LineChart } from "../../presentation/charts/LineChart";
import type { ChartSeries } from "../../presentation/charts/lineChartGeometry";
import { Amount } from "../../presentation/privacy/privacy";
import { Icon } from "../../shared/ui/icons";
import { euroLabel, euros, monthLabel, utcTime } from "./chartData";
import type { OverviewModel } from "./OverviewModel";
import { Percent, Pill, Signed } from "./parts";

/** One fund: its value and net invested over time, and its latest figures, on the shared time range. */
export function FundView(props: { readonly model: OverviewModel; readonly isin: string; readonly range: ChartRange }): JSX.Element {
  const [copyFeedback, setCopyFeedback] = useState<{ isin: string; message: string } | null>(null);
  async function copyIsin(isin: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(isin);
      setCopyFeedback({ isin, message: "ISIN copied." });
    } catch {
      setCopyFeedback({ isin, message: "Could not copy. Select and copy the ISIN above." });
    }
  }
  const fund = props.model.funds.find((entry) => entry.isin === props.isin);
  const back = (
    <a class="back-link" href="#overview">
      <Icon name="back" size={18} /> Portfolio
    </a>
  );
  if (fund === undefined) {
    return (
      <section class="screen" aria-labelledby="fund-heading">
        {back}
        <h2 id="fund-heading" class="screen-title">Fund not found</h2>
        <div class="card"><p>No fund with that identifier is in the ledger.</p></div>
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
    <section class="dash" aria-labelledby="fund-heading">
      <div class="cell-12">{back}</div>
      <div class="card hero cell-4">
        <div class="fund-identity">
          <p class="card-label isin-code">{fund.isin}</p>
          <button class="quiet-action" type="button" onClick={() => { void copyIsin(fund.isin); }}>Copy ISIN</button>
        </div>
        <p class="copy-feedback hint" role="status">{copyFeedback?.isin === fund.isin && <span key={copyFeedback.message} class="copy-result">{copyFeedback.message}</span>}</p>
        <h2 id="fund-heading" class="fund-title">{fund.name}</h2>
        <p class="hero-value"><Amount cents={latest?.value ?? null} /></p>
        <p class="hero-sub">
          <Signed cents={latest?.gain ?? null} />
          <Pill ratio={latest?.gainPercent ?? null} signed />
          <span>gain{fund.status === "closed" ? " · closed" : ""}</span>
        </p>
      </div>
      <div class="cell-8">
        <LineChart
          id="fund-chart"
          key={props.range}
          title="Value and net invested"
          description="Two lines over time for this fund: its value, and the cash invested in it, dashed."
          series={series}
          fillFirst
          formatTime={monthLabel}
          formatValue={euroLabel}
          emptyMessage="This fund has no value to plot yet."
        />
      </div>
      <div class="card cell-12">
        <h3 class="card-title">Latest figures</h3>
        <dl class="facts grid">
          <div><dt>Value</dt><dd><Amount cents={latest?.value ?? null} /></dd></div>
          <div><dt>Net invested</dt><dd><Amount cents={latest?.netInvested ?? null} /></dd></div>
          <div><dt>Gain</dt><dd><Signed cents={latest?.gain ?? null} /></dd></div>
          <div><dt>Gain %</dt><dd><Percent ratio={latest?.gainPercent ?? null} signed /></dd></div>
          <div><dt>Month on month</dt><dd><Signed cents={latest?.monthlyGain ?? null} /></dd></div>
          <div><dt>Month on month %</dt><dd><Percent ratio={latest?.monthlyGainPercent ?? null} signed /></dd></div>
          <div><dt>Share of portfolio</dt><dd><Percent ratio={latest?.share ?? null} /></dd></div>
        </dl>
        <p class="footnote">Net invested = cumulative cash in minus cash out. Gain % is since invested.</p>
      </div>
    </section>
  );
}
