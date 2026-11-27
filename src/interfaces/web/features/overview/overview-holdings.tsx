import type { JSX, RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { formatDateLong } from "../../../../core/values/iso-date";
import { Icon } from "../../shared/ui/icons";
import { useLeavingRows } from "../../shared/motion/leaving-rows";
import { useRowGlide } from "../../shared/ui/use-row-glide";
import { MobileHoldings } from "./mobile-holdings";
import { Sparkline } from "../../presentation/charts/sparkline";
import { Amount } from "../../presentation/privacy/privacy";
import type { ChartRange } from "./model/chart-range";
import type { dashboardFor } from "./model/dashboard-data";
import type { OverviewFund, OverviewKpi, OverviewModel } from "./model/overview-model";
import { Percent, Pill, Signed } from "./parts";
import {
  HOLDINGS_COLUMNS,
  PHONE_SORTS,
  type HoldingsSort,
  type HoldingsSortKey,
  SORT_LABELS,
  describeSort,
  nextSort,
} from "./model/holdings-sort";

/** Below this many listed funds a table with sold funds stays one block; from here it is grouped. */
const GROUP_FROM = 6;

/** A search box is only worth its space once a list is long enough to need one. */
const SEARCH_FROM = 7;

/** The rows a re-sort moves: desktop holdings rows (not the grouped headers, totals or statement tables) and phone list items. */
const GLIDING_ROWS =
  ".holdings-table:not(.statement-table) > tbody > tr:not(.holdings-group), .holdings-table:not(.statement-table) > tfoot > tr, .mobile-holdings > li";

export function HoldingsCard(props: {
  readonly funds: readonly OverviewFund[];
  readonly dates: OverviewModel["dates"];
  readonly held: readonly OverviewFund[];
  readonly listedFunds: readonly OverviewFund[];
  readonly query: string;
  readonly fundQuery: string;
  readonly setFundQuery: (query: string) => void;
  readonly holdingsSort: HoldingsSort | null;
  readonly setHoldingsSort: (sort: HoldingsSort | null) => void;
  readonly closedOpen: boolean;
  readonly setClosedOpen: (open: boolean) => void;
  readonly searchInput: RefObject<HTMLInputElement | null>;
  readonly clearSearch: () => void;
  readonly latestTotal: OverviewModel["totals"][number];
  readonly gain: OverviewKpi | undefined;
  readonly fundSeries: ReturnType<typeof dashboardFor>["fundSeries"];
  readonly shownTimes: ReturnType<typeof dashboardFor>["shownTimes"];
  /** The chart period; a change reshapes each fund's trend beneath its value. */
  readonly range: ChartRange;
}): JSX.Element {
  const {
    funds,
    dates,
    held,
    listedFunds,
    query,
    fundQuery,
    setFundQuery,
    holdingsSort,
    setHoldingsSort,
    closedOpen,
    setClosedOpen,
    searchInput,
    clearSearch,
    latestTotal,
    gain,
  } = props;
  const card = useRef<HTMLDivElement>(null);
  // Funds not listed in the previous render are new in this one (a search returned them, or the closed block opened).
  // Only they fade in; a row that stays keeps its element and is never re-faded.
  const listedBefore = useRef<ReadonlySet<string> | null>(null);
  const fresh: ReadonlySet<string> =
    listedBefore.current === null
      ? new Set()
      : new Set(listedFunds.filter((fund) => !listedBefore.current?.has(fund.isin)).map((fund) => fund.isin));
  useLayoutEffect(() => {
    listedBefore.current = new Set(listedFunds.map((fund) => fund.isin));
  });
  // Surviving keyed rows also glide when a search or the closed-fund fold changes their positions. New rows draw
  // immediately; their figures are never tweened. The shared controller carries an interrupted glide forward.
  /** Long lists with funds you have sold read as two blocks, each with its count; a short list stays one table. */
  const heldListed = listedFunds.filter((fund) => fund.status !== "closed");
  const closedListed = listedFunds.filter((fund) => fund.status === "closed");
  // Rows that leave (a search no longer matches them, or the closed block folds) stay while they fade, then the rows
  // below glide up. The table and the phone list are separate sets, so each keeps its own.
  const grouped = funds.length >= GROUP_FROM && held.length > 0 && funds.some((fund) => fund.status === "closed");
  const tableFunds = grouped ? [...heldListed, ...(closedOpen ? closedListed : [])] : listedFunds;
  const table = useLeavingRows(tableFunds, (fund) => fund.isin);
  const phone = useLeavingRows(listedFunds, (fund) => fund.isin);
  const leavingIn = (rows: typeof table.rows): ReadonlySet<string> =>
    new Set(rows.filter((row) => row.leaving).map((row) => row.item.isin));
  const leaving = leavingIn(table.rows);
  const tableHeld = table.rows.filter((row) => row.item.status !== "closed").map((row) => row.item);
  const tableClosed = table.rows.filter((row) => row.item.status === "closed").map((row) => row.item);
  useRowGlide(card, GLIDING_ROWS, JSON.stringify([holdingsSort, query, closedOpen, table.version, phone.version]));
  // Keep the table's groups stable while searching, so a surviving fund keeps its keyed row and keyboard target.
  // A group with no matches has no heading; the existing empty-result message covers a completely empty search.
  /** The bars compare each fund with the largest holding, so a long list still reads; the percentage beside each carries the exact share. */
  const largestShare = Math.max(0, ...held.map((fund) => fund.latest?.share ?? 0));
  /** A fund's value across the chart's period, for the small line under its value. It needs two statements to be a line. */
  const trendOf = (isin: string): readonly (number | null)[] | null => {
    const values = props.fundSeries.find((series) => series.id === isin)?.points.map((point) => point.value) ?? [];
    return values.filter((value) => value !== null).length >= 2 ? values : null;
  };

  const holdingRow = (fund: OverviewFund): JSX.Element => (
    <tr
      key={fund.isin}
      class={`${fund.status === "closed" ? "closed" : ""}${fresh.has(fund.isin) ? " holding-new" : ""}${leaving.has(fund.isin) ? " row-leaving" : ""}`.trim()}
      inert={leaving.has(fund.isin)}
      aria-hidden={leaving.has(fund.isin) ? true : undefined}
    >
      <th scope="row">
        <a href={`#fund/${fund.isin}`} class="stretched">
          {fund.name}
        </a>
        <span class="holding-meta">{fund.status === "closed" ? "Closed" : fund.isin}</span>
      </th>
      <td>
        <Amount cents={fund.latest?.value ?? null} />
        {trendOf(fund.isin) !== null && (
          <Sparkline
            times={props.shownTimes}
            values={trendOf(fund.isin) ?? []}
            width={96}
            height={24}
            changeKey={props.range}
          />
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
    <div class="card cell-8 portfolio-holdings" ref={card}>
      <div class="portfolio-card-heading">
        <h3 id="holdings-heading" class="card-title" tabIndex={-1}>
          Holdings
        </h3>
        <span class="portfolio-count">{held.length} held</span>
      </div>
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
      <MobileHoldings funds={phone.rows.map((row) => row.item)} fresh={fresh} leaving={leavingIn(phone.rows)} />
      {funds.length === 0 ? (
        <p class="empty-note">No funds are held.</p>
      ) : (
        <div class="table-scroll flat desktop-holdings" role="region" aria-label="Fund holdings" tabIndex={0}>
          <table class="holdings-table">
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
                  {heldListed.length > 0 && (
                    <tr class="holdings-group">
                      <th colSpan={6} scope="colgroup">
                        Held funds <span class="holdings-group-count">{heldListed.length}</span>
                      </th>
                    </tr>
                  )}
                  {tableHeld.map(holdingRow)}
                </tbody>
                <tbody id="holdings-closed-rows">
                  {closedListed.length > 0 && (
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
                  )}
                  {tableClosed.map(holdingRow)}
                </tbody>
              </>
            ) : (
              <tbody>{table.rows.map((row) => holdingRow(row.item))}</tbody>
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
  );
}
