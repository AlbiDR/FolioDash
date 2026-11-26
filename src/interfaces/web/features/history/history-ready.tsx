import type { JSX, RefObject } from "preact";
import type { HistoryStatement } from "../../../../applications/import/history-import";
import { formatDateLong } from "../../../../core/values/iso-date";
import type { Phase } from "./history-phase";

/** What a chosen history file holds and what saving it will do. Starting is offered only when a save is possible. */
export function HistoryReady(props: {
  readonly phase: Extract<Phase, { readonly name: "ready" }>;
  readonly fileName: string;
  readonly heading: RefObject<HTMLHeadingElement | null>;
  readonly onStart?: () => void;
}): JSX.Element {
  const { phase, fileName } = props;
  const withSource = phase.statements.some((statement: HistoryStatement) => statement.source !== undefined);
  return (
    <div class="review-adjustments" role="status">
      <h3 ref={props.heading} tabIndex={-1}>
        Ready
      </h3>
      <p>
        {fileName} holds {phase.statements.length} statements, from {formatDateLong(phase.statements[0]?.date as never)}{" "}
        to {formatDateLong(phase.statements[phase.statements.length - 1]?.date as never)}. Your spreadsheet already
        holds {phase.alreadyRecorded}; {phase.toSave.length} new {phase.toSave.length === 1 ? "month" : "months"} will
        be saved.
      </p>
      {withSource && (
        <p>
          Each month in this file carries its exact bank statement. Any month your spreadsheet holds without its
          statement gets it attached, in one step. The figures already saved do not change, and a statement that does
          not reproduce its month is refused.
        </p>
      )}
      {phase.toSave.length === 0 && !(phase.alreadyRecorded > 0 && withSource) ? (
        <p>Nothing to do: the spreadsheet already holds this whole history.</p>
      ) : (
        props.onStart !== undefined && (
          <button type="button" class="primary" onClick={props.onStart}>
            {phase.toSave.length > 0
              ? `Save ${String(phase.toSave.length)} new ${phase.toSave.length === 1 ? "month" : "months"} and attach bank statements`
              : "Check and attach bank statements"}
          </button>
        )
      )}
    </div>
  );
}
