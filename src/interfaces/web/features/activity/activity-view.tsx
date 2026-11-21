import type { JSX } from "preact";
import { useMemo, useState } from "preact/hooks";
import { EXPENSE_LABELS, type ExpenseDay } from "../../../../core/expenses/work-expenses";
import { AnimatedFigure, formatFigureCount } from "../../presentation/animated-figure";
import { Amount } from "../../presentation/privacy/privacy";
import {
  ACTIVITY_SORTS,
  ACTIVITY_STATUSES,
  activityDayLabel,
  activityMonths,
  activityRows,
  activityTotals,
  activityWeeks,
  parseActivitySort,
  parseActivityStatus,
  type ActivityRow,
  type ActivitySort,
  type ActivityStatus,
} from "./activity-model";
import "./styles/activity.css";

export interface ActivityViewProps {
  readonly days: readonly ExpenseDay[];
  /** True while the sample portfolio is shown; the days are then invented and say so. */
  readonly demo: boolean;
}

const STATUS_LABELS: Readonly<Record<ActivityStatus, string>> = {
  all: "All",
  complete: "Complete",
  partial: "Partial",
};
const SORT_LABELS: Readonly<Record<ActivitySort, string>> = {
  newest: "Newest first",
  oldest: "Oldest first",
  largest: "Largest first",
};

function countOf(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? "" : "s"}`;
}

function detailOf(row: ActivityRow): string {
  return row.complete
    ? `${countOf(row.filledCount, "amount")} of ${String(EXPENSE_LABELS.length)} recorded`
    : `Missing ${row.missingLabels.join(", ")}`;
}

/** Read-only browsing of recorded expense days. Totals and completeness come from the canonical expense model. */
export function ActivityView(props: ActivityViewProps): JSX.Element {
  const { days, demo } = props;
  const [status, setStatus] = useState<ActivityStatus>("all");
  const [month, setMonth] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ActivitySort>("newest");

  const months = useMemo(() => activityMonths(days), [days]);
  const rows = useMemo(() => activityRows(days, { status, month, query, sort }), [days, status, month, query, sort]);
  const weeks = useMemo(() => activityWeeks(rows), [rows]);
  const totals = useMemo(() => activityTotals(rows), [rows]);

  return (
    <section class="dash activity-dashboard" aria-label="Recorded activity">
      {demo && (
        <section class="card cell-12 activity-sample" aria-label="Sample">
          <p class="card-subtitle">Sample days with invented amounts. Your own records stay separate.</p>
        </section>
      )}

      <section class="card cell-12 activity-tools" aria-label="Find recorded days">
        <div class="activity-controls">
          <label class="activity-field activity-search">
            <span>Search</span>
            <input
              type="search"
              value={query}
              placeholder="Dates, categories or amounts"
              onInput={(event) => {
                setQuery(event.currentTarget.value);
              }}
            />
          </label>
          <label class="activity-field">
            <span>Month</span>
            <select
              value={month}
              onChange={(event) => {
                setMonth(event.currentTarget.value);
              }}
            >
              <option value="">Any month</option>
              {months.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label class="activity-field">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(parseActivitySort(event.currentTarget.value));
              }}
            >
              {ACTIVITY_SORTS.map((item) => (
                <option key={item} value={item}>
                  {SORT_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div class="segmented activity-status" role="group" aria-label="Status">
          {ACTIVITY_STATUSES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={status === item ? "true" : "false"}
              onClick={() => {
                setStatus(parseActivityStatus(item));
              }}
            >
              {STATUS_LABELS[item]}
            </button>
          ))}
        </div>
      </section>

      <section class="card cell-8 activity-list" aria-labelledby="activity-list-title">
        <h2 id="activity-list-title" class="card-title">
          Recorded days
        </h2>
        <p class="card-subtitle">{countOf(rows.length, "day")} shown</p>
        {weeks.length === 0 ? (
          <p class="activity-empty" role="status">
            No recorded day matches. Clear the search or choose All.
          </p>
        ) : (
          weeks.map((week) => (
            <section class="activity-week" key={week.start} aria-label={`Week of ${activityDayLabel(week.start)}`}>
              <header class="activity-week-head">
                <b>Week of {activityDayLabel(week.start)}</b>
                <small>{countOf(week.rows.length, "day")}</small>
              </header>
              <ul class="activity-rows">
                {week.rows.map((row) => (
                  <li class="activity-row" key={row.day.date}>
                    <span class="activity-row-main">
                      <b>{activityDayLabel(row.day.date)}</b>
                      <small>{detailOf(row)}</small>
                    </span>
                    <span class={row.complete ? "activity-tag is-complete" : "activity-tag is-partial"}>
                      {row.complete ? "Complete" : "Partial"}
                    </span>
                    <Amount cents={row.total} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </section>

      <aside class="card cell-4 activity-totals" aria-labelledby="activity-totals-title">
        <h2 id="activity-totals-title" class="card-title">
          In this view
        </h2>
        <dl class="activity-figures">
          <div>
            <dt>Recorded total</dt>
            <dd>{totals.total === null ? "Not fully known" : <Amount cents={totals.total} />}</dd>
          </div>
          <div>
            <dt>Complete days</dt>
            <dd>
              <AnimatedFigure
                value={totals.completeDays}
                text={formatFigureCount(totals.completeDays)}
                format={formatFigureCount}
              />
            </dd>
          </div>
          <div>
            <dt>Partial days</dt>
            <dd>
              <AnimatedFigure
                value={totals.partialDays}
                text={formatFigureCount(totals.partialDays)}
                format={formatFigureCount}
              />
            </dd>
          </div>
        </dl>
        <p class="card-subtitle">Partial days add only the amounts they have. Nothing is filled in.</p>
        <h3 class="activity-subhead">By category</h3>
        <dl class="activity-figures">
          {EXPENSE_LABELS.map((label, index) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <Amount cents={totals.categoryTotals[index] ?? null} />
              </dd>
            </div>
          ))}
        </dl>
      </aside>
    </section>
  );
}
