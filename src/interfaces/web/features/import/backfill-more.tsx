import type { JSX } from "preact";
import type { StatementSource } from "../../../../applications/ledger/ledger-service";
import type { ReviewStatement } from "../../../../applications/import/import-model";
import type { CashReviewDraft } from "./cash-answers";
import type { DraftRow, Stage } from "./backfill-types";

/** Between steps: add another earlier month, or go on to the connection with the saved history. */
export function BackfillMore(props: {
  readonly setRows: (rows: readonly DraftRow[]) => void;
  readonly setDate: (date: string) => void;
  readonly setFileStatement: (statement: { statement: ReviewStatement; source: StatementSource } | null) => void;
  readonly setBoundaryDraft: (draft: CashReviewDraft | null) => void;
  readonly setStage: (stage: Stage) => void;
}): JSX.Element {
  const { setRows, setDate, setFileStatement, setBoundaryDraft, setStage } = props;
  return (
    <section>
      <h4>Earlier month reviewed</h4>
      <p>Add any other earlier months in date order, or review the connection to your saved history.</p>
      <button
        type="button"
        onClick={() => {
          setRows([{ id: 1, name: "", isin: "", amount: "" }]);
          setDate("");
          setFileStatement(null);
          setBoundaryDraft(null);
          setStage("values");
        }}
      >
        Add another earlier month
      </button>
      <button
        type="button"
        class="primary"
        onClick={() => {
          setStage("boundary");
        }}
      >
        Review movements to first saved month
      </button>
    </section>
  );
}
