import type { JSX } from "preact";
import { type IsoDate, formatMonthYear, toIsoDate } from "../../../../core/IsoDate";
import { type EuroCents, formatEuro, toEuroCents } from "../../../../core/Money";
import { LineChart } from "../../shared/charts/LineChart";
import type { ChartSeries } from "../../shared/charts/lineChartGeometry";
import type { OverviewModel } from "./OverviewModel";

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

export function OverviewView(props: { readonly model: OverviewModel }): JSX.Element {
  const { dates, funds, totals } = props.model;
  const latest = totals[totals.length - 1];

  if (dates.length === 0 || latest === undefined) {
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
  const lastDate = dates[dates.length - 1];

  return (
    <section aria-labelledby="overview-heading" class="overview">
      <h2 id="overview-heading">Overview</h2>
      <dl class="kpis">
        <div>
          <dt>Portfolio value</dt>
          <dd>{formatEuro(latest.value)}</dd>
        </div>
        <div>
          <dt>Net invested</dt>
          <dd>{formatEuro(latest.invested)}</dd>
        </div>
        <div>
          <dt>Latest statement</dt>
          <dd>{lastDate === undefined ? "" : formatMonthYear(lastDate)}</dd>
        </div>
        <div>
          <dt>Funds</dt>
          <dd>{funds.filter((fund) => fund.status === "active").length} active</dd>
        </div>
      </dl>

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
        <table class="funds" aria-labelledby="funds-heading">
          <thead>
            <tr>
              <th scope="col">Fund</th>
              <th scope="col">ISIN</th>
              <th scope="col">Status</th>
              <th scope="col">Latest value</th>
            </tr>
          </thead>
          <tbody>
            {funds.map((fund) => {
              const value = fund.values[fund.values.length - 1] ?? null;
              return (
                <tr key={fund.isin}>
                  <th scope="row">{fund.name}</th>
                  <td>{fund.isin}</td>
                  <td>{fund.status === "closed" ? "Closed" : "Active"}</td>
                  <td>{value === null ? "–" : formatEuro(value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
