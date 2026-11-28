import type { JSX } from "preact";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { EXPENSE_LABELS, type ExpenseDay } from "../../../../core/expenses/work-expenses";
import { AnimatedFigure, formatFigureCount } from "../../presentation/animated-figure";
import { Amount } from "../../presentation/privacy/privacy";
import { RangeSelector } from "../../shared/ui/range-selector";
import { useRowGlide } from "../../shared/ui/use-row-glide";
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
  /** True while the sample portfolio is shown; the days are then synthetic and say so. */
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
  const [chosenMonth, setMonth] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ActivitySort>("newest");

  const months = useMemo(() => activityMonths(days), [days]);
  // A month chosen before the days changed (the sample giving way to the person's own) may no longer exist; the list and
  // the select then both read "Any month" instead of filtering by a month nobody can see.
  const month = months.some((item) => item.key === chosenMonth) ? chosenMonth : "";
  const rows = useMemo(() => activityRows(days, { status, month, query, sort }), [days, status, month, query, sort]);
  const weeks = useMemo(() => activityWeeks(rows), [rows]);
  const totals = useMemo(() => activityTotals(rows), [rows]);
  // Surviving keyed rows glide to their new places when a filter or the sort changes what is listed; a day newly listed
  // fades in, and a day that stays is never re-faded (FD-029, phase 6).
  const list = useRef<HTMLElement>(null);
  useRowGlide(list, ".activity-row", JSON.stringify([status, month, query, sort]));
  const listedBefore = useRef<ReadonlySet<string> | null>(null);
  const fresh: ReadonlySet<string> =
    listedBefore.current === null
      ? new Set()
      : new Set(rows.filter((row) => !listedBefore.current?.has(row.day.date)).map((row) => row.day.date));
  useLayoutEffect(() => {
    listedBefore.current = new Set(rows.map((row) => row.day.date));
  });

  return (
    <section class="dash activity-dashboard" aria-label="Recorded activity">
      {demo && (
        <section class="card cell-12 activity-sample" aria-label="Sample">
          <p class="card-subtitle">Sample days with synthetic amounts. Your own records stay separate.</p>
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
        <div class="activity-status">
          <RangeSelector
            label="Status"
            options={ACTIVITY_STATUSES.map((item) => ({ id: item, label: STATUS_LABELS[item] }))}
            value={status}
            onChange={(item) => {
              setStatus(parseActivityStatus(item));
            }}
          />
        </div>
      </section>

      <section ref={list} class="card cell-8 activity-list" aria-labelledby="activity-list-title">
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
                  <li class={fresh.has(row.day.date) ? "activity-row row-new" : "activity-row"} key={row.day.date}>
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
          <div class="activity-lead">
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
