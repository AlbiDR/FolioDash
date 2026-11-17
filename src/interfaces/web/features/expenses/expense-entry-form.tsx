import type { JSX } from "preact";
import {
  EXPENSE_LABELS,
  EXPENSE_OPTIONAL_INDICES,
  EXPENSE_REQUIRED_INDICES,
  isWorkday,
} from "../../../../core/expenses/work-expenses";
import { ExpenseAmount } from "./expense-format";
import type { ExpenseShared } from "./use-expense-editor";

export function ExpenseEntryForm(p: { readonly shared: ExpenseShared }): JSX.Element {
  const { props, x } = p.shared;
  const {
    hidden,
    editor,
    busy,
    parsed,
    needsCorrection,
    entryStatus,
    filled,
    missingRequired,
    requiredEntered,
    waiting,
    selectedConflict,
    total,
    cannotSave,
    updateField,
    save,
  } = x;
  function renderField(index: 0 | 1 | 2 | 3 | 4): JSX.Element {
    const optional = EXPENSE_OPTIONAL_INDICES.some((field) => field === index);
    return (
      <div
        data-filled={parsed.amounts[index] !== null}
        class={`field expense-field ${parsed.invalid.includes(index) ? "expense-invalid" : ""}`}
        key={EXPENSE_LABELS[index]}
      >
        <label for={`expense-${String(index)}`}>
          <span class="expense-field-name">
            {EXPENSE_LABELS[index]}
            {optional && <span class="expense-optional-label">Optional</span>}
          </span>
        </label>
        <span class="expense-input">
          <input
            id={`expense-${String(index)}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={hidden ? "••••" : editor.draft[index]}
            readOnly={hidden}
            aria-readonly={hidden}
            onClick={() => {
              if (hidden) props.onRevealAmounts?.();
            }}
            disabled={
              busy ||
              waiting ||
              !isWorkday(editor.date) ||
              editor.date > props.today ||
              !props.ready ||
              (selectedConflict !== undefined && !editor.resolving)
            }
            aria-invalid={parsed.invalid.includes(index)}
            aria-describedby={parsed.invalid.includes(index) ? `expense-error-${String(index)}` : "expense-entry-help"}
            onInput={(event) => {
              updateField(index, event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (hidden && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                props.onRevealAmounts?.();
              } else if (event.key === "Enter") event.preventDefault();
            }}
          />
          <span class="expense-unit" aria-hidden="true">
            €
          </span>
        </span>
        {parsed.invalid.includes(index) && (
          <p class="expense-error" id={`expense-error-${String(index)}`}>
            Use a non-negative amount, for example 12,50.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div class="expense-form">
        <h3 class="expense-group-title">Daily essentials</h3>
        <div class="expense-fields expense-required-fields">{EXPENSE_REQUIRED_INDICES.map(renderField)}</div>
        <section class="expense-optional-fields" aria-labelledby="expense-optional-heading">
          <h3 id="expense-optional-heading" class="expense-group-title">
            Optional work costs
          </h3>
          <p class="hint">Only when needed. Either cost completes a day, including 0.</p>
          <div class="expense-fields">{EXPENSE_OPTIONAL_INDICES.map(renderField)}</div>
        </section>
        <p id="expense-entry-help" class="hint">
          Amounts are in euros, with a comma for decimals. Enter 0 when nothing was paid; blanks stay blank.
        </p>
      </div>
      <div class="expense-save-dock">
        <div class="expense-day-total">
          <div>
            <span class="card-label">{entryStatus.complete ? "Day total" : "Recorded so far"}</span>
            <p class="expense-total">
              <ExpenseAmount cents={filled === 0 ? null : total} />
            </p>
          </div>
          <div class="expense-entry-completeness">
            <span>
              {entryStatus.complete && requiredEntered < EXPENSE_REQUIRED_INDICES.length
                ? "Work costs recorded; day complete"
                : `${String(requiredEntered)} of ${String(EXPENSE_REQUIRED_INDICES.length)} daily costs entered`}
            </span>
            {entryStatus.partial && (
              <span class="expense-state needs-review">
                {missingRequired} {missingRequired === 1 ? "daily cost needs" : "daily costs need"} review
              </span>
            )}
            <span class="expense-state expense-zero-slot" aria-hidden={hidden || !entryStatus.complete || total !== 0}>
              Zero-cost workday
            </span>
          </div>
        </div>
        <div class="expense-entry-actions">
          <div class="expense-save-slot" data-private={hidden}>
            <button
              type="button"
              class="primary expense-save-button"
              aria-hidden={hidden}
              tabIndex={hidden ? -1 : 0}
              disabled={cannotSave}
              onClick={() => void save()}
            >
              {busy
                ? "Saving…"
                : editor.resolving
                  ? "Save resolution"
                  : needsCorrection
                    ? "Review correction"
                    : editor.revision !== null
                      ? "Save added expenses"
                      : entryStatus.complete
                        ? "Save day"
                        : "Save partial day"}
            </button>
            <button
              type="button"
              class="primary expense-reveal"
              aria-hidden={!hidden}
              tabIndex={hidden ? 0 : -1}
              disabled={!hidden || busy || waiting}
              onClick={() => {
                props.onRevealAmounts?.();
                requestAnimationFrame(() => {
                  document.getElementById("expense-0")?.focus({ preventScroll: true });
                });
              }}
            >
              Show amounts to edit
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
