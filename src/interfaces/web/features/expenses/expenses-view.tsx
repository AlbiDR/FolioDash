import { Presence } from "../../shared/ui/presence";
import type { JSX } from "preact";
import { PageNav } from "../../shared/ui/page-nav";
import { ExpenseEntryCard } from "./expense-entry-card";
import { ExpenseRecordCard } from "./expense-record-card";
import { ExpenseWeekCard } from "./expense-week-card";
import { ExpenseYearSection } from "./expense-year-section";
import type { ExpensesViewProps } from "./expense-types";
import { useExpenseEditor } from "./use-expense-editor";
import "./styles/base.css";
import "./styles/record-a-day.css";
import "./styles/week-and-year.css";
import "./styles/categories-and-record.css";
import "./styles/responsive-and-hover.css";

/** All amounts and eligibility come from the canonical expense model. This view owns only drafts and inspection. */
export function ExpensesView(props: ExpensesViewProps): JSX.Element {
  const x = useExpenseEditor(props);
  const shared = { props, x };
  const { demo, locked, recordsNotice, busy, pending, yearConflictNote, checkStoredSave } = x;

  return (
    <section class="dash expenses-dashboard">
      {demo && (
        <section class="card get-started cell-12" aria-labelledby="expenses-demo-title">
          <h2 id="expenses-demo-title" class="card-title">
            You are exploring a sample
          </h2>
          <p class="card-subtitle">
            Try recording expenses with synthetic data. Your own records stay separate. Continue with Google to start
            your own tracker.
          </p>
          {props.onConnect !== undefined && (
            <button class="primary" type="button" disabled={locked} onClick={() => void props.onConnect?.()}>
              Continue with Google
            </button>
          )}
        </section>
      )}
      <Presence show={recordsNotice !== ""} class="cell-12">
        {recordsNotice !== "" && (
          <div class="notice" role="status">
            <p>{recordsNotice}</p>
            {props.onRefresh !== undefined && (
              <button type="button" disabled={busy} onClick={() => void props.onRefresh?.()}>
                Check records
              </button>
            )}
          </div>
        )}
      </Presence>
      <Presence show={props.pending === true && pending === null} class="cell-12">
        {props.pending === true && pending === null && (
          <div class="notice notice-warning" role="status">
            <p>An earlier save is awaiting confirmation. Check that original save before editing another day.</p>
            <button type="button" disabled={busy} onClick={() => void checkStoredSave()}>
              Check original save
            </button>
          </div>
        )}
      </Presence>
      <Presence show={yearConflictNote} class="cell-12">
        {yearConflictNote && (
          <p class="notice notice-warning" role="status">
            This year has conflicting day versions. Its summaries remain unavailable until those days are resolved
            below.
          </p>
        )}
      </Presence>

      <ExpenseEntryCard shared={shared} />

      <ExpenseWeekCard shared={shared} />

      <PageNav
        items={[
          { id: "expense-year-heading", label: "Year" },
          { id: "expense-breakdown", label: "Categories" },
          { id: "expense-record-heading", label: "Record" },
        ]}
      />

      <ExpenseYearSection shared={shared} />

      <ExpenseRecordCard shared={shared} />
    </section>
  );
}
