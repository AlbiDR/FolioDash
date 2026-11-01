import type { JSX } from "preact";
import { type IsoDate, formatDateLong, formatMonthShort, formatMonthYear, toIsoDate } from "../../../../core/IsoDate";
import { type EuroCents, formatEuro, toEuroCents } from "../../../../core/Money";
import { formatPercent } from "../../../../core/Percent";
import { LineChart } from "../../shared/charts/LineChart";
import { Amount } from "../../shared/privacy/privacy";
import type { ChartSeries } from "../../shared/charts/lineChartGeometry";
import type { OverviewKpi, OverviewModel } from "./OverviewModel";

function utcTime(date: IsoDate): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function monthLabel(time: number): string {
  const moment = new Date(time);
  const date = toIsoDate(moment.getUTCFullYear(), moment.getUTCMonth() + 1, moment.getUTCDate());
  return date === null ? "" : formatMonthShort(date);
}

function euroLabel(value: number): string {
  const cents = toEuroCents(Math.round(value * 100));
  return cents === null ? "" : formatEuro(cents);
}

function euros(cents: EuroCents | null): number | null {
  return cents === null ? null : cents / 100;
}

/** A gain or loss reads as one in text too (the sign), so colour is never the only cue. */
function tone(value: number | null): string {
  return value === null || value === 0 ? "" : value > 0 ? "gain" : "loss";
}

function Kpi(props: { readonly kpi: OverviewKpi }): JSX.Element {
  const { kpi } = props;
  return (
    <div class="kpi">
      <dt>{kpi.label}</dt>
      <dd class={kpi.signed ? tone(kpi.amount) : ""}>
        <span class="kpi-amount">
          <Amount cents={kpi.amount} signed={kpi.signed} />
        </span>
        {kpi.signed && kpi.percent !== null && (
          <span class="kpi-percent">{formatPercent(kpi.percent, { signed: true })}</span>
        )}
      </dd>
    </div>
  );
}

/** The five headline figures of the earlier spreadsheet's monthly recap, in its order. */
const HEADLINE = ["Fund value", "Current gain", "Month on month", "Year to date", "Year on year"];
const SHORT_LABEL: Readonly<Record<string, string>> = { "Month on month": "MoM", "Year to date": "YtD", "Year on year": "YoY" };

function Signed(props: { readonly cents: EuroCents | null }): JSX.Element {
  return (
    <span class={tone(props.cents)}>
      <Amount cents={props.cents} signed />
    </span>
  );
}

function Percent(props: { readonly ratio: number | null; readonly signed?: boolean }): JSX.Element {
  return (
    <span class={props.signed === true ? tone(props.ratio) : ""}>
      {formatPercent(props.ratio, props.signed === true ? { signed: true } : {})}
    </span>
  );
}

export function OverviewView(props: { readonly model: OverviewModel }): JSX.Element {
  const { dates, funds, totals, kpis, months } = props.model;
  const latestTotal = totals[totals.length - 1];
  const lastDate = dates[dates.length - 1];

  if (dates.length === 0 || latestTotal === undefined || lastDate === undefined) {
    return (
      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading">Overview</h2>
        <p>
          No statements have been imported yet. Import your first bank statement to see your portfolio here.
        </p>
      </section>
    );
  }

  const headline = HEADLINE.flatMap((label) => {
    const kpi = kpis.find((entry) => entry.label === label);
    return kpi === undefined ? [] : [{ ...kpi, label: SHORT_LABEL[label] ?? label }];
  });
  const monthly = kpis.find((entry) => entry.label === "Month on month")?.amount ?? null;

  const totalSeries: ChartSeries[] = [
    {
      id: "value",
      label: "Portfolio value",
      points: dates.map((date, index) => ({ time: utcTime(date), value: euros(totals[index]?.value ?? null) })),
    },
    {
      id: "invested",
      label: "Net invested",
      dashed: true,
      points: dates.map((date, index) => ({ time: utcTime(date), value: euros(totals[index]?.invested ?? null) })),
    },
  ];
  const fundSeries: ChartSeries[] = funds.map((fund) => ({
    id: fund.isin,
    label: fund.name,
    points: dates.map((date, index) => ({ time: utcTime(date), value: euros(fund.values[index] ?? null) })),
  }));

  return (
    <section aria-labelledby="overview-heading" class="overview">
      <h2 id="overview-heading">{formatMonthYear(lastDate)} · Fund review</h2>
      <dl class="kpis">
        {headline.map((kpi) => (
          <Kpi key={kpi.label} kpi={kpi} />
        ))}
      </dl>
      <p class="hint">
        As of {formatDateLong(lastDate)}
        {monthly !== null && monthly !== 0 && (
          <>
            {" "}
            · Gain {monthly > 0 ? "rose" : "fell"} by <Amount cents={(Math.abs(monthly) as EuroCents)} /> since the previous statement
          </>
        )}
        .
        {props.model.estimated &&
          " Percentages that depend on when you moved cash are estimates, and none of them is annualised."}
      </p>

      <h3 id="funds-heading">Funds</h3>
      {funds.length === 0 ? (
        <p>No funds are held.</p>
      ) : (
        <div class="table-scroll">
          <table class="funds" aria-labelledby="funds-heading">
            <thead>
              <tr>
                <th scope="col">Fund</th>
                <th scope="col">Value</th>
                <th scope="col">Net invested</th>
                <th scope="col">Gain €</th>
                <th scope="col">Gain %</th>
                <th scope="col">MoM €</th>
                <th scope="col">MoM %</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((fund) => (
                <tr key={fund.isin} class={fund.status === "closed" ? "closed" : ""}>
                  <th scope="row">
                    {fund.name}
                    {fund.status === "closed" && <span class="tag"> Closed</span>}
                    <span class="isin"> {fund.isin}</span>
                  </th>
                  <td><Amount cents={fund.latest?.value ?? null} /></td>
                  <td><Amount cents={fund.latest?.netInvested ?? null} /></td>
                  <td><Signed cents={fund.latest?.gain ?? null} /></td>
                  <td><Percent ratio={fund.latest?.gainPercent ?? null} signed /></td>
                  <td><Signed cents={fund.latest?.monthlyGain ?? null} /></td>
                  <td><Percent ratio={fund.latest?.monthlyGainPercent ?? null} signed /></td>
                  <td><Percent ratio={fund.latest?.share ?? null} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p class="hint">
        Net invested = cumulative cash in minus cash out. Gain % is since invested. MoM compares with the previous
        statement when it was the month before.
      </p>

      <LineChart
        id="total-chart"
        title="Portfolio value and net invested"
        description="Two lines over time: the value of all funds, and the cash invested in them, dashed."
        series={totalSeries}
        formatTime={monthLabel}
        formatValue={euroLabel}
        emptyMessage="There is nothing to plot yet."
      />

      <h3 id="matrix-heading">Month by month</h3>
      <div class="table-scroll">
        <table class="matrix" aria-labelledby="matrix-heading">
          <thead>
            <tr>
              <th scope="col">Fund</th>
              <th scope="col">Measure</th>
              {dates.map((date) => (
                <th key={date} scope="col">{formatMonthShort(date)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {funds.flatMap((fund) => [
              <tr key={`${fund.isin}-value`} class="matrix-first">
                <th scope="row" rowSpan={2}>{fund.name}</th>
                <th scope="row">Value</th>
                {dates.map((date, index) => (
                  <td key={date}><Amount cents={fund.values[index] ?? null} /></td>
                ))}
              </tr>,
              <tr key={`${fund.isin}-net`}>
                <th scope="row">Net invested</th>
                {dates.map((date, index) => (
                  <td key={date}><Amount cents={fund.netInvested[index] ?? null} /></td>
                ))}
              </tr>,
            ])}
          </tbody>
        </table>
      </div>

      <div class="table-scroll">
        <table class="matrix totals" aria-label="Portfolio totals by month">
          <thead>
            <tr>
              <th scope="col">Portfolio</th>
              <th scope="col">Measure</th>
              {dates.map((date) => (
                <th key={date} scope="col">{formatMonthShort(date)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr class="matrix-first">
              <th scope="row">Total fund value</th>
              <th scope="row">Currency</th>
              {months.map((month) => (
                <td key={month.date}><Amount cents={month.value} /></td>
              ))}
            </tr>
            {(
              [
                ["Growth from investment", "gain", "gainPercent"],
                ["Growth from previous month", "monthlyGain", "monthlyGainPercent"],
                ["Growth from current year", "yearToDateGain", "yearToDatePercent"],
                ["Growth from previous year", "yearOverYearGain", "yearOverYearPercent"],
              ] as const
            ).flatMap(([label, amountKey, percentKey]) => [
              <tr key={`${label}-currency`} class="matrix-first">
                <th scope="row" rowSpan={2}>{label}</th>
                <th scope="row">Currency</th>
                {months.map((month) => (
                  <td key={month.date}><Signed cents={month[amountKey]} /></td>
                ))}
              </tr>,
              <tr key={`${label}-percent`}>
                <th scope="row">Percentage</th>
                {months.map((month) => (
                  <td key={month.date}><Percent ratio={month[percentKey]} signed /></td>
                ))}
              </tr>,
            ])}
          </tbody>
        </table>
      </div>
      <p class="hint">A dash means the figure cannot be calculated from the statements recorded. Average growth is not shown yet.</p>

      <LineChart
        id="funds-chart"
        title="Value by fund"
        description="One line per fund showing its value over time. A fund that was not held leaves a gap."
        series={fundSeries}
        formatTime={monthLabel}
        formatValue={euroLabel}
        emptyMessage="No fund has a value to plot yet."
      />

      <details class="definitions">
        <summary>How these figures are defined</summary>
        <dl>
          {kpis.map((kpi) => (
            <div key={kpi.label}>
              <dt>{kpi.label}</dt>
              <dd>{kpi.note}</dd>
            </div>
          ))}
        </dl>
        <p class="hint">
          These follow the definitions of the earlier spreadsheet so the results can be compared with it.
        </p>
      </details>
    </section>
  );
}
