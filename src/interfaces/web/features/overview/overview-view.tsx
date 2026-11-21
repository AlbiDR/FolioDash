import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { formatDateLong, type IsoDate } from "../../../../core/values/iso-date";
import { availableRanges, type ChartRange } from "./model/chart-range";
import { RangeSelector } from "../../shared/ui/range-selector";
import { PageNav } from "../../shared/ui/page-nav";
import { type MonthMetric, NO_MARKERS, dashboardFor } from "./model/dashboard-data";
import type { CheckpointMarker } from "../../../../core/portfolio/checkpoints";
import { LineChart } from "../../presentation/charts/line-chart";
import { Amount } from "../../presentation/privacy/privacy";
import { Icon } from "../../shared/ui/icons";
import { euroLabel, euroAxisLabel, monthLabel, observationLabel } from "./model/chart-data";
import type { OverviewKpi, OverviewModel } from "./model/overview-model";
import { Pill, Signed } from "./parts";
import { portfolioAttention } from "./model/attention";
import { returnsGrid } from "./model/returns-grid";
import { type HoldingsSort, sortHoldings } from "./model/holdings-sort";
import { AnalysisSection } from "./overview-analysis";
import { Glossary, MoversCard, StatCard, AllocationCard } from "./overview-cards";
import { HoldingsCard } from "./overview-holdings";
import "./portfolio-feedback.css";
import "./styles/portfolio-polish.css";

const STATS: readonly {
  readonly label: string;
  readonly metric: MonthMetric;
  readonly caption: string;
  readonly unavailable: string;
}[] = [
  {
    label: "Month on month",
    metric: "monthlyGain",
    caption: "Change since the previous month.",
    unavailable: "Needs a statement from the month before.",
  },
  {
    label: "Year to date",
    metric: "yearToDateGain",
    caption: "Change since January.",
    unavailable: "Needs a January statement of this year.",
  },
  {
    label: "Year on year",
    metric: "yearOverYearGain",
    caption: "Change since the same month last year.",
    unavailable: "Needs a statement from the same month last year.",
  },
];

/**
 * The dashboard: every widget reads from one model and one time range, and
 * nothing here calculates a financial result. The grid shows value, trend,
 * period results, allocation, monthly pattern, fund ranking and holdings at once.
 */
export function OverviewView(props: {
  readonly model: OverviewModel;
  readonly range: ChartRange;
  readonly onRangeChange: (range: ChartRange) => void;
  /** Value-only observations drawn on the performance chart. Never part of the statements' figures. */ readonly checkpoints?: readonly CheckpointMarker[];
  /** Today's date, so the Portfolio can ask for the next statement when it is due. */ readonly today?: IsoDate;
  /** True while a history change has an unconfirmed outcome. */ readonly pendingChange?: boolean;
}): JSX.Element {
  const [fundQuery, setFundQuery] = useState("");
  const [holdingsSort, setHoldingsSort] = useState<HoldingsSort | null>(null);
  const [closedOpen, setClosedOpen] = useState(true);
  const searchInput = useRef<HTMLInputElement>(null);
  function clearSearch(): void {
    setFundQuery("");
    searchInput.current?.focus({ preventScroll: true });
  }
  const { dates, funds, totals, kpis, labels, months } = props.model;
  const latestTotal = totals[totals.length - 1];
  const lastDate = dates[dates.length - 1];

  if (dates.length === 0 || latestTotal === undefined || lastDate === undefined) {
    return (
      <section aria-labelledby="overview-heading" class="screen">
        <div class="card empty-portfolio">
          <h2 id="overview-heading" class="empty-title">
            Your portfolio starts with one statement
          </h2>
          <p>
            Import your latest bank statement, or bring your existing history. You check the dates, opening amounts and
            money movements before anything is saved.
          </p>
          <a class="primary link-button" href="#import">
            Add your first statement <Icon name="chevron" size={18} />
          </a>
          <p class="hint">Your figures appear here after your first confirmed import.</p>
          <a class="row-link plain" href="#checkpoints">
            <span>Record a value-only checkpoint instead</span>
            <Icon name="chevron" size={18} />
          </a>
        </div>
      </section>
    );
  }

  const kpi = (label: string): OverviewKpi | undefined => kpis.find((entry) => entry.label === label);
  const gain = kpi("Current gain");
  const markers = props.checkpoints ?? NO_MARKERS;
  const d = dashboardFor(props.model, props.range, markers);
  const { held, slices, ranking, bars } = d;
  const query = fundQuery.trim().toLocaleLowerCase("en");
  const listedFunds = sortHoldings(
    [...d.held, ...d.closed].filter((fund) => `${fund.name} ${fund.isin}`.toLocaleLowerCase("en").includes(query)),
    holdingsSort,
  );
  const monthly = kpi("Month on month");
  const attention =
    props.today === undefined
      ? []
      : portfolioAttention({
          source: props.model.source,
          lastStatement: lastDate,
          today: props.today,
          pendingChange: props.pendingChange === true,
        });
  const grid = returnsGrid(
    dates,
    labels,
    months.map((month) => month.monthlyGainPercent),
  );

  return (
    <section aria-labelledby="overview-heading" class="dash portfolio-dashboard">
      <div class="card hero cell-4">
        <div class="hero-header">
          <h2 id="overview-heading" class="hero-context">
            As of {formatDateLong(lastDate)}
          </h2>
          <a class="hero-action" href="#import">
            <Icon name="import" size={18} /> Add statement
          </a>
        </div>
        <p class="hero-label">Total fund value</p>
        <p class="hero-value">
          <Amount cents={latestTotal.value} />
        </p>
        {monthly !== undefined && monthly.amount !== null && (
          <p class="hero-delta">
            <Signed cents={monthly.amount} />
            {monthly.percent !== null && <Pill ratio={monthly.percent} signed />}
            <span class="hero-delta-label">since the previous month</span>
          </p>
        )}
        <p class="hero-caption">Your funds, excluding account cash.</p>
        <div class="hero-gain">
          <p class="hero-label">Total gain</p>
          <p class="hero-sub">
            {gain !== undefined && (
              <>
                <Signed cents={gain.amount} />
                <Pill ratio={gain.percent} signed />
              </>
            )}
          </p>
        </div>
        <dl class="facts">
          <div>
            <dt>Net invested</dt>
            <dd>
              <Amount cents={latestTotal.invested} />
            </dd>
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
          fillHeight
          updateKey={props.range}
          title="Performance"
          note="Fund value against net invested. The chart period applies to this chart and to the small trends under Changes."
          controls={
            <RangeSelector
              label="Chart time range (charts only)"
              options={availableRanges(props.model.dates)}
              value={props.range}
              onChange={props.onRangeChange}
            />
          }
          description="Two lines over time: the value of all funds, and the cash invested in them, dashed."
          series={d.totalSeries}
          fillFirst
          formatTime={monthLabel}
          formatObservation={observationLabel(
            props.model.dates,
            props.model.labels,
            markers.map((marker) => marker.date),
          )}
          formatValue={euroLabel}
          formatAxisValue={euroAxisLabel}
          axisUnit="EUR"
          emptyMessage="There is nothing to plot yet."
        />
      </div>

      <section class="card period-results cell-4" aria-labelledby="changes-heading">
        <h3 id="changes-heading" class="card-title">
          Changes
        </h3>
        {STATS.map((stat) => {
          const entry = kpi(stat.label);
          return entry === undefined ? null : (
            <StatCard
              key={stat.label}
              kpi={entry}
              caption={stat.caption}
              unavailable={stat.unavailable}
              changeKey={props.range}
              trend={{ times: d.shownTimes, values: d.metricTrends[stat.metric] }}
            />
          );
        })}
        {props.model.estimated && <p class="footnote">Cash timing affects percentage estimates.</p>}
      </section>
      {attention.length > 0 && (
        <section class="cell-12 attention" aria-label="Needs attention">
          {attention.map((item) => (
            <p key={item.id} class="notice notice-warning" role="status">
              {item.message} <a href={item.href}>{item.action}</a>
            </p>
          ))}
        </section>
      )}
      <section class="portfolio-explore cell-12" aria-labelledby="portfolio-explore-heading">
        <h2 id="portfolio-explore-heading" class="visually-hidden">
          Explore your portfolio
        </h2>
        <div class="portfolio-explore-row">
          <PageNav
            items={[
              { id: "holdings-heading", label: "Holdings" },
              { id: "allocation-heading", label: "Allocation" },
              { id: "portfolio-analysis", label: "Trends and comparisons" },
            ]}
          />
          <span class="portfolio-links">
            <a class="portfolio-history-link" href="#months">
              <span>Month by month</span>
              <Icon name="chevron" size={18} />
            </a>
            <a class="portfolio-history-link" href="#checkpoints">
              <span>Checkpoints</span>
              <Icon name="chevron" size={18} />
            </a>
          </span>
        </div>
      </section>
      <HoldingsCard
        funds={funds}
        dates={dates}
        held={held}
        listedFunds={listedFunds}
        query={query}
        fundQuery={fundQuery}
        setFundQuery={setFundQuery}
        holdingsSort={holdingsSort}
        setHoldingsSort={setHoldingsSort}
        closedOpen={closedOpen}
        setClosedOpen={setClosedOpen}
        searchInput={searchInput}
        clearSearch={clearSearch}
        latestTotal={latestTotal}
        gain={gain}
        fundSeries={d.fundSeries}
        shownTimes={d.shownTimes}
        range={props.range}
      />

      <div class="cell-4 portfolio-rail">
        <AllocationCard slices={slices} />
        <MoversCard funds={held} />
      </div>

      <AnalysisSection
        model={props.model}
        range={props.range}
        bars={bars}
        fundSeries={d.fundSeries}
        ranking={ranking}
        grid={grid}
      />

      <Glossary kpis={kpis} />
    </section>
  );
}
