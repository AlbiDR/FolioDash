import type { JSX } from "preact";
import { formatMonthShort } from "../../../../core/IsoDate";
import { Amount } from "../../shared/privacy/privacy";
import { Icon } from "../../shared/ui/icons";
import type { OverviewModel } from "./OverviewModel";
import { Percent, Signed } from "./parts";

/** The earlier spreadsheet's month-by-month matrix, kept whole, on its own screen. */
export function MonthsView(props: { readonly model: OverviewModel }): JSX.Element {
  const { dates, funds, months } = props.model;
  return (
    <section class="screen months" aria-labelledby="months-heading">
      <a class="back-link" href="#overview">
        <Icon name="back" size={18} /> Portfolio
      </a>
      <h2 id="months-heading" class="screen-title">Month by month</h2>
      {dates.length === 0 ? (
        <p>No statements have been imported yet.</p>
      ) : (
        <>
          <div class="card"><div class="table-scroll flat">
            <table class="matrix" aria-label="Value and net invested by fund and month">
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
          </div></div>

          <div class="card"><div class="table-scroll flat">
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
          </div></div>
          <p class="footnote">A dash means the figure cannot be calculated from the statements recorded. Average growth is not shown yet.</p>
        </>
      )}
    </section>
  );
}
