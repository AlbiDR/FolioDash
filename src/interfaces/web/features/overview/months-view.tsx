import type { JSX } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { type IsoDate, formatDateLong } from "../../../../core/values/iso-date";
import type { StatementLabel } from "../../../../core/statements/statement-labels";
import { Amount } from "../../presentation/privacy/privacy";
import { Icon } from "../../shared/ui/icons";
import type { OverviewModel } from "./model/overview-model";
import { Percent, Signed } from "./parts";
import { columnClass } from "./model/month-columns";
import { type RowMarks, displayedHundredths, rowMarks } from "./model/row-marks";

/** A column heading: the short name, with the exact export date for anyone who cannot see it. */
function StatementHeading(props: { readonly label: StatementLabel | undefined; readonly date: IsoDate }): JSX.Element {
  const { label } = props;
  return label === undefined ? (
    <>{props.date}</>
  ) : (
    <>
      {label.short}
      {label.detail !== null && <span class="visually-hidden">, {label.detail}</span>}
    </>
  );
}

/** Names the statements the comparisons were made against. Calculations follow the actual dates, so say which. */
function comparisonNote(month: OverviewModel["months"][number]): string | null {
  const parts = [
    month.monthlyGain !== null && month.previousDate !== null
      ? `${formatDateLong(month.previousDate)} (month on month)`
      : null,
    month.yearToDateGain !== null && month.yearToDateFrom !== null
      ? `${formatDateLong(month.yearToDateFrom)} (year to date)`
      : null,
    month.yearOverYearGain !== null && month.yearOverYearFrom !== null
      ? `${formatDateLong(month.yearOverYearFrom)} (year on year)`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : `Compared with the statements dated ${parts.join(", ")}.`;
}

/** The earlier spreadsheet's month-by-month matrix, kept whole, on its own screen. */
export function MonthsView(props: { readonly model: OverviewModel }): JSX.Element {
  const { dates, funds, months, labels } = props.model;
  const [selected, setSelected] = useState("");
  const [marked, setMarked] = useState(false);
  const totalsScroll = useRef<HTMLDivElement>(null);
  const fundsScroll = useRef<HTMLDivElement>(null);
  // The newest statement is the one most often wanted, and it is the last column: open on it, as the sheet's last column is.
  // Layout can still settle after the first paint (fonts, scrollbars, a window resize), so keep following the end until the person scrolls.
  const followNewest = useRef(true);
  useLayoutEffect(() => {
    const regions = [totalsScroll.current, fundsScroll.current].filter(
      (region): region is HTMLDivElement => region !== null,
    );
    followNewest.current = true;
    const toEnd = (): void => {
      if (followNewest.current) for (const region of regions) region.scrollLeft = region.scrollWidth;
    };
    const stop = (): void => {
      followNewest.current = false;
    };
    toEnd();
    const observer = new ResizeObserver(toEnd);
    for (const region of regions) {
      observer.observe(region);
      const table = region.querySelector("table");
      if (table !== null) observer.observe(table);
      for (const type of ["wheel", "touchstart", "pointerdown", "keydown"])
        region.addEventListener(type, stop, { passive: true });
    }
    return () => {
      observer.disconnect();
      for (const region of regions)
        for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) region.removeEventListener(type, stop);
    };
  }, [dates.length]);
  /**
   * Both tables share the same statement columns, so they scroll as one. They can differ in width by a few pixels
   * (number widths vary with the font), so a table at its end sends the other to its own end rather than to a
   * position that may fall short of it. Setting an equal position fires no event, so the two never echo.
   */
  const follow =
    (other: { readonly current: HTMLDivElement | null }) =>
    (event: Event): void => {
      const source = event.currentTarget as HTMLDivElement;
      const target = other.current;
      if (target === null) return;
      const atEnd = source.scrollLeft >= source.scrollWidth - source.clientWidth - 1;
      const position = atEnd ? Math.max(0, target.scrollWidth - target.clientWidth) : source.scrollLeft;
      if (Math.abs(target.scrollLeft - position) >= 1) target.scrollLeft = position;
    };
  /** The class and the best or worst mark for one cell of a portfolio row, when marks are on. The text is for assistive technology; the glyph is only decoration. */
  const marksFor = (marks: RowMarks, position: number): { readonly cls: string; readonly mark: JSX.Element | null } => {
    if (!marked) return { cls: "", mark: null };
    const best = marks.best.has(position);
    const worst = marks.worst.has(position);
    if (!best && !worst) return { cls: "", mark: null };
    return {
      cls: best ? " matrix-best" : " matrix-worst",
      mark: (
        <>
          <span class="matrix-mark" aria-hidden="true">
            {best ? "▲" : "▼"}
          </span>
          <span class="visually-hidden">{best ? " Best in row" : " Worst in row"}</span>
        </>
      ),
    };
  };
  const valueMarks = rowMarks(months.map((entry) => Number(entry.value)));
  const date = dates.find((entry) => entry === selected) ?? dates[dates.length - 1];
  const index = dates.findIndex((entry) => entry === date);
  const month = months[index];
  return (
    <section class="screen months" aria-label="Statements by month">
      {dates.length === 0 ? (
        <p>No statements have been imported yet.</p>
      ) : (
        <>
          <section class="month-matrices" aria-labelledby="month-comparison-heading">
            <h2 id="month-comparison-heading" class="card-title">
              Compare all months
            </h2>
            <p class="card-subtitle">
              Scroll inside either table: they move together and open on the newest statement. The statement chosen
              below is tinted.
            </p>
            <label class="check matrix-marks-toggle">
              <input
                type="checkbox"
                checked={marked}
                onChange={(event) => {
                  setMarked(event.currentTarget.checked);
                }}
              />{" "}
              Mark the best and worst month in each portfolio row
            </label>
            <div class="card">
              <div
                ref={totalsScroll}
                onScroll={follow(fundsScroll)}
                class="table-scroll flat"
                role="region"
                aria-label="Portfolio totals by month"
                tabIndex={0}
              >
                <table class="matrix totals" aria-label="Portfolio totals by month">
                  <thead>
                    <tr>
                      <th scope="col" class="matrix-label">
                        Portfolio
                      </th>
                      <th scope="col">Measure</th>
                      {dates.map((date, position) => (
                        <th key={date} scope="col" class={columnClass(dates, position, index)}>
                          <StatementHeading label={labels[position]} date={date} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr class="matrix-first matrix-headline">
                      <th scope="row" class="matrix-label">
                        Total fund value
                      </th>
                      <th scope="row">Currency</th>
                      {months.map((month, position) => {
                        const { cls, mark } = marksFor(valueMarks, position);
                        return (
                          <td key={month.date} class={`${columnClass(dates, position, index)}${cls}`}>
                            <Amount cents={month.value} />
                            {mark}
                          </td>
                        );
                      })}
                    </tr>
                    {(
                      [
                        ["investment", "gain", "gainPercent"],
                        ["previous month", "monthlyGain", "monthlyGainPercent"],
                        ["current year", "yearToDateGain", "yearToDatePercent"],
                        ["previous year", "yearOverYearGain", "yearOverYearPercent"],
                      ] as const
                    ).flatMap(([label, amountKey, percentKey]) => {
                      const amountMarks = rowMarks(
                        months.map((entry) => (entry[amountKey] === null ? null : Number(entry[amountKey]))),
                      );
                      const percentMarks = rowMarks(months.map((entry) => displayedHundredths(entry[percentKey])));
                      return [
                        <tr key={`${label}-currency`} class="matrix-first">
                          <th scope="row" rowSpan={2} class="matrix-label">
                            Growth from {label}
                          </th>
                          <th scope="row">Currency</th>
                          {months.map((month, position) => {
                            const { cls, mark } = marksFor(amountMarks, position);
                            return (
                              <td key={month.date} class={`${columnClass(dates, position, index)}${cls}`}>
                                <Signed cents={month[amountKey]} />
                                {mark}
                              </td>
                            );
                          })}
                        </tr>,
                        <tr key={`${label}-percent`}>
                          <th scope="row">Percentage</th>
                          {months.map((month, position) => {
                            const { cls, mark } = marksFor(percentMarks, position);
                            return (
                              <td key={month.date} class={`${columnClass(dates, position, index)}${cls}`}>
                                <Percent ratio={month[percentKey]} signed />
                                {mark}
                              </td>
                            );
                          })}
                        </tr>,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="card">
              <div
                ref={fundsScroll}
                onScroll={follow(totalsScroll)}
                class="table-scroll flat"
                role="region"
                aria-label="Fund history by month"
                tabIndex={0}
              >
                <table class="matrix" aria-label="Value and net invested by fund and month">
                  <thead>
                    <tr>
                      <th scope="col" class="matrix-label">
                        Fund
                      </th>
                      <th scope="col">Measure</th>
                      {dates.map((date, position) => (
                        <th key={date} scope="col" class={columnClass(dates, position, index)}>
                          <StatementHeading label={labels[position]} date={date} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {funds.flatMap((fund) => [
                      <tr key={`${fund.isin}-value`} class="matrix-first">
                        <th scope="row" rowSpan={2} class="matrix-label">
                          {fund.name}
                        </th>
                        <th scope="row">Value</th>
                        {dates.map((date, position) => (
                          <td key={date} class={columnClass(dates, position, index)}>
                            <Amount cents={fund.values[position] ?? null} />
                          </td>
                        ))}
                      </tr>,
                      <tr key={`${fund.isin}-net`} class="matrix-secondary">
                        <th scope="row">Net invested</th>
                        {dates.map((date, position) => (
                          <td key={date} class={columnClass(dates, position, index)}>
                            <Amount cents={fund.netInvested[position] ?? null} />
                          </td>
                        ))}
                      </tr>,
                    ])}
                  </tbody>
                </table>
              </div>
            </div>
            <p class="footnote">
              A dash means the figure cannot be calculated from the statements recorded. Average growth is not shown
              yet.
            </p>
          </section>
          <h2 class="card-title">View one statement</h2>
          <p class="card-subtitle">
            Choose a statement or step through the months. Its column is tinted in the tables above.
          </p>
          <div class="mobile-months">
            <label class="field">
              Statement date
              <select
                value={date}
                onChange={(event) => {
                  setSelected(event.currentTarget.value);
                }}
              >
                {dates
                  .map((entry, position) => (
                    <option key={entry} value={entry}>
                      {labels[position]?.long ?? formatDateLong(entry)}
                    </option>
                  ))
                  .reverse()}
              </select>
            </label>
            <div class="month-actions" role="group" aria-label="Browse statement months">
              <button
                type="button"
                class="month-step previous"
                disabled={index <= 0}
                onClick={() => {
                  setSelected(dates[index - 1] ?? "");
                }}
              >
                <Icon name="back" size={16} />
                Previous
              </button>
              <button
                type="button"
                class="month-step next"
                disabled={index >= dates.length - 1}
                onClick={() => {
                  setSelected(dates[index + 1] ?? "");
                }}
              >
                Next
                <Icon name="chevron" size={16} />
              </button>
              <button
                type="button"
                disabled={index >= dates.length - 1}
                onClick={() => {
                  setSelected(dates.at(-1) ?? "");
                }}
              >
                Latest
              </button>
            </div>
            <p class="statement-position" role="status" aria-atomic="true">
              Statement {index + 1} of {dates.length}
              {date === undefined ? "" : ` · ${labels[index]?.long ?? formatDateLong(date)}`}
            </p>
            {month !== undefined && (
              <div class="card month-summary" key={month.date}>
                <h2 class="card-title">
                  <time dateTime={month.date}>{labels[index]?.long ?? formatDateLong(month.date)}</time>
                </h2>
                <dl class="facts stacked">
                  <div>
                    <dt>Fund value</dt>
                    <dd>
                      <Amount cents={month.value} />
                    </dd>
                  </div>
                  <div>
                    <dt>Gain since invested</dt>
                    <dd>
                      <Signed cents={month.gain} />
                    </dd>
                  </div>
                  <div>
                    <dt>Month on month</dt>
                    <dd>
                      <Signed cents={month.monthlyGain} />
                    </dd>
                  </div>
                  <div>
                    <dt>Year to date</dt>
                    <dd>
                      <Signed cents={month.yearToDateGain} />
                    </dd>
                  </div>
                  <div>
                    <dt>Year on year</dt>
                    <dd>
                      <Signed cents={month.yearOverYearGain} />
                    </dd>
                  </div>
                </dl>
                {comparisonNote(month) !== null && <p class="card-subtitle">{comparisonNote(month)}</p>}
                <h3 class="month-funds-heading">Funds</h3>
                <ul class="month-funds">
                  {funds.map((fund) => (
                    <li key={fund.isin}>
                      <a class="row-link" href={`#fund/${fund.isin}`}>
                        {fund.name}
                        <Icon name="chevron" size={18} />
                      </a>
                      <dl class="facts stacked">
                        <div>
                          <dt>Value</dt>
                          <dd>
                            <Amount cents={fund.values[index] ?? null} />
                          </dd>
                        </div>
                        <div>
                          <dt>Net invested</dt>
                          <dd>
                            <Amount cents={fund.netInvested[index] ?? null} />
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
