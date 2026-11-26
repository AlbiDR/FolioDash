import type { JSX } from "preact";
import type {
  ExcelHistoryEntry,
  ExcelHistoryReview,
  planExcelHistory,
} from "../../../../applications/import/excel-history";
import type { LedgerState } from "../../../../core/portfolio/ledger";
import { parseIsoDate } from "../../../../core/values/iso-date";
import { statementDateIssue } from "../../../../core/statements/import-plan";
import { Amount } from "../../presentation/privacy/privacy";
import { Presence } from "../../shared/ui/presence";

/** The first step: pick the statements to include and check each date, before anything is reviewed. */
export function ExcelDatesStep(props: {
  readonly review: ExcelHistoryReview;
  readonly ledger: LedgerState;
  readonly entries: readonly ExcelHistoryEntry[];
  readonly setEntries: (update: (current: readonly ExcelHistoryEntry[]) => readonly ExcelHistoryEntry[]) => void;
  readonly change: (id: string, patch: Partial<ExcelHistoryEntry>) => void;
  readonly plan: ReturnType<typeof planExcelHistory>;
  readonly begin: () => void;
}): JSX.Element {
  const { entries, setEntries, change, plan, begin } = props;
  return (
    <>
      <p>
        All files were checked locally. Select the statements to include and check every date. They will be reviewed
        oldest first. This selection step does not save anything.
      </p>
      <p class="hint">
        One statement per calendar month is currently supported. If you have more than one export for a month, select
        the one you want to use.
      </p>
      <p class="hint">
        For a workbook with several statements, a full date in each sheet name is proposed (YYYY-MM-DD or DD-MM-YYYY).
        Otherwise enter it below. The workbook's creation date is never applied to all its sheets.
      </p>
      <Presence show={props.review.problems.length > 0}>
        {props.review.problems.length > 0 && (
          <div class="review-problem" role="alert">
            <h4>Choose the files again to resolve these problems</h4>
            <ul>
              {props.review.problems.map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
      </Presence>
      <Presence show={props.review.notices.length > 0}>
        {props.review.notices.length > 0 && (
          <div class="notice notice-warning">
            <h4>Sheets not included</h4>
            <p>Check that none of these sheets contain statements you need.</p>
            <ul>
              {props.review.notices.map((notice, index) => (
                <li key={index}>{notice}</li>
              ))}
            </ul>
          </div>
        )}
      </Presence>
      {props.ledger.snapshots.at(-1) !== undefined && (
        <button
          type="button"
          onClick={() => {
            const latest = props.ledger.snapshots.at(-1)?.date;
            setEntries((current) =>
              current.map((entry) => {
                const date = parseIsoDate(entry.date);
                return date !== null && statementDateIssue(date, latest) !== null
                  ? { ...entry, selected: false }
                  : entry;
              }),
            );
          }}
        >
          Exclude statements from months already recorded or earlier
        </button>
      )}
      {entries.map((entry) => (
        <fieldset key={entry.id}>
          <legend>
            {entry.fileName} / {entry.sheet.name}
          </legend>
          <label>
            <input
              type="checkbox"
              checked={entry.selected}
              onChange={(event) => {
                change(entry.id, { selected: event.currentTarget.checked });
              }}
            />{" "}
            Include this statement
          </label>
          <div class="field">
            <label for={`batch-date-${entry.id}`}>Statement date</label>
            <input
              id={`batch-date-${entry.id}`}
              type="date"
              value={entry.date}
              disabled={!entry.selected}
              onInput={(event) => {
                change(entry.id, { date: event.currentTarget.value });
              }}
            />
          </div>
          {entry.sheet.outcome.ok ? (
            <p>
              {entry.sheet.outcome.statement.funds.length} funds. Funds subtotal:{" "}
              <Amount cents={entry.sheet.outcome.statement.fundsSubtotal} />.
            </p>
          ) : (
            <div class="review-problem">
              <ul>
                {entry.sheet.outcome.issues.map((issue, index) => (
                  <li key={index}>
                    {issue.cell === null ? "" : `${issue.cell}: `}
                    {issue.message}
                  </li>
                ))}
              </ul>
              <p>Choose a fresh bank export, or exclude this statement.</p>
            </div>
          )}
        </fieldset>
      ))}
      <Presence show={!plan.ok}>
        {!plan.ok && (
          <div class="review-problem" role="status">
            <ul>
              {plan.messages.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </Presence>
      <p class="hint" aria-live="polite">
        {entries.filter((entry) => entry.selected).length} of {entries.length} statements selected.
      </p>
      <button type="button" class="primary" disabled={!plan.ok || props.review.problems.length > 0} onClick={begin}>
        Review selected statements in date order
      </button>
    </>
  );
}
