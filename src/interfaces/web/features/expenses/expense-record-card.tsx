import type { JSX } from "preact";
import { formatDateLong } from "../../../../core/values/iso-date";
import {
  EXPENSE_LABELS,
  expenseDayKind,
  expenseEntryStatus,
  sumExpenseAmounts,
} from "../../../../core/expenses/work-expenses";
import { Icon } from "../../shared/ui/icons";
import { ExpenseAmount, labelFor } from "./expense-format";
import type { ExpenseShared } from "./use-expense-editor";

export function ExpenseRecordCard(p: { readonly shared: ExpenseShared }): JSX.Element {
  const { props, x } = p.shared;
  const {
    hidden,
    year,
    busy,
    showAll,
    setShowAll,
    reviewOnly,
    setReviewOnly,
    month,
    setMonth,
    editorElement,
    waiting,
    locked,
    conflicts,
    report,
    matchingDays,
    displayedDays,
    openDay,
    chooseVersion,
  } = x;
  return (
    <article class="card expense-record" id="expense-record" aria-labelledby="expense-record-heading">
      <div class="expense-card-heading">
        <h2 id="expense-record-heading" class="card-title" tabIndex={-1}>
          Your record
        </h2>
        <button
          type="button"
          onClick={() => {
            setShowAll((value) => !value);
          }}
        >
          {showAll ? "Show recent days" : "View all days"}
        </button>
      </div>
      <div class="expense-record-filters">
        <label>
          Month
          <select
            value={month}
            onChange={(event) => {
              setMonth(event.currentTarget.value);
            }}
          >
            <option value="">All months in {year}</option>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={String(index + 1).padStart(2, "0")}>
                {new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(
                  new Date(Date.UTC(year, index, 1)),
                )}
              </option>
            ))}
          </select>
        </label>
        <label class="expense-review-filter">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(event) => {
              setReviewOnly(event.currentTarget.checked);
              setShowAll(true);
            }}
          />
          Needs review only
        </label>
      </div>
      {conflicts
        .filter(
          (conflict) =>
            Number(conflict.date.slice(0, 4)) === year && (month === "" || conflict.date.slice(5, 7) === month),
        )
        .map((conflict) => (
          <div class="expense-conflict" key={conflict.date}>
            <h3>{formatDateLong(conflict.date)} · Conflicting versions</h3>
            <p>
              Two devices changed this day. Review a version, then save a correction. No version has silently replaced
              the other.
            </p>
            {conflict.versions.map((version, index) => (
              <details key={version.revision}>
                <summary>Version {index + 1}</summary>
                <dl>
                  {EXPENSE_LABELS.map((label, field) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        <ExpenseAmount cents={version.amounts[field] ?? null} empty="Blank" />
                      </dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  disabled={hidden || locked}
                  onClick={() => {
                    chooseVersion(conflict, version.amounts);
                  }}
                >
                  Review this version
                </button>
              </details>
            ))}
          </div>
        ))}
      {displayedDays.length === 0 && (
        <p class="empty-note">
          {props.ready
            ? reviewOnly
              ? "No incomplete entries match this view."
              : "No recorded days in this view yet. Start with a day above, or choose a past date to backfill."
            : "Your expense record has not been checked yet."}
        </p>
      )}
      <ul class="expense-record-list">
        {displayedDays.map((day) => {
          const status = expenseEntryStatus(day.amounts);
          const filledDay = status.filled;
          return (
            <li key={day.date}>
              <button
                type="button"
                disabled={busy || waiting}
                onClick={() => {
                  openDay(day.date);
                  editorElement.current?.scrollIntoView({ behavior: "auto", block: "start" });
                }}
              >
                <span class="expense-record-label">
                  <span class="expense-record-date">{formatDateLong(day.date)}</span>
                  <span class={`expense-record-state ${status.partial ? "needs-review" : ""}`}>
                    {labelFor(expenseDayKind(day, day.date, props.today, report.startDate))}
                    {status.partial ? ` · ${String(status.missingRequired.length)} daily costs missing` : ""}
                  </span>
                </span>
                <span class="expense-record-value">
                  <ExpenseAmount compact cents={filledDay === 0 ? null : sumExpenseAmounts(day.amounts)} />
                </span>
                <Icon name="chevron" size={16} />
                <span class="visually-hidden">{status.partial ? "Review day" : "Edit day"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!showAll && matchingDays.length > displayedDays.length && (
        <p class="hint">
          Showing {displayedDays.length} of {matchingDays.length} recorded days in this view.
        </p>
      )}
    </article>
  );
}
