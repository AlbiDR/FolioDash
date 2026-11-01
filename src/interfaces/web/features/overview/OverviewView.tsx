import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { formatMonthYear } from "../../../../core/IsoDate";
import type { EuroCents } from "../../../../core/Money";
import { formatPercent } from "../../../../core/Percent";
import { CHART_RANGES, type ChartRange, rangeStart } from "../../app/chartRange";
import { LineChart } from "../../shared/charts/LineChart";
import { Sparkline } from "../../shared/charts/Sparkline";
import type { ChartSeries } from "../../shared/charts/lineChartGeometry";
import { Icon } from "../../shared/ui/icons";
import { RangeSelector } from "../../shared/ui/RangeSelector";
import { Amount } from "../../shared/privacy/privacy";
import { euroLabel, euros, monthLabel, utcTime } from "./chartData";
import type { OverviewKpi, OverviewModel } from "./OverviewModel";
import { Pill, Signed, tone } from "./parts";

/** The four period figures of the earlier spreadsheet's recap, as tiles, in its order. */
const TILES = ["Month on month", "Year to date", "Year on year"];
const SHORT_LABEL: Readonly<Record<string, string>> = { "Month on month": "Month on month", "Year to date": "Year to date", "Year on year": "Year on year" };

function Tile(props: { readonly kpi: OverviewKpi; readonly label: string }): JSX.Element {
  const { kpi } = props;
  return (
    <div class="tile">
      <dt>{props.label}</dt>
      <dd>
        <span class={kpi.signed ? tone(kpi.amount) : ""}>
          <Amount cents={kpi.amount} signed={kpi.signed} />
        </span>
        {kpi.signed && kpi.percent !== null && <Pill ratio={kpi.percent} signed />}
      </dd>
    </div>
  );
}

export function OverviewView(props: { readonly model: OverviewModel }): JSX.Element {
  const { dates, funds, totals, kpis } = props.model;
  const [range, setRange] = useState<ChartRange>("All");
  const latestTotal = totals[totals.length - 1];
  const lastDate = dates[dates.length - 1];

  if (dates.length === 0 || latestTotal === undefined || lastDate === undefined) {
    return (
      <section aria-labelledby="overview-heading" class="screen">
        <h2 id="overview-heading" class="screen-title">Portfolio</h2>
        <p>No statements have been imported yet. Import your first bank statement to see your portfolio here.</p>
      </section>
    );
  }

  const kpi = (label: string): OverviewKpi | undefined => kpis.find((entry) => entry.label === label);
  const gain = kpi("Current gain");
  const monthly = kpi("Month on month")?.amount ?? null;

  const start = rangeStart(dates, range);
  const shown = dates.slice(start);
  const totalSeries: ChartSeries[] = [
    {
      id: "value",
      label: "Portfolio value",
      points: shown.map((date, index) => ({ time: utcTime(date), value: euros(totals[start + index]?.value ?? null) })),
    },
    {
      id: "invested",
      label: "Net invested",
      dashed: true,
      points: shown.map((date, index) => ({ time: utcTime(date), value: euros(totals[start + index]?.invested ?? null) })),
    },
  ];
  const fundSeries: ChartSeries[] = funds.map((fund) => ({
    id: fund.isin,
    label: fund.name,
    points: shown.map((date, index) => ({ time: utcTime(date), value: euros(fund.values[start + index] ?? null) })),
  }));

  const active = funds.filter((fund) => fund.status !== "closed");
  const closed = funds.filter((fund) => fund.status === "closed");
  const times = dates.map(utcTime);
  const row = (fund: (typeof funds)[number]): JSX.Element => (
    <li key={fund.isin}>
      <a class={`holding${fund.status === "closed" ? " closed" : ""}`} href={`#fund/${fund.isin}`}>
        <span>
          <span class="holding-name">{fund.name}</span>
          <span class="holding-meta">
            {fund.status === "closed" ? "Closed" : `${formatPercent(fund.latest?.share ?? null)} of portfolio`}
          </span>
        </span>
        <Sparkline times={times} values={fund.values.map((value) => euros(value))} />
        <span class="holding-figures">
          <Amount cents={fund.latest?.value ?? null} />
          <Pill ratio={fund.latest?.gainPercent ?? null} signed />
        </span>
      </a>
    </li>
  );

  return (
    <section aria-labelledby="overview-heading" class="screen">
      <header>
        <p class="eyebrow">{formatMonthYear(lastDate)}</p>
        <h2 id="overview-heading" class="screen-title">Portfolio</h2>
      </header>

      <div class="hero">
        <p class="hero-label">Fund value</p>
        <p class="hero-value">
          <Amount cents={latestTotal.value} />
        </p>
        <p class="hero-sub">
          {gain !== undefined && (
            <>
              <Signed cents={gain.amount} />
              <Pill ratio={gain.percent} signed />
              <span>gain</span>
            </>
          )}
          <span>
            Net invested <Amount cents={latestTotal.invested} />
          </span>
        </p>
      </div>

      <div class="range-row">
        <RangeSelector label="Chart range" options={CHART_RANGES} value={range} onChange={setRange} />
      </div>
      <LineChart
        id="total-chart"
        title="Value and net invested"
        description="Two lines over time: the value of all funds, and the cash invested in them, dashed."
        series={totalSeries}
        fillFirst
        formatTime={monthLabel}
        formatValue={euroLabel}
        emptyMessage="There is nothing to plot yet."
      />

      <dl class="tiles">
        {TILES.flatMap((label) => {
          const entry = kpi(label);
          return entry === undefined ? [] : [<Tile key={label} kpi={entry} label={SHORT_LABEL[label] ?? label} />];
        })}
        {(() => {
          const net = kpi("Net invested");
          return net === undefined ? null : <Tile kpi={{ ...net, signed: false, percent: null }} label="Net invested" />;
        })()}
      </dl>
      {monthly !== null && monthly !== 0 && (
        <p class="footnote">
          Gain {monthly > 0 ? "rose" : "fell"} by <Amount cents={Math.abs(monthly) as EuroCents} /> since the previous statement.
          {props.model.estimated && " Percentages that depend on when you moved cash are estimates, and none of them is annualised."}
        </p>
      )}

      <h3 class="group-title">Holdings</h3>
      {funds.length === 0 ? (
        <p>No funds are held.</p>
      ) : (
        <ul class="inset-list">
          {active.map(row)}
          {closed.map(row)}
        </ul>
      )}

      <LineChart
        id="funds-chart"
        title="Value by fund"
        description="One line per fund showing its value over time. A fund that was not held leaves a gap."
        series={fundSeries}
        formatTime={monthLabel}
        formatValue={euroLabel}
        emptyMessage="No fund has a value to plot yet."
      />

      <ul class="inset-list">
        <li>
          <a class="row-link" href="#months">
            <span>Month by month</span>
            <Icon name="chevron" size={18} />
          </a>
        </li>
      </ul>

      <details class="definitions">
        <summary>How these figures are defined</summary>
        <dl>
          {kpis.map((entry) => (
            <div key={entry.label}>
              <dt>{entry.label}</dt>
              <dd>{entry.note}</dd>
            </div>
          ))}
        </dl>
        <p class="hint">
          These follow the definitions of the earlier spreadsheet so the results can be compared with it. A dash means the
          figure cannot be calculated from the statements recorded.
        </p>
      </details>
    </section>
  );
}
