import type { JSX } from "preact";
import { formatDateLong } from "../../../../core/values/iso-date";
import { EXPENSE_LABELS } from "../../../../core/expenses/work-expenses";
import { ExpenseAmount } from "./expense-format";
import type { ExpenseShared } from "./use-expense-editor";

export function ExpenseYearSection(p: { readonly shared: ExpenseShared }): JSX.Element {
  const { x } = p.shared;
  const { hidden, year, setYear, policy, setPolicy, setMonth, report, yearConflicts, reportReady, years } = x;
  return (
    <>
      <section class="expense-year-section" aria-labelledby="expense-year-heading">
        <div class="expense-section-heading">
          <h2 id="expense-year-heading" tabIndex={-1}>
            Your {year}
          </h2>
          <label class="expense-year">
            <span>Reporting year</span>
            <select
              value={year}
              onChange={(event) => {
                setYear(Number(event.currentTarget.value));
                setMonth("");
              }}
            >
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div class="expense-year-grid">
          <article class="card expense-annual" aria-label={`Annual spending in ${String(year)}`}>
            <div class="expense-annual-actual">
              <span class="card-label">Total Yearly</span>
              <p class="expense-metric-value">
                <ExpenseAmount cents={reportReady ? report.totalYearly : null} />
              </p>
              <p class="hint">
                All recorded amounts in this year.
                {report.partialDays > 0
                  ? ` Includes known amounts from ${String(report.partialDays)} incomplete ${report.partialDays === 1 ? "day" : "days"}.`
                  : ""}
              </p>
            </div>
            <div class="expense-projection">
              <span class="card-label">
                Yearly Projection <span class="expense-state">Estimate</span>
              </span>
              <p class="expense-total">
                <ExpenseAmount cents={reportReady ? report.yearlyProjection : null} />
              </p>
              <p class="hint">Daily average × {report.weekdaysInYear} weekdays. Holidays and leave are not deducted.</p>
            </div>
          </article>
          <section class="card expense-averages" aria-labelledby="expense-averages-heading">
            <div class="expense-card-heading">
              <h3 id="expense-averages-heading" class="card-title">
                Your average working costs
              </h3>
              <span class="expense-state">
                {policy === "completed-periods" ? "Completed periods" : "Typical periods · estimate"}
              </span>
            </div>
            <p class="card-subtitle">Saved entries only. Figures for {year}. Your current draft is not included.</p>
            <div class="expense-average-grid">
              {[
                {
                  title: "Average Daily",
                  amount: report.averageDaily,
                  note: `${String(report.completeDays)} recorded ${report.completeDays === 1 ? "workday" : "workdays"}, including zero-cost days. Optional costs may be blank.`,
                  unavailable: "Record a complete workday to see your daily average.",
                },
                {
                  title: "Average Weekly",
                  amount: report.averageWeekly,
                  note:
                    policy === "completed-periods"
                      ? `${String(report.eligibleWeeks)} completed eligible ${report.eligibleWeeks === 1 ? "week" : "weeks"}.`
                      : "Typical five-day week, estimated from your daily average.",
                  unavailable: "No eligible completed week yet.",
                },
                {
                  title: "Average Monthly",
                  amount: report.averageMonthly,
                  note:
                    policy === "completed-periods"
                      ? `${String(report.eligibleMonths)} completed eligible ${report.eligibleMonths === 1 ? "month" : "months"}.`
                      : "Typical month, estimated from the year's weekdays.",
                  unavailable: "No eligible completed month yet.",
                },
              ].map((metric) => (
                <div class="expense-metric" key={metric.title}>
                  <p class="card-label">{metric.title}</p>
                  <p class="expense-metric-value">
                    <ExpenseAmount compact cents={reportReady ? metric.amount : null} />
                  </p>
                  <p class="stat-caption">
                    {yearConflicts.length > 0
                      ? "Resolve conflicting days to calculate this summary."
                      : metric.amount === null
                        ? metric.unavailable
                        : metric.note}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <div class="more cell-12">
        <details class="expense-breakdown" id="expense-breakdown" tabIndex={-1}>
          <summary>Where it goes</summary>
          <p class="card-subtitle">
            Recorded amounts by category in {year}. Partial entries retain their known amounts.
          </p>
          <ul class="expense-category-list">
            {EXPENSE_LABELS.map((label, index) => {
              const amount = report.categoryTotals[index] ?? null;
              const maximum = Math.max(1, ...report.categoryTotals.map((value) => value ?? 0));
              return (
                <li key={label}>
                  <div>
                    <span>{label}</span>
                    <ExpenseAmount cents={reportReady && report.totalYearly !== null ? amount : null} />
                  </div>
                  {reportReady && report.totalYearly !== null && (
                    <span class="expense-category-track" aria-hidden="true">
                      <span
                        class={`expense-category-bar expense-category-${String(index)}`}
                        data-masked={hidden}
                        style={{ width: hidden ? "100%" : `${String(((amount ?? 0) / maximum) * 100)}%` }}
                      />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p class="hint">Bar lengths compare categories within this year; they do not imply good or bad spending.</p>
        </details>
        <details class="expense-definitions">
          <summary>How these summaries work</summary>
          <div class="expense-policy-control">
            <label for="expense-policy">Weekly and monthly view</label>
            <select
              id="expense-policy"
              value={policy}
              onChange={(event) => {
                setPolicy(event.currentTarget.value === "typical-periods" ? "typical-periods" : "completed-periods");
              }}
            >
              <option value="completed-periods">Actual completed periods</option>
              <option value="typical-periods">Estimated typical periods</option>
            </select>
          </div>
          <p>
            Daily averages use complete days: either Dinner or Other Expenses is entered, or both commutes and lunch are
            recorded. Explicit zeroes count. Optional costs can complete a day on their own; other blanks stay blank.
            All entered costs are included. A blank past weekday inside your tracked history means no onsite work.
            Incomplete routine entries without optional costs stay visible for review and do not count in averages.
          </p>
          <p>
            {policy === "completed-periods"
              ? "Weekly and monthly averages use completed periods with recorded workdays, wholly inside the year's tracked history. Periods containing an incomplete entry are excluded."
              : "Typical weeks use five times your daily average. Typical months use the year's weekday count divided by twelve. These are estimates, not averages of actual completed periods."}
          </p>
          <p>
            Annual spending includes every known amount; the projection uses complete workdays only. Future entries are
            excluded. All figures use exact cents and rounded displayed averages.
          </p>
          {report.startDate !== null && (
            <p>Tracked history begins {formatDateLong(report.startDate)}. Earlier dates have no coverage.</p>
          )}
        </details>
      </div>
    </>
  );
}
