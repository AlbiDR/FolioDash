import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { CHART_RANGES, type ChartRange, rangeStart } from "../../app/chartRange";
import { LineChart } from "../../shared/charts/LineChart";
import type { ChartSeries } from "../../shared/charts/lineChartGeometry";
import { Amount } from "../../shared/privacy/privacy";
import { Icon } from "../../shared/ui/icons";
import { RangeSelector } from "../../shared/ui/RangeSelector";
import { euroLabel, euros, monthLabel, utcTime } from "./chartData";
import type { OverviewModel } from "./OverviewModel";
import { Percent, Pill, Signed } from "./parts";

/** One fund: its value and net invested over time, and its latest figures. */
export function FundView(props: { readonly model: OverviewModel; readonly isin: string }): JSX.Element {
  const [range, setRange] = useState<ChartRange>("All");
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
        <p>No fund with that identifier is in the ledger.</p>
      </section>
    );
  }

  const { dates } = props.model;
  const start = rangeStart(dates, range);
  const shown = dates.slice(start);
  const series: ChartSeries[] = [
    { id: "value", label: "Value", points: shown.map((date, index) => ({ time: utcTime(date), value: euros(fund.values[start + index] ?? null) })) },
    { id: "invested", label: "Net invested", dashed: true, points: shown.map((date, index) => ({ time: utcTime(date), value: euros(fund.netInvested[start + index] ?? null) })) },
  ];
  const latest = fund.latest;

  return (
    <section class="screen" aria-labelledby="fund-heading">
      {back}
      <header>
        <p class="eyebrow">{fund.isin}</p>
        <h2 id="fund-heading" class="screen-title">{fund.name}</h2>
      </header>
      <div class="hero">
        <p class="hero-label">{fund.status === "closed" ? "Closed" : "Value"}</p>
        <p class="hero-value"><Amount cents={latest?.value ?? null} /></p>
        <p class="hero-sub">
          <Signed cents={latest?.gain ?? null} />
          <Pill ratio={latest?.gainPercent ?? null} signed />
          <span>gain</span>
        </p>
      </div>
      <div class="range-row">
        <RangeSelector label="Chart range" options={CHART_RANGES} value={range} onChange={setRange} />
      </div>
      <LineChart
        id="fund-chart"
        title="Value and net invested"
        description="Two lines over time for this fund: its value, and the cash invested in it, dashed."
        series={series}
        fillFirst
        formatTime={monthLabel}
        formatValue={euroLabel}
        emptyMessage="This fund has no value to plot yet."
      />
      <ul class="inset-list stat-list">
        <li><span>Value</span><Amount cents={latest?.value ?? null} /></li>
        <li><span>Net invested</span><Amount cents={latest?.netInvested ?? null} /></li>
        <li><span>Gain</span><Signed cents={latest?.gain ?? null} /></li>
        <li><span>Gain %</span><Percent ratio={latest?.gainPercent ?? null} signed /></li>
        <li><span>Month on month</span><Signed cents={latest?.monthlyGain ?? null} /></li>
        <li><span>Month on month %</span><Percent ratio={latest?.monthlyGainPercent ?? null} signed /></li>
        <li><span>Share of portfolio</span><Percent ratio={latest?.share ?? null} /></li>
      </ul>
      <p class="footnote">Net invested = cumulative cash in minus cash out. Gain % is since invested.</p>
    </section>
  );
}
