import type { JSX } from "preact";
import { type IsoDate, formatMonthYear, toIsoDate } from "../../../../core/IsoDate";
import { type EuroCents, formatEuro, formatSignedEuro, toEuroCents } from "../../../../core/Money";
import { formatPercent } from "../../../../core/Percent";
import { LineChart } from "../../shared/charts/LineChart";
import type { ChartSeries } from "../../shared/charts/lineChartGeometry";
import type { OverviewKpi, OverviewModel } from "./OverviewModel";

function utcTime(date: IsoDate): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function monthLabel(time: number): string {
  const moment = new Date(time);
  const date = toIsoDate(moment.getUTCFullYear(), moment.getUTCMonth() + 1, moment.getUTCDate());
  return date === null ? "" : formatMonthYear(date);
}

function euroLabel(value: number): string {
  const cents = toEuroCents(Math.round(value * 100));
  return cents === null ? "" : formatEuro(cents);
}

function euros(cents: EuroCents | null): number | null {
  return cents === null ? null : cents / 100;
}

function Kpi(props: { readonly kpi: OverviewKpi }): JSX.Element {
  const { kpi } = props;
  const amount =
    kpi.amount === null ? "–" : kpi.signed ? formatSignedEuro(kpi.amount) : formatEuro(kpi.amount);
  return (
    <div>
      <dt>{kpi.label}</dt>
      <dd>
        {amount}
        {kpi.signed && kpi.percent !== null && <span class="kpi-percent"> {formatPercent(kpi.percent, { signed: true })}</span>}
      </dd>
    </div>
  );
}

export function OverviewView(props: { readonly model: OverviewModel }): JSX.Element {
  const { dates, funds, totals, kpis } = props.model;
  const latestTotal = totals[totals.length - 1];
  const lastDate = dates[dates.length - 1];

  if (dates.length === 0 || latestTotal === undefined) {
    return (
      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading">Overview</h2>
        <p>
          No statements have been imported yet. Import your first bank statement to see your portfolio here.
        </p>
      </section>
    );
  }

  const totalSeries: ChartSeries[] = [
    {
      id: "value",
      label: "Portfolio value",
      points: dates.map((date, index) => ({ time: utcTime(date), value: euros(totals[index]?.value ?? null) })),
    },
    {
      id: "invested",
      label: "Net invested",
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
      <h2 id="overview-heading">Overview</h2>
      <p class="hint">
        As of the statement of {lastDate === undefined ? "" : formatMonthYear(lastDate)}.
        {props.model.estimated &&
          " Percentages that depend on when you moved cash are estimates, and none of them is annualised."}
      </p>
      <dl class="kpis">
        {kpis.map((kpi) => (
          <Kpi key={kpi.label} kpi={kpi} />
        ))}
      </dl>
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
          These follow the definitions of the earlier spreadsheet so the results can be compared with it. A dash means
          the figure cannot be calculated from the statements recorded.
        </p>
      </details>

      <LineChart
        id="total-chart"
        title="Portfolio value and net invested"
        description="Two lines over time: the value of all funds and the cash invested in them."
        series={totalSeries}
        formatTime={monthLabel}
        formatValue={euroLabel}
        emptyMessage="There is nothing to plot yet."
      />

      <h3 id="funds-heading">Funds</h3>
      {funds.length === 0 ? (
        <p>No funds are held.</p>
      ) : (
        <div class="table-scroll">
          <table class="funds" aria-labelledby="funds-heading">
            <thead>
              <tr>
                <th scope="col">Fund</th>
                <th scope="col">Status</th>
                <th scope="col">Value</th>
                <th scope="col">Net invested</th>
                <th scope="col">Gain</th>
                <th scope="col">Gain %</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((fund) => (
                <tr key={fund.isin}>
                  <th scope="row">
                    {fund.name}
                    <span class="isin"> {fund.isin}</span>
                  </th>
                  <td>{fund.status === "closed" ? "Closed" : "Active"}</td>
                  <td>{fund.latest === null ? "–" : formatEuro(fund.latest.value)}</td>
                  <td>{fund.latest === null ? "–" : formatEuro(fund.latest.netInvested)}</td>
                  <td>{fund.latest === null ? "–" : formatSignedEuro(fund.latest.gain)}</td>
                  <td>{formatPercent(fund.latest?.gainPercent ?? null, { signed: true })}</td>
                  <td>{formatPercent(fund.latest?.share ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    </section>
  );
}
