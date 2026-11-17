import type { JSX } from "preact";
import { formatDateLong } from "../../../../core/values/iso-date";
import {
  expenseDayKind,
  filledExpenseFields,
  shiftDate,
  sumExpenseAmounts,
} from "../../../../core/expenses/work-expenses";
import { Icon } from "../../shared/ui/icons";
import { ExpenseAmount, shortDate, weekLabelFor } from "./expense-format";
import type { ExpenseShared } from "./use-expense-editor";

export function ExpenseWeekCard(p: { readonly shared: ExpenseShared }): JSX.Element {
  const { props, x } = p.shared;
  const {
    editor,
    week,
    setWeek,
    busy,
    setShowAll,
    setReviewOnly,
    waiting,
    conflicts,
    report,
    dates,
    weekDays,
    weekHasConflict,
    weekTotal,
    weekPartial,
    openDay,
  } = x;
  return (
    <article class="card expense-week" aria-labelledby="expense-week-heading">
      <div class="expense-card-heading">
        <div>
          <h2 id="expense-week-heading" class="card-title" tabIndex={-1}>
            Your week
          </h2>
          <p class="card-subtitle">
            {dates[0] === undefined ? "" : formatDateLong(dates[0])} to{" "}
            {dates[4] === undefined ? "" : formatDateLong(dates[4])}
          </p>
        </div>
        <div class="expense-week-controls">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => {
              const date = shiftDate(week, -7);
              if (date !== null) setWeek(date);
            }}
          >
            <Icon name="back" size={18} />
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => {
              const date = shiftDate(week, 7);
              if (date !== null) setWeek(date);
            }}
          >
            <Icon name="chevron" size={18} />
          </button>
        </div>
      </div>
      <ul class="expense-week-list">
        {dates.map((date) => {
          const day = props.days.find((entry) => entry.date === date);
          const kind = expenseDayKind(day, date, props.today, report.startDate);
          const conflict = conflicts.some((entry) => entry.date === date);
          return (
            <li key={date}>
              <button
                type="button"
                aria-pressed={date === editor.date}
                disabled={busy || waiting}
                onClick={() => {
                  openDay(date);
                }}
              >
                <span class="expense-week-date">{shortDate(date)}</span>
                <span class={`expense-week-state ${kind === "partial" || conflict ? "needs-review" : ""}`}>
                  {!props.ready ? "Not checked" : conflict ? "Conflicting versions" : weekLabelFor(kind)}
                </span>
                <span class="expense-week-amount">
                  {day === undefined || filledExpenseFields(day.amounts) === 0 ? (
                    <span aria-hidden="true">-</span>
                  ) : (
                    <ExpenseAmount compact cents={sumExpenseAmounts(day.amounts)} />
                  )}
                </span>
                <Icon name="chevron" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      <div class="expense-week-footer">
        <span class="card-label">Recorded week spending</span>
        <p class="expense-total">
          <ExpenseAmount
            compact
            cents={
              !props.ready || weekHasConflict || !weekDays.some((day) => filledExpenseFields(day.amounts) > 0)
                ? null
                : weekTotal
            }
          />
        </p>
        <p class="hint">
          {weekHasConflict
            ? "Resolve this week’s conflicting versions before its total can be shown."
            : "Known amounts only."}
          {weekPartial > 0
            ? ` ${String(weekPartial)} ${weekPartial === 1 ? "day needs" : "days need"} review.`
            : " Zero-cost workdays count."}
        </p>
      </div>
      {(report.partialDays > 0 || conflicts.length > 0) && (
        <a
          class="expense-review-link"
          href="#expense-record"
          onClick={(event) => {
            event.preventDefault();
            setReviewOnly(true);
            setShowAll(true);
            document.getElementById("expense-record")?.scrollIntoView({ behavior: "auto", block: "start" });
          }}
        >
          Review incomplete or conflicting days <Icon name="chevron" size={18} />
        </a>
      )}
    </article>
  );
}
