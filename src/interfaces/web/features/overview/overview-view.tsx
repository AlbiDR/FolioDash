import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { formatDateLong, type IsoDate } from "../../../../core/values/iso-date";
import { REPORTING_POLICY } from "../../../../core/portfolio/metrics";
import { formatPercent } from "../../../../core/values/percent";
import { availableRanges, type ChartRange } from "./model/chart-range";
import { RangeSelector } from "../../shared/ui/range-selector";
import { PageNav } from "../../shared/ui/page-nav";
import { type AllocationSlice, type MonthMetric, NO_MARKERS, dashboardFor } from "./model/dashboard-data";
import type { CheckpointMarker } from "../../../../core/portfolio/checkpoints";
import { Donut } from "../../presentation/charts/donut";
import { LineChart } from "../../presentation/charts/line-chart";
import { MonthlyBars } from "../../presentation/charts/monthly-bars";
import { PerformanceBars } from "../../presentation/charts/performance-bars";
import { Sparkline } from "../../presentation/charts/sparkline";
import { Amount } from "../../presentation/privacy/privacy";
import { Icon } from "../../shared/ui/icons";
import { euroLabel, monthLabel, observationLabel } from "./model/chart-data";
import type { OverviewFund, OverviewKpi, OverviewModel } from "./model/overview-model";
import { Percent, Pill, Signed, tone } from "./parts";
import { portfolioAttention } from "./model/attention";
import { GRID_MONTHS, type ReturnsGrid, returnsGrid } from "./model/returns-grid";
import {
  type HoldingsSort,
  type HoldingsSortKey,
  SORT_LABELS,
  describeSort,
  nextSort,
  sortHoldings,
} from "./model/holdings-sort";
import "./portfolio-feedback.css";

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
    <div class="stat">
      <p class="card-label">{kpi.label}</p>
      <p class={`stat-value ${kpi.signed ? tone(kpi.amount) : ""}`}>
        <Amount cents={kpi.amount} signed={kpi.signed} />
      </p>
      {kpi.amount === null ? (
        <p class="stat-caption">{props.unavailable}</p>
      ) : (
        <>
          {kpi.signed && kpi.percent !== null ? <Pill ratio={kpi.percent} signed /> : <span class="pill">-</span>}
          <p class="stat-caption">
            {kpi.comparedWith === undefined || kpi.comparedWith === null
              ? props.caption
              : `Since ${formatDateLong(kpi.comparedWith)}.`}
          </p>
        </>
      )}
      <Sparkline
        times={props.trend.times}
        values={props.trend.values}
        tone={kpi.signed ? tone(kpi.amount) : ""}
        width={220}
        height={52}
        area
      />
    </div>
  );
}

/** Desktop columns in reading order: the fund, what it is worth, its weight, then how it has done. */
const HOLDINGS_COLUMNS: readonly HoldingsSortKey[] = ["name", "value", "share", "gainPercent", "gain", "netInvested"];

/** The phone's list offers the orders people ask for, one choice instead of six headers. */
const PHONE_SORTS: readonly HoldingsSort[] = [
  { key: "name", direction: "asc" },
  { key: "value", direction: "desc" },
  { key: "share", direction: "desc" },
  { key: "gainPercent", direction: "desc" },
  { key: "gainPercent", direction: "asc" },
  { key: "gain", direction: "desc" },
  { key: "netInvested", direction: "desc" },
];

/** Below this many listed funds a table with sold funds stays one block; from here it is grouped. */
const GROUP_FROM = 6;

/** A search box is only worth its space once a list is long enough to need one. */
const SEARCH_FROM = 7;

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

/** The meaning of every figure, in plain words. The exact definitions stay one click further down. */
const GLOSSARY: readonly { readonly term: string; readonly meaning: string }[] = [
  {
    term: "Fund value",
    meaning: "What your funds are worth on the latest bank statement. Cash in the account is not included.",
  },
  { term: "Net invested", meaning: "Money you paid in, minus money you took out." },
  { term: "Gain", meaning: "Fund value minus net invested. It includes profit already made on funds you sold." },
  { term: "Month on month", meaning: "How much the gain changed since last month's statement." },
  { term: "Year to date", meaning: "How much the gain changed since this year's January statement." },
  { term: "Year on year", meaning: "Change since the same month last year." },
  { term: "Percentages", meaning: "A gain divided by net invested. They are not yearly rates." },
];

/** Keep allocation inspection local, so pointer movement does not rerender the other charts. */
/**
 * Month-on-month change by calendar year and month, as the sheet's matrix gives it, with each cell tinted by the size
 * of the move. The signed figure is always written in the cell, so the tint is only a quick read of where the big
 * months were. It appears once the history spans two calendar years, where a row of months is no longer the bars above.
 */
function ReturnsCard(props: { readonly grid: ReturnsGrid; readonly estimated: boolean }): JSX.Element {
  const { grid } = props;
  return (
    <div class="card cell-12 returns-card">
      <h3 id="returns-heading" class="card-title">
        Monthly returns
      </h3>
      <p class="card-subtitle">
        Change since the previous statement, by calendar year and month. A darker cell is a larger move.
      </p>
      <div class="table-scroll flat" role="region" aria-labelledby="returns-heading" tabIndex={0}>
        <table class="returns-table">
          <thead>
            <tr>
              <th scope="col" class="returns-year">
                Year
              </th>
              {GRID_MONTHS.map((month) => (
                <th key={month} scope="col">
                  {month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.year}>
                <th scope="row" class="returns-year">
                  {row.year}
                </th>
                {row.cells.map((cell, index) => (
                  <td
                    key={GRID_MONTHS[index]}
                    class="returns-cell"
                    data-tone={cell === null || cell === 0 ? "none" : cell > 0 ? "gain" : "loss"}
                    style={
                      cell === null || grid.largest === 0
                        ? undefined
                        : { "--heat": String(Math.min(1, Math.abs(cell) / grid.largest)) }
                    }
                  >
                    {cell === null ? <span class="empty">-</span> : formatPercent(cell, { signed: true })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {props.estimated && <p class="footnote">Cash timing affects percentage estimates.</p>}
    </div>
  );
}

/** How many funds the card names: enough to say what drove the month, few enough to read at a glance. */
const MOVERS_SHOWN = 3;

/**
 * The funds that changed most since the previous statement, by the size of their change. It only orders figures the
 * model already holds; a fund with no previous statement has no month-on-month change and is left out.
 */
function MoversCard(props: { readonly funds: readonly OverviewFund[] }): JSX.Element | null {
  const movers = props.funds
    .filter((fund) => fund.latest?.monthlyGain !== null && fund.latest?.monthlyGain !== undefined)
    .sort((a, b) => Math.abs(Number(b.latest?.monthlyGain ?? 0)) - Math.abs(Number(a.latest?.monthlyGain ?? 0)))
    .slice(0, MOVERS_SHOWN);
  if (movers.length === 0) return null;
  return (
    <section class="card movers-card" aria-labelledby="movers-heading">
      <h3 id="movers-heading" class="card-title">
        What moved
      </h3>
      <p class="card-subtitle">Largest changes since the previous statement.</p>
      <ul class="movers">
        {movers.map((fund) => (
          <li key={fund.isin}>
            <a class="mover" href={`#fund/${fund.isin}`}>
              <span class="mover-name">{fund.name}</span>
              <span class="mover-figures">
                <Signed cents={fund.latest?.monthlyGain ?? null} />
                <Pill ratio={fund.latest?.monthlyGainPercent ?? null} signed />
              </span>
              <Icon name="chevron" size={18} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AllocationCard(props: { readonly slices: readonly AllocationSlice[] }): JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const active = props.slices.find((slice) => slice.isin === (hovered ?? focused));
  function focusSlice(id: string | null): void {
    setFocused(id);
    if (id !== null) setHovered(null);
  }
  return (
    <div class="card allocation-card">
      <h3 id="allocation-heading" class="card-title" tabIndex={-1}>
        Allocation
      </h3>
      <p class="card-subtitle">Share of total fund value. Select a fund to explore.</p>
      {props.slices.length === 0 ? (
        <p class="empty-note">No fund is held.</p>
      ) : (
        <>
          <Donut
            label="Share of the portfolio by fund"
            slices={props.slices.map((slice) => ({
              id: slice.isin,
              label: slice.name,
              value: slice.value,
              href: `#fund/${slice.isin}`,
              description: `${slice.name}: ${formatPercent(slice.share)}. View fund.`,
            }))}
            activeId={active?.isin ?? null}
            onHover={setHovered}
            onFocus={focusSlice}
            centre={
              <>
                <span class="donut-number">
                  {active === undefined ? props.slices.length : formatPercent(active.share)}
                </span>
                <span class="donut-caption">
                  {active === undefined ? (props.slices.length === 1 ? "fund" : "funds") : "of portfolio"}
                </span>
              </>
            }
          />
          <ul class="legend" data-inspecting={active !== undefined}>
            {props.slices.map((slice, index) => (
              <li key={slice.isin}>
                <a
                  href={`#fund/${slice.isin}`}
                  data-active={active?.isin === slice.isin}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== "touch") setHovered(slice.isin);
                  }}
                  onPointerLeave={() => {
                    setHovered(null);
                  }}
                  onFocus={() => {
                    focusSlice(slice.isin);
                  }}
                  onBlur={() => {
                    focusSlice(null);
                  }}
                >
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
  );
}

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
  /** Long lists with funds you have sold read as two blocks, each with its count; a short list stays one table. */
  const heldListed = listedFunds.filter((fund) => fund.status !== "closed");
  const closedListed = listedFunds.filter((fund) => fund.status === "closed");
  const grouped = listedFunds.length >= GROUP_FROM && heldListed.length > 0 && closedListed.length > 0;
  /** The bars compare each fund with the largest holding, so a long list still reads; the percentage beside each carries the exact share. */
  const largestShare = Math.max(0, ...held.map((fund) => fund.latest?.share ?? 0));
  /** A fund's value across the chart's period, for the small line under its value. It needs two statements to be a line. */
  const trendOf = (isin: string): readonly (number | null)[] | null => {
    const values = d.fundSeries.find((series) => series.id === isin)?.points.map((point) => point.value) ?? [];
    return values.filter((value) => value !== null).length >= 2 ? values : null;
  };

  const holdingRow = (fund: OverviewFund): JSX.Element => (
    <tr key={fund.isin} class={fund.status === "closed" ? "closed" : ""}>
      <th scope="row">
        <a href={`#fund/${fund.isin}`} class="stretched">
          {fund.name}
        </a>
        <span class="holding-meta">{fund.status === "closed" ? "Closed" : fund.isin}</span>
      </th>
      <td>
        <Amount cents={fund.latest?.value ?? null} />
        {trendOf(fund.isin) !== null && (
          <Sparkline times={d.shownTimes} values={trendOf(fund.isin) ?? []} width={96} height={24} />
        )}
      </td>
      <td>
        {fund.status === "closed" ? (
          "-"
        ) : (
          <>
            <Percent ratio={fund.latest?.share ?? null} />
            {fund.latest?.share !== null && fund.latest?.share !== undefined && (
              <span class="share-bar" aria-hidden="true">
                <span
                  style={{
                    inlineSize: `${(largestShare > 0 ? Math.min(1, Math.max(0, fund.latest.share) / largestShare) * 100 : 0).toFixed(2)}%`,
                  }}
                />
              </span>
            )}
          </>
        )}
      </td>
      <td>
        <Pill ratio={fund.latest?.gainPercent ?? null} signed />
      </td>
      <td>
        <Signed cents={fund.latest?.gain ?? null} />
      </td>
      <td>
        <Amount cents={fund.latest?.netInvested ?? null} />
      </td>
    </tr>
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
      <div class="card cell-8 portfolio-holdings">
        <h3 id="holdings-heading" class="card-title" tabIndex={-1}>
          Holdings
        </h3>
        <p class="card-subtitle">
          Latest statement. Select a fund to see its performance and history. Share bars compare each fund with your
          largest holding.
        </p>
        {funds.length >= SEARCH_FROM && (
          <div class="field fund-search">
            <label for="fund-search">Find a fund</label>
            <div class="fund-search-controls">
              <input
                ref={searchInput}
                id="fund-search"
                type="search"
                placeholder="Name or ISIN"
                value={fundQuery}
                onInput={(event) => {
                  setFundQuery(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && fundQuery !== "") {
                    event.preventDefault();
                    event.stopPropagation();
                    clearSearch();
                  }
                }}
                aria-describedby="fund-search-help"
              />
              <button class="quiet-action" type="button" disabled={fundQuery === ""} onClick={clearSearch}>
                Clear search
              </button>
            </div>
            <p id="fund-search-help" class="hint" role="status" aria-atomic="true">
              <span key={listedFunds.length} class="filter-count">
                {listedFunds.length} of {funds.length} funds.
              </span>{" "}
              Filters holdings and recent fund history.
            </p>
          </div>
        )}
        {funds.length > 1 && (
          <div class="field holdings-sort-mobile">
            <label for="holdings-sort">Sort holdings</label>
            <select
              id="holdings-sort"
              value={holdingsSort === null ? "" : `${holdingsSort.key}:${holdingsSort.direction}`}
              onChange={(event) => {
                const [key, direction] = event.currentTarget.value.split(":");
                setHoldingsSort(
                  key === undefined || key === ""
                    ? null
                    : { key: key as HoldingsSortKey, direction: direction === "asc" ? "asc" : "desc" },
                );
              }}
            >
              <option value="">{describeSort(null)}</option>
              {PHONE_SORTS.map((sort) => (
                <option key={`${sort.key}:${sort.direction}`} value={`${sort.key}:${sort.direction}`}>
                  {describeSort(sort)}
                </option>
              ))}
            </select>
          </div>
        )}
        <p class="visually-hidden" role="status" aria-atomic="true">
          {holdingsSort === null ? "" : `Holdings sorted by ${describeSort(holdingsSort)}.`}
        </p>
        {funds.length > 0 && listedFunds.length === 0 && (
          <p class="empty-note search-empty">No funds match. Try another name or ISIN.</p>
        )}
        <ul class="mobile-holdings" data-filtered={query.length > 0}>
          {listedFunds.map((fund) => (
            <li key={fund.isin}>
              <a href={`#fund/${fund.isin}`} class="holding">
                <span class="holding-id">
                  <span class="holding-name">{fund.name}</span>
                  <span class="holding-meta">{fund.status === "closed" ? `Closed · ${fund.isin}` : fund.isin}</span>
                </span>
                <span class="holding-headline">
                  <span class="holding-value">
                    <span class="visually-hidden">Value </span>
                    <Amount cents={fund.latest?.value ?? null} />
                  </span>
                  <span>
                    <span class="visually-hidden">Gain percent </span>
                    <Pill ratio={fund.latest?.gainPercent ?? null} signed />
                  </span>
                </span>
                <Icon name="chevron" size={18} />
                <span class="holding-detail">
                  <span class="holding-fact">
                    <span class="holding-label">Gain</span>
                    <Signed cents={fund.latest?.gain ?? null} />
                  </span>
                  <span class="holding-fact">
                    <span class="holding-label">Net invested</span>
                    <Amount cents={fund.latest?.netInvested ?? null} />
                  </span>
                  <span class="holding-fact">
                    <span class="holding-label">Share of portfolio</span>
                    {fund.status === "closed" ? "-" : <Percent ratio={fund.latest?.share ?? null} />}
                  </span>
                </span>
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
                  {HOLDINGS_COLUMNS.map((key) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={
                        holdingsSort?.key === key
                          ? holdingsSort.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        class="sort-button"
                        onClick={() => {
                          setHoldingsSort(nextSort(holdingsSort, key));
                        }}
                      >
                        {SORT_LABELS[key]}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              {grouped ? (
                <>
                  <tbody id="holdings-held-rows">
                    <tr class="holdings-group">
                      <th colSpan={6} scope="colgroup">
                        Held funds <span class="holdings-group-count">{heldListed.length}</span>
                      </th>
                    </tr>
                    {heldListed.map(holdingRow)}
                  </tbody>
                  <tbody id="holdings-closed-rows">
                    <tr class="holdings-group closed-group">
                      <th colSpan={6} scope="colgroup">
                        <button
                          type="button"
                          class="group-toggle"
                          aria-expanded={closedOpen}
                          aria-controls="holdings-closed-rows"
                          onClick={() => {
                            setClosedOpen(!closedOpen);
                          }}
                        >
                          <Icon name="chevron" size={16} />
                          Closed funds <span class="holdings-group-count">{closedListed.length}</span>
                        </button>
                      </th>
                    </tr>
                    {closedOpen && closedListed.map(holdingRow)}
                  </tbody>
                </>
              ) : (
                <tbody>{listedFunds.map(holdingRow)}</tbody>
              )}
              {/* The portfolio's own totals, the same figures as the headline, so the rows and the total can be checked against each other. A filter hides them rather than showing a sum of part of the list. */}
              <tfoot>
                {query === "" ? (
                  <tr class="holdings-total">
                    <th scope="row">
                      Total<span class="holding-meta">All funds</span>
                    </th>
                    <td>
                      <Amount cents={latestTotal.value} />
                    </td>
                    <td>
                      <Percent ratio={held.length > 0 ? 1 : null} />
                    </td>
                    <td>
                      <Pill ratio={gain?.percent ?? null} signed />
                    </td>
                    <td>
                      <Signed cents={gain?.amount ?? null} />
                    </td>
                    <td>
                      <Amount cents={latestTotal.invested} />
                    </td>
                  </tr>
                ) : (
                  <tr class="holdings-total">
                    <td colSpan={6}>Totals cover every fund. Clear the search to see them.</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
        {listedFunds.length > 0 && (
          <div class="more recent-fund-history">
            <details>
              <summary>
                <span>
                  Recent fund history
                  <span class="disclosure-description">Value and net invested for up to three recent statements.</span>
                </span>
              </summary>
              {listedFunds.map((fund) => (
                <section key={fund.isin} class="recent-fund-history-group" aria-label={`${fund.name} recent history`}>
                  <h4>{fund.name}</h4>
                  <div
                    class="table-scroll flat"
                    role="region"
                    aria-label={`${fund.name} recent statement values`}
                    tabIndex={0}
                  >
                    <table class="holdings-table statement-table">
                      <thead>
                        <tr>
                          <th scope="col">Statement</th>
                          <th scope="col">Value</th>
                          <th scope="col">Net invested</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dates.slice(-3).map((date, offset) => {
                          const index = Math.max(0, dates.length - 3) + offset;
                          return (
                            <tr key={date}>
                              <th scope="row">{formatDateLong(date)}</th>
                              <td>
                                <Amount cents={fund.values[index] ?? null} />
                              </td>
                              <td>
                                <Amount cents={fund.netInvested[index] ?? null} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
              <a class="row-link plain" href="#months">
                <span>Compare all statements</span>
                <Icon name="chevron" size={18} />
              </a>
            </details>
          </div>
        )}
      </div>

      <div class="cell-4 portfolio-rail">
        <AllocationCard slices={slices} />
        <MoversCard funds={held} />
      </div>

      <section class="cell-12 dashboard-analysis" aria-labelledby="portfolio-analysis">
        <h2 id="portfolio-analysis" class="card-title" tabIndex={-1}>
          Trends and comparisons
        </h2>
        <p class="card-subtitle">Monthly movement, fund performance and the data behind your portfolio.</p>
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

          <div class="cell-6">
            <LineChart
              id="funds-chart"
              updateKey={props.range}
              title="Value of each fund"
              subtitle="Solid line: a fund's value. Dotted line, same colour: what you have put into it. A gap means it was not held that month."
              description="One solid line per fund showing its value over time, and a faint dotted line in the same colour for the money invested in it. A fund that was not held leaves a gap."
              series={d.fundSeries}
              formatTime={monthLabel}
              formatObservation={observationLabel(props.model.dates, props.model.labels)}
              formatValue={euroLabel}
              emptyMessage="No fund has a value to plot yet."
            />
          </div>

          {grid.rows.length >= 2 && <ReturnsCard grid={grid} estimated={props.model.estimated} />}

          <div class="card cell-8">
            <h3 class="card-title">Gain by fund</h3>
            <p class="card-subtitle">Gain as a percentage of what you put in. Not a yearly rate.</p>
            {ranking.length === 0 ? (
              <p class="empty-note">No fund has a percentage to rank yet.</p>
            ) : (
              <PerformanceBars
                rows={ranking.map((fund) => ({
                  key: fund.isin,
                  href: `#fund/${fund.isin}`,
                  label: fund.name,
                  ratio: fund.percent,
                  dim: fund.closed,
                }))}
              />
            )}
            <p class="footnote">Funds you have sold are dimmed.</p>
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
          </div>
        </div>
      </section>

      <div class="more cell-12">
        <details class="dashboard-glossary">
          <summary>What the numbers mean</summary>
          <dl class="glossary">
            {GLOSSARY.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>{entry.meaning}</dd>
              </div>
            ))}
          </dl>
          <h3 class="glossary-subheading">Exact definitions</h3>
          <dl class="glossary">
            {kpis.map((entry) => (
              <div key={entry.label}>
                <dt>{entry.label}</dt>
                <dd>{entry.note}</dd>
              </div>
            ))}
          </dl>
          <p class="hint">
            These follow the definitions of the earlier spreadsheet so the results can be compared with it. A dash means
            the figure cannot be calculated from the statements recorded.
          </p>
        </details>
      </div>
    </section>
  );
}
