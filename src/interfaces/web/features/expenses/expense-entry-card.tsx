import type { JSX } from "preact";
import { formatDateLong, parseIsoDate } from "../../../../core/values/iso-date";
import { EMPTY_EXPENSE_DRAFT, type ExpenseDraft } from "./expense-draft";
import { EXPENSE_LABELS, EXPENSE_REQUIRED_INDICES, isWorkday } from "../../../../core/expenses/work-expenses";
import { Icon } from "../../shared/ui/icons";
import { Presence } from "../../shared/ui/presence";
import { ExpenseAmount, labelFor, weekdayLabel, workdayLabel } from "./expense-format";
import { ExpenseEntryForm } from "./expense-entry-form";
import type { ExpenseShared } from "./use-expense-editor";

export function ExpenseEntryCard(p: { readonly shared: ExpenseShared }): JSX.Element {
  const { props, x } = p.shared;
  const {
    hidden,
    editor,
    setEditor,
    busy,
    feedback,
    pending,
    reviewing,
    setReviewing,
    destination,
    setDestination,
    editorElement,
    reviewHeading,
    parsed,
    entryStatus,
    filled,
    dirty,
    waiting,
    locked,
    demo,
    writable,
    selectedConflict,
    earlierVersions,
    selectedKind,
    cannotSave,
    openDay,
    discard,
    save,
    recoverVersion,
    stepName,
    previousDay,
    nextDay,
    previousWorkday,
    nextWorkday,
    entryDisabled,
    showForm,
  } = x;
  return (
    <article class="card expense-entry" ref={editorElement} aria-labelledby="expense-entry-heading" data-dirty={dirty}>
      <div class="expense-card-heading">
        <div>
          <p class="eyebrow">{demo ? "Record a day · sample" : "Record a day"}</p>
          <h2
            id="expense-entry-heading"
            class="card-title expense-date"
            key={editor.date}
            aria-live="polite"
            aria-atomic="true"
            tabIndex={-1}
          >
            {weekdayLabel(editor.date)}, {formatDateLong(editor.date)}
          </h2>
        </div>
        <span class={`expense-state ${entryStatus.partial ? "needs-review" : ""}`}>
          {selectedConflict !== undefined && !editor.resolving
            ? "Conflicting versions"
            : dirty
              ? "Unsaved changes"
              : props.ready
                ? labelFor(selectedKind)
                : "Not checked"}
        </span>
      </div>
      <div class="expense-date-controls" role="group" aria-label="Choose a workday">
        <button
          type="button"
          aria-label={stepName("Previous", previousDay)}
          disabled={busy || waiting}
          onClick={() => {
            if (previousDay !== null) openDay(previousDay);
          }}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={busy || waiting}
          onClick={() => {
            openDay(props.today);
          }}
        >
          Today
        </button>
        <button
          type="button"
          aria-label={stepName("Next", nextDay)}
          disabled={busy || waiting}
          onClick={() => {
            if (nextDay !== null) openDay(nextDay);
          }}
        >
          Next
        </button>
        <label class="expense-jump">
          <span class="visually-hidden">Jump to date</span>
          <input
            type="date"
            aria-label="Jump to date"
            value={editor.date}
            disabled={busy || waiting}
            onChange={(event) => {
              const date = parseIsoDate(event.currentTarget.value);
              if (date !== null) openDay(date);
            }}
          />
        </label>
      </div>
      <Presence show={!isWorkday(editor.date)}>
        {!isWorkday(editor.date) && (
          <div class="expense-note">
            <p>The tracker covers Monday to Friday, so there is nothing to record on a weekend.</p>
            <div class="expense-note-actions">
              {previousWorkday !== null && (
                <button
                  type="button"
                  aria-label={`Previous workday, ${workdayLabel(previousWorkday)}`}
                  disabled={busy || waiting}
                  onClick={() => {
                    openDay(previousWorkday);
                  }}
                >
                  <Icon name="back" size={16} />
                  {workdayLabel(previousWorkday)}
                </button>
              )}
              {nextWorkday !== null && (
                <button
                  type="button"
                  aria-label={`Next workday, ${workdayLabel(nextWorkday)}`}
                  disabled={busy || waiting}
                  onClick={() => {
                    openDay(nextWorkday);
                  }}
                >
                  {workdayLabel(nextWorkday)}
                  <Icon name="chevron" size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </Presence>
      <Presence show={isWorkday(editor.date) && editor.date > props.today}>
        {isWorkday(editor.date) && editor.date > props.today && (
          <p class="expense-note">This day has not happened yet. Browse ahead, and record it when it arrives.</p>
        )}
      </Presence>
      <Presence show={showForm}>{showForm && <ExpenseEntryForm shared={p.shared} />}</Presence>
      <Presence show={showForm}>
        {showForm && (
          <div class="expense-entry-actions expense-secondary-actions">
            {filled === 0 && (
              <button
                type="button"
                disabled={hidden || entryDisabled}
                onClick={() => {
                  setEditor((current) => ({
                    ...current,
                    draft: EMPTY_EXPENSE_DRAFT.map((_, index) =>
                      EXPENSE_REQUIRED_INDICES.some((field) => field === index) ? "0" : "",
                    ) as unknown as ExpenseDraft,
                  }));
                }}
              >
                {editor.date === props.today ? "No costs today" : "No costs this day"}
              </button>
            )}
            {dirty && (
              <button type="button" disabled={busy || waiting} onClick={discard}>
                Discard draft
              </button>
            )}
          </div>
        )}
      </Presence>
      <Presence show={reviewing}>
        {reviewing && (
          <div class="expense-review" role="region" aria-label="Review correction">
            <h3 ref={reviewHeading} tabIndex={-1}>
              {filled === 0
                ? "Change this day to no onsite work?"
                : editor.resolving
                  ? "Resolve these conflicting versions?"
                  : "Review your correction"}
            </h3>
            <p>
              {filled === 0
                ? "All five fields will be blank. This past weekday will no longer count as a recorded onsite workday. The earlier entry remains in history."
                : "Confirm the amounts below. This saves a new revision and keeps the earlier entry recoverable in history."}
            </p>
            <dl>
              {EXPENSE_LABELS.map(
                (label, index) =>
                  (editor.resolving || parsed.amounts[index] !== editor.original[index]) && (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        <ExpenseAmount cents={editor.original[index] ?? null} empty="Blank" />
                        <span aria-hidden="true"> → </span>
                        <span class="visually-hidden"> changes to </span>
                        <ExpenseAmount cents={parsed.amounts[index] ?? null} empty="Blank" />
                      </dd>
                    </div>
                  ),
              )}
            </dl>
            <div class="expense-entry-actions">
              <button class="primary" type="button" disabled={hidden || busy} onClick={() => void save(true)}>
                Confirm correction
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setReviewing(false);
                  editorElement.current
                    ?.querySelector<HTMLButtonElement>(".expense-save-button")
                    ?.focus({ preventScroll: true });
                }}
              >
                Keep editing
              </button>
            </div>
          </div>
        )}
      </Presence>
      <Presence show={destination !== null}>
        {destination !== null && (
          <div class="expense-review" role="region" aria-label="Unsaved day">
            <h3>Your changes are still here</h3>
            <p>Save this day or discard its draft before opening {formatDateLong(destination)}.</p>
            <div class="expense-entry-actions">
              <button
                type="button"
                onClick={() => {
                  setDestination(null);
                }}
              >
                Keep editing
              </button>
              <button type="button" disabled={cannotSave} onClick={() => void save()}>
                Save this day
              </button>
              <button type="button" onClick={discard}>
                Discard and open day
              </button>
            </div>
          </div>
        )}
      </Presence>
      <div class="expense-save-feedback" role="status" aria-live="polite">
        <p key={feedback || String(dirty)}>
          {feedback ||
            (!showForm
              ? ""
              : dirty
                ? "Your changes are not saved yet."
                : editor.revision !== null
                  ? demo
                    ? "Demo entry. Changes affect this preview only."
                    : "This entry is saved."
                  : "Nothing is saved until you choose Save.")}
        </p>
        {pending !== null && (
          <button type="button" disabled={busy} onClick={() => void save(true)}>
            Check save outcome
          </button>
        )}
      </div>
      {earlierVersions.length > 0 && (
        <details class="expense-previous">
          <summary>
            Previous saved versions <span class="expense-version-count">{earlierVersions.length}</span>
          </summary>
          <p class="hint">
            Earlier entries stay in history. Use their amounts as a draft, then review and confirm a new correction.
          </p>
          {earlierVersions.map((command, index) => (
            <details class="expense-old-version" key={command.id}>
              <summary>Earlier version {earlierVersions.length - index}</summary>
              <dl>
                {EXPENSE_LABELS.map((label, field) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      <ExpenseAmount cents={command.amounts[field] ?? null} empty="Blank" />
                    </dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                disabled={hidden || locked || !props.ready || !writable || selectedConflict !== undefined}
                onClick={() => {
                  recoverVersion(command);
                }}
              >
                Use these amounts
              </button>
            </details>
          ))}
        </details>
      )}
    </article>
  );
}
