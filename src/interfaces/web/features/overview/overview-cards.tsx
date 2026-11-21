import { AnimatedFigure, formatFigureCount } from "../../presentation/animated-figure";
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { formatDateLong } from "../../../../core/values/iso-date";
import { formatPercent } from "../../../../core/values/percent";
import { type AllocationSlice } from "./model/dashboard-data";
import { Donut } from "../../presentation/charts/donut";
import { Sparkline } from "../../presentation/charts/sparkline";
import { Amount } from "../../presentation/privacy/privacy";
import { Icon } from "../../shared/ui/icons";
import type { OverviewFund, OverviewKpi } from "./model/overview-model";
import { Pill, Signed, tone } from "./parts";
import { GRID_MONTHS, type ReturnsGrid } from "./model/returns-grid";

/** One headline figure of the earlier spreadsheet's recap, with its own trend underneath. */
export function StatCard(props: {
  readonly kpi: OverviewKpi;
  readonly caption: string;
  /** Why the figure may be missing, said in plain words, so a dash is never a mystery. */
  readonly unavailable: string;
  readonly trend: { readonly times: readonly number[]; readonly values: readonly (number | null)[] };
  /** The chart period; a change reshapes this card's trend. The figure itself does not depend on the period. */
  readonly changeKey?: string;
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
        changeKey={props.changeKey}
      />
    </div>
  );
}

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
export function ReturnsCard(props: { readonly grid: ReturnsGrid; readonly estimated: boolean }): JSX.Element {
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
export function MoversCard(props: { readonly funds: readonly OverviewFund[] }): JSX.Element | null {
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

export function AllocationCard(props: { readonly slices: readonly AllocationSlice[] }): JSX.Element {
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
                  <AnimatedFigure
                    value={active === undefined ? props.slices.length : null}
                    text={active === undefined ? formatFigureCount(props.slices.length) : formatPercent(active.share)}
                    format={formatFigureCount}
                  />
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
                  <AnimatedFigure
                    class="legend-value"
                    value={slice.share}
                    text={formatPercent(slice.share)}
                    format={formatPercent}
                  />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function Glossary(props: { readonly kpis: readonly OverviewKpi[] }): JSX.Element {
  const { kpis } = props;
  return (
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
  );
}
