import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { formatMonthShort } from "../../../../core/IsoDate";
import { Amount } from "../../shared/privacy/privacy";
import { Icon } from "../../shared/ui/icons";
import { useMediaQuery } from "../../shared/ui/useMediaQuery";
import type { OverviewModel } from "./OverviewModel";
import { Percent, Signed } from "./parts";

/** The earlier spreadsheet's month-by-month matrix, kept whole, on its own screen. */
export function MonthsView(props: { readonly model: OverviewModel }): JSX.Element {
  const { dates, funds, months } = props.model;
  const wide = useMediaQuery("(min-width: 47.5rem)");
  const [selected, setSelected] = useState("");
  const date = dates.find((entry) => entry === selected) ?? dates[dates.length - 1];
  const index = dates.findIndex((entry) => entry === date);
  const month = months[index];
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
          <div class="mobile-months">
            <label class="field">Statement month
              <select value={date} onChange={(event) => { setSelected(event.currentTarget.value); }}>
                {[...dates].reverse().map((entry) => <option key={entry} value={entry}>{formatMonthShort(entry)}</option>)}
              </select>
            </label>
            <div class="month-actions" role="group" aria-label="Browse statement months">
              <button type="button" disabled={index <= 0} onClick={() => { setSelected(dates[index - 1] ?? ""); }}>Previous</button>
              <button type="button" disabled={index >= dates.length - 1} onClick={() => { setSelected(dates[index + 1] ?? ""); }}>Next</button>
              <button type="button" disabled={index >= dates.length - 1} onClick={() => { setSelected(dates.at(-1) ?? ""); }}>Latest</button>
            </div>
            {month !== undefined && <div class="card month-summary" key={month.date}>
              <h3 class="card-title">{formatMonthShort(month.date)}</h3>
              <dl class="facts stacked">
                <div><dt>Fund value</dt><dd><Amount cents={month.value} /></dd></div>
                <div><dt>Gain since invested</dt><dd><Signed cents={month.gain} /></dd></div>
                <div><dt>Month on month</dt><dd><Signed cents={month.monthlyGain} /></dd></div>
                <div><dt>Year to date</dt><dd><Signed cents={month.yearToDateGain} /></dd></div>
                <div><dt>Year on year</dt><dd><Signed cents={month.yearOverYearGain} /></dd></div>
              </dl>
            </div>}
            {funds.map((fund) => <div class="card" key={fund.isin}>
              <a class="row-link" href={`#fund/${fund.isin}`}>{fund.name}<Icon name="chevron" size={18} /></a>
              <dl class="facts stacked">
                <div><dt>Value</dt><dd><Amount cents={fund.values[index] ?? null} /></dd></div>
                <div><dt>Net invested</dt><dd><Amount cents={fund.netInvested[index] ?? null} /></dd></div>
              </dl>
            </div>)}
          </div>
          <p class="hint">The complete tables below scroll horizontally. Swipe inside a table to compare months.</p>
          <details class="month-matrices" open={wide}>
          <summary>Compare all months in tables</summary>
          <div class="card"><div class="table-scroll flat" role="region" aria-label="Fund history by month" tabIndex={0}>
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

          <div class="card"><div class="table-scroll flat" role="region" aria-label="Portfolio totals by month" tabIndex={0}>
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
          </details>
          <p class="footnote">A dash means the figure cannot be calculated from the statements recorded. Average growth is not shown yet.</p>
        </>
      )}
    </section>
  );
}
