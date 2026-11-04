import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { formatDateLong } from "../../../../core/IsoDate";
import { REPORTING_POLICY } from "../../../../core/Metrics";
import { formatPercent } from "../../../../core/Percent";
import type { ChartRange } from "./chartRange";
import { type AllocationSlice, type MonthMetric, dashboardFor } from "./dashboardData";
import { Donut } from "../../presentation/charts/Donut";
import { LineChart } from "../../presentation/charts/LineChart";
import { MonthlyBars } from "../../presentation/charts/MonthlyBars";
import { PerformanceBars } from "../../presentation/charts/PerformanceBars";
import { Sparkline } from "../../presentation/charts/Sparkline";
import { Amount } from "../../presentation/privacy/privacy";
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
          {kpi.signed && kpi.percent !== null ? <Pill ratio={kpi.percent} signed /> : <span class="pill">-</span>}
          <p class="stat-caption">{props.caption}</p>
        </>
      )}
      <Sparkline times={props.trend.times} values={props.trend.values} width={220} height={52} area />
    </div>
  );
}

const STATS: readonly { readonly label: string; readonly metric: MonthMetric; readonly caption: string; readonly unavailable: string }[] = [
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

/** Keep allocation inspection local, so pointer movement does not rerender the other charts. */
function AllocationCard(props: { readonly slices: readonly AllocationSlice[] }): JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const active = props.slices.find(slice => slice.isin === (hovered ?? focused));
  function focusSlice(id: string | null): void {
    setFocused(id);
    if (id !== null) setHovered(null);
  }
  return (
    <div class="card cell-4 allocation-card">
      <h3 class="card-title">Where your money is</h3>
      <p class="card-subtitle">Share of the latest statement's fund value. Select a fund to see its history.</p>
      {props.slices.length === 0 ? <p class="empty-note">No fund is held.</p> : <>
        <Donut
          label="Share of the portfolio by fund"
          slices={props.slices.map(slice => ({
            id: slice.isin, label: slice.name, value: slice.value,
            href: `#fund/${slice.isin}`, description: `${slice.name}: ${formatPercent(slice.share)}. View fund.`,
          }))}
          activeId={active?.isin ?? null}
          onHover={setHovered}
          onFocus={focusSlice}
          centre={<>
            <span class="donut-number">{active === undefined ? props.slices.length : formatPercent(active.share)}</span>
            <span class="donut-caption">{active === undefined ? (props.slices.length === 1 ? "fund" : "funds") : "of portfolio"}</span>
          </>}
        />
        <ul class="legend" data-inspecting={active !== undefined}>
          {props.slices.map((slice, index) => (
            <li key={slice.isin}>
              <a
                href={`#fund/${slice.isin}`}
                data-active={active?.isin === slice.isin}
                onPointerEnter={(event) => { if (event.pointerType !== "touch") setHovered(slice.isin); }}
                onPointerLeave={() => { setHovered(null); }}
                onFocus={() => { focusSlice(slice.isin); }}
                onBlur={() => { focusSlice(null); }}
              >
                <span class={`dot series-${String(index % 8)}`} aria-hidden="true" />
                <span class="legend-name">{slice.name}</span>
                <span class="legend-value">{formatPercent(slice.share)}</span>
              </a>
            </li>
          ))}
        </ul>
      </>}
    </div>
  );
}

/**
 * The dashboard: every widget reads from one model and one time range, and
 * nothing here calculates a financial result. The grid shows value, trend,
 * period results, allocation, monthly pattern, fund ranking and holdings at once.
 */
export function OverviewView(props: { readonly model: OverviewModel; readonly range: ChartRange }): JSX.Element {
  const [fundQuery, setFundQuery] = useState("");
  const { dates, funds, totals, kpis } = props.model;
  const latestTotal = totals[totals.length - 1];
  const lastDate = dates[dates.length - 1];

  if (dates.length === 0 || latestTotal === undefined || lastDate === undefined) {
    return (
      <section aria-labelledby="overview-heading" class="screen">
        <div class="card empty-portfolio">
          <span class="eyebrow">A clear view starts with one statement</span>
          <h2 id="overview-heading" class="screen-title">Make room for your portfolio.</h2>
          <p>Import your latest bank statement, or bring your existing history. We will guide you through dates, opening amounts and money movements before you save.</p>
          <a class="primary link-button" href="#import">Add your first statement <Icon name="chevron" size={18} /></a>
          <p class="hint">Your figures will appear here after your first confirmed import.</p>
        </div>
      </section>
    );
  }

  const kpi = (label: string): OverviewKpi | undefined => kpis.find((entry) => entry.label === label);
  const gain = kpi("Current gain");
  const d = dashboardFor(props.model, props.range);
  const { held, slices, ranking, bars } = d;
  const query = fundQuery.trim().toLocaleLowerCase("en");
  const listedFunds = [...d.held, ...d.closed].filter(fund => `${fund.name} ${fund.isin}`.toLocaleLowerCase("en").includes(query));

  return (
    <section aria-labelledby="overview-heading" class="dash portfolio-dashboard">
      <header class="dashboard-intro cell-12">
        <div><p class="eyebrow">{props.model.source === "demo" ? "Sample portfolio" : "Your latest picture"}</p><h2 id="overview-heading">As of {formatDateLong(lastDate)}</h2><p>Fund values, progress and holdings from your latest statement.</p></div>
        <a class="quiet-action statement-action" href="#import"><Icon name="import" size={18} /> Add a statement</a>
      </header>

      <div class="card hero cell-4">
        <p class="card-label">Total fund value</p>
        <p class="hero-value">
          <Amount cents={latestTotal.value} />
        </p>
        <p class="hero-caption">Your funds, excluding account cash.</p>
        <div class="hero-gain"><p class="card-label">Total gain</p><p class="hero-sub">
          {gain !== undefined && <><Signed cents={gain.amount} /><Pill ratio={gain.percent} signed /></>}
        </p><p class="hero-caption">Fund value minus net invested.</p></div>
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
        </dl>
      </div>

      <div class="cell-8 portfolio-trend">
        <LineChart
          id="total-chart"
          key={props.range}
          title="Your portfolio over time"
          subtitle="Fund value and net invested, side by side. The dashed line tracks your net cash contributions."
          description="Two lines over time: the value of all funds, and the cash invested in them, dashed."
          series={d.totalSeries}
          fillFirst
          formatTime={monthLabel}
          formatValue={euroLabel}
          emptyMessage="There is nothing to plot yet."
        />
      </div>

      <header class="section-heading cell-12"><div><p class="eyebrow">Progress</p><h3>How your gain has changed</h3></div><p>Latest-statement results, independent of the chart period.{props.model.estimated ? " Cash timing affects percentage estimates." : ""}</p></header>
      {STATS.map((stat) => {
        const entry = kpi(stat.label);
        return entry === undefined ? null : (
          <div key={stat.label} class="cell-4 kpi-cell">
            <StatCard kpi={entry} caption={stat.caption} unavailable={stat.unavailable} trend={{ times: d.shownTimes, values: d.metricTrends[stat.metric] }} />
          </div>
        );
      })}

      <header class="section-heading cell-12"><div><p class="eyebrow">Composition</p><h3>Inside your portfolio</h3></div><p>Explore each fund and see how your value is distributed.</p></header>
      <div class="card cell-8 portfolio-holdings">
        <h3 class="card-title">Your funds</h3>
        <p class="card-subtitle">Figures from the latest statement. Select a fund to see its history.</p>
        {funds.length > 0 && <div class="field fund-search">
          <label for="fund-search">Find a fund</label>
          <input id="fund-search" type="search" placeholder="Name or ISIN" value={fundQuery} onInput={(event) => { setFundQuery(event.currentTarget.value); }} aria-describedby="fund-search-help" />
          <p id="fund-search-help" class="hint" role="status"><span key={listedFunds.length} class="filter-count">{listedFunds.length} of {funds.length} funds.</span> Filters this list only.</p>
        </div>}
        {funds.length > 0 && listedFunds.length === 0 && <p class="empty-note search-empty">No funds match. Try another name or ISIN.</p>}
        <ul class="mobile-holdings" data-filtered={query.length > 0}>
          {listedFunds.map((fund) => (
            <li key={fund.isin}>
              <a href={`#fund/${fund.isin}`}>
                <span class="mobile-holding-name">{fund.name}<span class="holding-meta">{fund.status === "closed" ? "Closed" : "View fund"}</span></span>
                <Icon name="chevron" size={18} />
                <dl>
                  <div><dt>Value</dt><dd><Amount cents={fund.latest?.value ?? null} /></dd></div>
                  <div><dt>Gain</dt><dd><Signed cents={fund.latest?.gain ?? null} /> <Pill ratio={fund.latest?.gainPercent ?? null} signed /></dd></div>
                </dl>
              </a>
            </li>
          ))}
        </ul>
        {funds.length === 0 ? (
          <p class="empty-note">No funds are held.</p>
        ) : (
          <div class="table-scroll flat desktop-holdings" role="region" aria-label="Fund holdings" tabIndex={0}>
            <table class="holdings-table" data-filtered={query.length > 0}>
              <thead>
                <tr>
                  <th scope="col">Fund</th>
                  <th scope="col">Value</th>
                  <th scope="col" class="hide-sm">Net invested</th>
                  <th scope="col" class="hide-sm">Gain</th>
                  <th scope="col">Gain %</th>
                </tr>
              </thead>
              <tbody>
                {listedFunds.map((fund) => (
                  <tr key={fund.isin} class={fund.status === "closed" ? "closed" : ""}>
                    <th scope="row">
                      <a href={`#fund/${fund.isin}`} class="stretched">{fund.name}</a>
                      <span class="holding-meta">{fund.status === "closed" ? "Closed" : fund.isin}</span>
                    </th>
                    <td><Amount cents={fund.latest?.value ?? null} /></td>
                    <td class="hide-sm"><Amount cents={fund.latest?.netInvested ?? null} /></td>
                    <td class="hide-sm"><Signed cents={fund.latest?.gain ?? null} /></td>
                    <td><Pill ratio={fund.latest?.gainPercent ?? null} signed /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AllocationCard slices={slices} />

      <details class="cell-12 dashboard-analysis">
        <summary><span>Explore trends and comparisons<span class="disclosure-description">Monthly movement, fund performance and the data behind your portfolio.</span></span></summary>
        <div class="dash analysis-grid">
      <div class="card cell-6">
        <h3 class="card-title">Monthly change in gain</h3>
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

      <div class="card cell-6">
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
            <dd>{dates[0] === undefined ? "-" : formatDateLong(dates[0])}</dd>
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

      </div>
      </details>

      <details class="card cell-12 dashboard-glossary">
        <summary>What the numbers mean</summary>
        <dl class="glossary">
          {GLOSSARY.map((entry) => (
            <div key={entry.term}>
              <dt>{entry.term}</dt>
              <dd>{entry.meaning}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
