import type { JSX } from "preact";
import type { HistoryStatement } from "../../../../applications/import/history-import";
import type { RemoteSave } from "../../../../applications/import/import-model";
import { formatDateLong } from "../../../../core/values/iso-date";
import { Amount } from "../../presentation/privacy/privacy";
import type { Failure, Stage } from "./excel-history-types";
import { Presence } from "../../shared/ui/presence";

/** From the final confirmation to the end: the saves in progress, a pause with its way on, or the finished history. */
export function ExcelConfirmStage(props: {
  readonly stage: Stage;
  readonly statements: readonly HistoryStatement[];
  readonly saved: number;
  readonly save: RemoteSave | undefined;
  readonly saveRemaining: (save: RemoteSave) => Promise<void>;
  readonly failure: Failure | null;
  readonly uncertain: boolean;
  readonly checking: boolean;
  readonly check: (save: RemoteSave) => Promise<void>;
}): JSX.Element {
  const { stage, statements, saved, saveRemaining, failure, uncertain, checking, check } = props;
  return (
    <>
      <p>
        {statements.length} statements reviewed. {saved} saved and checked. Each statement is saved separately; if
        saving stops, earlier confirmed statements remain saved.
      </p>
      <ol>
        {statements.map((statement, index) => (
          <li key={statement.commandId}>
            {formatDateLong(statement.date)}: {statement.statement.funds.length} funds,{" "}
            <Amount cents={statement.statement.fundsSubtotal} />.{" "}
            {index < saved ? "Saved and checked." : "Not yet confirmed saved."}
          </li>
        ))}
      </ol>
      {stage === "confirm" && (
        <>
          <p>
            Confirm to save these statements, including their bank-sheet contents and your reviewed cash decisions, to
            your connected Google spreadsheet.
          </p>
          {props.save === undefined ? (
            <p class="notice notice-warning">Connect to Google before saving. No history has been saved.</p>
          ) : (
            <button
              type="button"
              class="primary"
              onClick={() => {
                void saveRemaining(props.save as RemoteSave);
              }}
            >
              Confirm and save {statements.length} statements
            </button>
          )}
        </>
      )}
      {stage === "saving" && (
        <div class="status" data-busy="true" role="status">
          <p>
            Saving and checking statement {Math.min(saved + 1, statements.length)} of {statements.length}. Keep this
            page open.
          </p>
          <div
            class="history-progress"
            role="progressbar"
            aria-label="Statements confirmed saved"
            aria-valuemin={0}
            aria-valuemax={Math.max(1, statements.length)}
            aria-valuenow={saved}
            style={{ "--completion": `${String((saved / Math.max(1, statements.length)) * 100)}%` }}
          />
        </div>
      )}
      <Presence show={stage === "stopped"}>
        {stage === "stopped" && (
          <div class="review-problem" role="alert">
            <h4>Import paused after {saved} confirmed saves</h4>
            {failure?.status === "unknown" && (
              <p>{failure.message} Do not retry this save until its outcome is checked.</p>
            )}
            {failure?.status === "saved-not-reloaded" && (
              <p>This statement was saved, but its history could not be read back. Check again before continuing.</p>
            )}
            {failure?.status === "not-saved" && <p>{failure.message}</p>}
            {failure?.status === "stale" && (
              <p>
                Another device changed your history. Nothing from the stopped statement was saved. Return to selection
                and review the remaining statements against the updated history; reconnect in Your data if Google could
                not be checked.
              </p>
            )}
            {failure?.status === "rejected" && (
              <ul>
                {failure.messages.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
            {failure?.status === "damaged" && (
              <p>{failure.message} Do not save more until your history is recovered.</p>
            )}
            {uncertain && props.save !== undefined && (
              <button
                type="button"
                disabled={checking}
                onClick={() => {
                  void check(props.save as RemoteSave);
                }}
              >
                {checking ? "Checking the save…" : "Check what happened"}
              </button>
            )}
            {(failure === null || failure.status === "not-saved") && props.save !== undefined && (
              <button
                type="button"
                onClick={() => {
                  void saveRemaining(props.save as RemoteSave);
                }}
              >
                Resume remaining statements
              </button>
            )}
          </div>
        )}
      </Presence>
      {stage === "done" && (
        <>
          <p role="status">
            All selected statements are saved to your spreadsheet and checked. Your portfolio is ready to view.
          </p>
          <a class="primary link-button" href="#overview">
            View your portfolio
          </a>
        </>
      )}
    </>
  );
}
