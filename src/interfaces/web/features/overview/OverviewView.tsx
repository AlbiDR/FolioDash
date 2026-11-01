import type { JSX } from "preact";
import { formatDateLong } from "../../../../core/IsoDate";
import { REPORTING_POLICY } from "../../../../core/Metrics";
import { formatPercent } from "../../../../core/Percent";
import type { ChartRange } from "../../app/chartRange";
import { type MonthMetric, dashboardFor } from "../../app/dashboardData";
import { Donut } from "../../shared/charts/Donut";
import { LineChart } from "../../shared/charts/LineChart";
import { MonthlyBars } from "../../shared/charts/MonthlyBars";
import { PerformanceBars } from "../../shared/charts/PerformanceBars";
import { Sparkline } from "../../shared/charts/Sparkline";
import { Amount } from "../../shared/privacy/privacy";
import { Icon } from "../../shared/ui/icons";
import { euroLabel, monthLabel } from "./chartData";
import type { OverviewKpi, OverviewModel } from "./OverviewModel";
import { Pill, Signed, tone } from "./parts";

/** One headline figure of the earlier spreadsheet's recap, with its own trend underneath. */
function StatCard(props: {
  readonly kpi: OverviewKpi;
  readonly caption: string;
  /** Why the figure may be missing, said in plain words, so a dash is never a mystery. */
  readonly unavailable: string;
  readonly trend: { readonly times: readonly number[]; readonly values: readonly (number | null)[] };
}): JSX.Element {
  const { kpi } = props;
  return (
    <div class="card stat">
      <p class="card-label">{kpi.label}</p>
      <p class={`stat-value ${kpi.signed ? tone(kpi.amount) : ""}`}>
        <Amount cents={kpi.amount} signed={kpi.signed} />
      </p>
      {kpi.amount === null ? (
        <p class="stat-caption">{props.unavailable}</p>
      ) : (
        <>
          {kpi.signed && kpi.percent !== null ? <Pill ratio={kpi.percent} signed /> : <span class="pill">–</span>}
          <p class="stat-caption">{props.caption}</p>
        </>
      )}
      <Sparkline times={props.trend.times} values={props.trend.values} width={220} height={52} area />
    </div>
  );
}

const STATS: readonly { readonly label: string; readonly metric: MonthMetric; readonly caption: string; readonly unavailable: string }[] = [
  { label: "Current gain", metric: "gain", caption: "Fund value minus the money you put in.", unavailable: "Needs a recorded statement." },
  { label: "Month on month", metric: "monthlyGain", caption: "How much the gain changed since last month.", unavailable: "Needs a statement from the month before." },
  { label: "Year to date", metric: "yearToDateGain", caption: "How much the gain changed since January.", unavailable: "Needs a January statement of this year." },
  { label: "Year on year", metric: "yearOverYearGain", caption: "How much the gain changed since the same month last year.", unavailable: "Needs a statement from the same month last year." },
];

/** The meaning of every figure, in plain words. The exact definitions stay one click further down. */
const GLOSSARY: readonly { readonly term: string; readonly meaning: string }[] = [
  { term: "Fund value", meaning: "What your funds are worth on the latest bank statement. Cash in the account is not included." },
  { term: "Net invested", meaning: "Money you paid in, minus money you took out." },
  { term: "Gain", meaning: "Fund value minus net invested. It includes profit already made on funds you sold." },
  { term: "Month on month", meaning: "How much the gain changed since last month's statement." },
  { term: "Year to date", meaning: "How much the gain changed since this year's January statement." },
  { term: "Year on year", meaning: "How much the gain changed since the same month last year." },
  { term: "Percentages", meaning: "A gain divided by net invested. They are not yearly rates." },
];

/**
 * The dashboard: every widget reads from one model and one time range, and
 * nothing here calculates a financial result. The grid shows value, trend,
 * period results, allocation, monthly pattern, fund ranking and holdings at once.
 */
export function OverviewView(props: { readonly model: OverviewModel; readonly range: ChartRange }): JSX.Element {
  const { dates, funds, totals, kpis } = props.model;
  const latestTotal = totals[totals.length - 1];
  const lastDate = dates[dates.length - 1];

  if (dates.length === 0 || latestTotal === undefined || lastDate === undefined) {
    return (
      <section aria-labelledby="overview-heading" class="screen">
        <h2 id="overview-heading" class="screen-title">Portfolio</h2>
        <div class="card">
          <p>No statements have been imported yet. Import your first bank statement to see your portfolio here.</p>
        </div>
      </section>
    );
  }

  const kpi = (label: string): OverviewKpi | undefined => kpis.find((entry) => entry.label === label);
  const gain = kpi("Current gain");
  const d = dashboardFor(props.model, props.range);
  const { held, slices, ranking, bars } = d;

  return (
    <section aria-labelledby="overview-heading" class="dash">
      <h2 id="overview-heading" class="visually-hidden">Portfolio dashboard</h2>

      <div class="card hero cell-4">
        <p class="card-label">Total fund value</p>
        <p class="hero-value">
          <Amount cents={latestTotal.value} />
        </p>
        <p class="hero-sub">
          {gain !== undefined && (
            <>
              <Signed cents={gain.amount} />
              <Pill ratio={gain.percent} signed />
            </>
          )}
          <span>total gain</span>
        </p>
        <p class="hero-caption">Gain = fund value − net invested, as of the latest statement.</p>
        <dl class="facts">
          <div>
            <dt>Net invested</dt>
            <dd><Amount cents={latestTotal.invested} /></dd>
            <dd class="facts-note">paid in − taken out</dd>
          </div>
          <div>
            <dt>Funds held</dt>
            <dd>{held.length}</dd>
          </div>
          <div>
            <dt>Latest statement</dt>
            <dd>{formatDateLong(lastDate)}</dd>
          </div>
        </dl>
        <Sparkline times={d.shownTimes} values={d.heroTrend} width={360} height={88} area />
      </div>

      <div class="cell-8">
        <LineChart
          id="total-chart"
          key={props.range}
          title="Value and money invested"
          subtitle="Solid line: what your funds are worth. Dashed line: what you have put in, net."
          description="Two lines over time: the value of all funds, and the cash invested in them, dashed."
          series={d.totalSeries}
          fillFirst
          formatTime={monthLabel}
          formatValue={euroLabel}
          emptyMessage="There is nothing to plot yet."
        />
      </div>

      {STATS.map((stat) => {
        const entry = kpi(stat.label);
        return entry === undefined ? null : (
          <div key={stat.label} class="cell-3">
            <StatCard kpi={entry} caption={stat.caption} unavailable={stat.unavailable} trend={{ times: d.shownTimes, values: d.metricTrends[stat.metric] }} />
          </div>
        );
      })}

      <div class="card cell-4">
        <h3 class="card-title">Where your money is</h3>
        <p class="card-subtitle">Share of today's fund value, by fund.</p>
        {slices.length === 0 ? (
          <p class="empty-note">No fund is held.</p>
        ) : (
          <>
            <Donut
              label="Share of the portfolio by fund"
              slices={slices.map((slice) => ({ id: slice.isin, label: slice.name, value: slice.value }))}
              centre={
                <>
                  <span class="donut-number">{slices.length}</span>
                  <span class="donut-caption">{slices.length === 1 ? "fund" : "funds"}</span>
                </>
              }
            />
            <ul class="legend">
              {slices.map((slice, index) => (
                <li key={slice.isin}>
                  <a href={`#fund/${slice.isin}`}>
                    <span class={`dot series-${String(index % 8)}`} aria-hidden="true" />
                    <span class="legend-name">{slice.name}</span>
                    <span class="legend-value">{formatPercent(slice.share)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div class="card cell-4">
        <h3 class="card-title">Monthly growth</h3>
        <p class="card-subtitle">How much your gain changed each month. Hover or tap a bar to read it.</p>
        <MonthlyBars
          id="monthly-bars"
          title="Change in gain"
          description="Bars for the change in gain each month: above the line is a gain, below is a loss."
          bars={bars}
          formatValue={euroLabel}
        />
        <p class="footnote">A month has no bar when there is no statement from the month before it.</p>
      </div>

      <div class="card cell-4">
        <h3 class="card-title">Gain by fund</h3>
        <p class="card-subtitle">Gain as a percentage of what you put in. Not a yearly rate.</p>
        {ranking.length === 0 ? (
          <p class="empty-note">No fund has a percentage to rank yet.</p>
        ) : (
          <PerformanceBars rows={ranking.map((fund) => ({ key: fund.isin, href: `#fund/${fund.isin}`, label: fund.name, ratio: fund.percent, dim: fund.closed }))} />
        )}
        <p class="footnote">Funds you have sold are dimmed.</p>
      </div>

      <div class="cell-8">
        <LineChart
          id="funds-chart"
          key={`funds-${props.range}`}
          title="Value of each fund"
          subtitle="Solid line: a fund's value. Dotted line, same colour: what you have put into it. A gap means it was not held that month."
          description="One solid line per fund showing its value over time, and a faint dotted line in the same colour for the money invested in it. A fund that was not held leaves a gap."
          series={d.fundSeries}
          formatTime={monthLabel}
          formatValue={euroLabel}
          emptyMessage="No fund has a value to plot yet."
        />
      </div>

      <div class="card cell-4">
        <h3 class="card-title">About this data</h3>
        <p class="card-subtitle">Where these figures come from.</p>
        <dl class="facts stacked">
          <div>
            <dt>Statements recorded</dt>
            <dd>{dates.length}</dd>
          </div>
          <div>
            <dt>First statement</dt>
            <dd>{dates[0] === undefined ? "–" : formatDateLong(dates[0])}</dd>
          </div>
          <div>
            <dt>Funds ever held</dt>
            <dd>{funds.length}</dd>
          </div>
          <div>
            <dt>Calculation method</dt>
            <dd>{REPORTING_POLICY}</dd>
          </div>
        </dl>
        <a class="row-link plain" href="#months">
          <span>Month by month</span>
          <Icon name="chevron" size={18} />
        </a>
        <details class="definitions">
          <summary>Exact definitions</summary>
          <dl>
            {kpis.map((entry) => (
              <div key={entry.label}>
                <dt>{entry.label}</dt>
                <dd>{entry.note}</dd>
              </div>
            ))}
          </dl>
          <p class="hint">These follow the definitions of the earlier spreadsheet so the results can be compared with it. A dash means the figure cannot be calculated from the statements recorded.</p>
        </details>
      </div>

      <div class="card cell-12">
        <h3 class="card-title">Your funds</h3>
        <p class="card-subtitle">Figures from the latest statement. Select a fund to see its history.</p>
        {funds.length === 0 ? (
          <p class="empty-note">No funds are held.</p>
        ) : (
          <div class="table-scroll flat">
            <table class="holdings-table">
              <thead>
                <tr>
                  <th scope="col">Fund</th>
                  <th scope="col" class="hide-sm">Trend</th>
                  <th scope="col">Value</th>
                  <th scope="col" class="hide-sm">Net invested</th>
                  <th scope="col" class="hide-sm">Gain</th>
                  <th scope="col">Gain %</th>
                  <th scope="col" class="hide-md">Share of portfolio</th>
                </tr>
              </thead>
              <tbody>
                {[...d.held, ...d.closed].map((fund) => (
                  <tr key={fund.isin} class={fund.status === "closed" ? "closed" : ""}>
                    <th scope="row">
                      <a href={`#fund/${fund.isin}`} class="stretched">{fund.name}</a>
                      <span class="holding-meta">{fund.status === "closed" ? "Closed" : fund.isin}</span>
                    </th>
                    <td class="hide-sm"><Sparkline times={d.allTimes} values={d.holdingTrends[fund.isin] ?? []} /></td>
                    <td><Amount cents={fund.latest?.value ?? null} /></td>
                    <td class="hide-sm"><Amount cents={fund.latest?.netInvested ?? null} /></td>
                    <td class="hide-sm"><Signed cents={fund.latest?.gain ?? null} /></td>
                    <td><Pill ratio={fund.latest?.gainPercent ?? null} signed /></td>
                    <td class="hide-md">
                      <span class="share-bar" aria-hidden="true"><span style={{ width: `${((fund.latest?.share ?? 0) * 100).toFixed(1)}%` }} /></span>
                      {formatPercent(fund.latest?.share ?? null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div class="card cell-12">
        <h3 class="card-title">What the numbers mean</h3>
        <dl class="glossary">
          {GLOSSARY.map((entry) => (
            <div key={entry.term}>
              <dt>{entry.term}</dt>
              <dd>{entry.meaning}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
