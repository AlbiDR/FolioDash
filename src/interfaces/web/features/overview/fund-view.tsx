import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { availableRanges, type ChartRange, rangeStart } from "./chart-range";
import { RangeSelector } from "../../shared/ui/range-selector";
import { LineChart } from "../../presentation/charts/line-chart";
import type { ChartSeries } from "../../presentation/charts/line-chart-geometry";
import { Amount } from "../../presentation/privacy/privacy";
import { euroLabel, euros, monthLabel, observationLabel, utcTime } from "./chart-data";
import type { OverviewModel } from "./overview-model";
import { Percent, Pill, Signed } from "./parts";
import { Icon } from "../../shared/ui/icons";
import { formatDateLong, type IsoDate } from "../../../../core/iso-date";
import type { EuroCents } from "../../../../core/money";

/** Statements shown before the rest go behind a disclosure, so a long history does not push the page's end away. */
const HISTORY_RECENT = 12;

function HistoryTable(props: {
  readonly rows: readonly {
    readonly date: IsoDate;
    readonly value: EuroCents | null;
    readonly netInvested: EuroCents | null;
  }[];
  readonly label: string;
}): JSX.Element {
  return (
    <div class="table-scroll flat" role="region" aria-label={props.label} tabIndex={0}>
      <table class="holdings-table statement-table">
        <thead>
          <tr>
            <th scope="col">Statement</th>
            <th scope="col">Value</th>
            <th scope="col">Net invested</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.date}>
              <th scope="row">{formatDateLong(row.date)}</th>
              <td>
                <Amount cents={row.value} />
              </td>
              <td>
                <Amount cents={row.netInvested} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One fund: its value and net invested over time, and its latest figures, on the shared time range. */
export function FundView(props: {
  readonly model: OverviewModel;
  readonly isin: string;
  readonly range: ChartRange;
  readonly onRangeChange: (range: ChartRange) => void;
}): JSX.Element {
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
        <div class="card">
          <h2 id="fund-heading" class="card-title">
            Fund not found
          </h2>
          <p>No fund with that identifier is in the ledger.</p>
        </div>
      </section>
    );
  }

  const { dates } = props.model;
  const start = rangeStart(dates, props.range);
  const shown = dates.slice(start);
  const series: ChartSeries[] = [
    {
      id: "value",
      label: "Value",
      points: shown.map((date, index) => ({ time: utcTime(date), value: euros(fund.values[start + index] ?? null) })),
    },
    {
      id: "invested",
      label: "Net invested",
      dashed: true,
      points: shown.map((date, index) => ({
        time: utcTime(date),
        value: euros(fund.netInvested[start + index] ?? null),
      })),
    },
  ];
  const latest = fund.latest;
  const rows = dates
    .map((date, index) => ({ date, value: fund.values[index] ?? null, netInvested: fund.netInvested[index] ?? null }))
    .filter((row) => row.value !== null)
    .reverse();
  const recent = rows.slice(0, HISTORY_RECENT);
  const earlier = rows.slice(HISTORY_RECENT);
  const oldest = earlier.at(-1)?.date;

  return (
    <div class="dash">
      <div class="card hero fund-hero cell-12">
        <div class="hero-header">
          <p class="hero-context isin-code">{fund.isin}</p>
          <button
            class="hero-action"
            type="button"
            disabled={copying}
            onClick={() => {
              void copyIsin(fund.isin);
            }}
          >
            {copying ? "Copying…" : copyFeedback?.isin === fund.isin && copyFeedback.ok ? "Copied" : "Copy ISIN"}
          </button>
        </div>
        <p class="copy-feedback" role="status" aria-atomic="true">
          {copying
            ? "Copying ISIN…"
            : copyFeedback?.isin === fund.isin && (
                <span key={copyFeedback.message} class={copyFeedback.ok ? "visually-hidden" : "copy-result"}>
                  {copyFeedback.message}
                </span>
              )}
        </p>
        <dl class="fund-figures">
          <div class="fund-figure fund-figure-main">
            <dt class="hero-label">Value</dt>
            <dd class="hero-value">
              <Amount cents={latest?.value ?? null} />
            </dd>
          </div>
          <div class="fund-figure">
            <dt class="hero-label">Gain{fund.status === "closed" ? " · closed" : ""}</dt>
            <dd class="hero-sub">
              <Signed cents={latest?.gain ?? null} />
              <Pill ratio={latest?.gainPercent ?? null} signed />
            </dd>
          </div>
          <div class="fund-figure">
            <dt class="hero-label">Net invested</dt>
            <dd class="hero-sub">
              <Amount cents={latest?.netInvested ?? null} />
            </dd>
          </div>
          <div class="fund-figure">
            <dt class="hero-label">Share of portfolio</dt>
            <dd class="hero-sub">
              <Percent ratio={latest?.share ?? null} />
            </dd>
          </div>
          <div class="fund-figure">
            <dt class="hero-label">Month on month</dt>
            <dd class="hero-sub">
              <Signed cents={latest?.monthlyGain ?? null} />
              <Pill ratio={latest?.monthlyGainPercent ?? null} signed />
            </dd>
          </div>
        </dl>
        <p class="hero-caption">Net invested is cash in minus cash out. Gain % is measured against it.</p>
      </div>
      <div class="cell-12">
        <LineChart
          id="fund-chart"
          updateKey={props.range}
          title="Performance"
          note="Value and net invested for this fund. The chart period changes the chart, not your latest figures."
          controls={
            <RangeSelector
              label="Chart time range (charts only)"
              options={availableRanges(props.model.dates)}
              value={props.range}
              onChange={props.onRangeChange}
            />
          }
          description="Two lines over time for this fund: its value, and the cash invested in it, dashed."
          series={series}
          fillFirst
          formatTime={monthLabel}
          formatObservation={observationLabel(props.model.dates, props.model.labels)}
          formatValue={euroLabel}
          emptyMessage="This fund has no value to plot yet."
        />
      </div>
      <section class="card cell-12 fund-history" aria-labelledby="fund-history-heading">
        <h2 id="fund-history-heading" class="card-title">
          Statement history
        </h2>
        <p class="card-subtitle">Value and net invested at each statement where this fund was held, newest first.</p>
        {rows.length === 0 ? (
          <p class="empty-note">This fund has no statements yet.</p>
        ) : (
          <>
            <HistoryTable rows={recent} label={`${fund.name} recent statement values`} />
            {earlier.length > 0 && (
              <div class="more">
                <details>
                  <summary>
                    Earlier statements
                    <span class="disclosure-description">
                      {earlier.length} more{oldest === undefined ? "" : `, back to ${formatDateLong(oldest)}`}.
                    </span>
                  </summary>
                  <HistoryTable rows={earlier} label={`${fund.name} earlier statement values`} />
                </details>
              </div>
            )}
          </>
        )}
        <a class="row-link plain" href="#months">
          <span>Compare all statements month by month</span>
          <Icon name="chevron" size={18} />
        </a>
      </section>
    </div>
  );
}
