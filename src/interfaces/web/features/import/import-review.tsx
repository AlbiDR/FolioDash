import type { JSX } from "preact";
import { type IsoDate, formatDateLong, parseIsoDate } from "../../../../core/values/iso-date";
import type { LedgerState } from "../../../../core/portfolio/ledger";
import { Amount } from "../../presentation/privacy/privacy";
import type { DateSource } from "../../../../core/statements/statement-date";
import type { ImportReview, RemoteSave } from "../../../../applications/import/import-model";
import { CashQuestions } from "./cash-questions";
import { Issues, Statement } from "./import-statement";

const SOURCE_TEXT: Readonly<Record<DateSource, string>> = {
  "file-created": "Proposed from the time the bank created the file, in your local time.",
  "file-name": "Proposed from a date in the file name.",
  "file-modified": "Proposed from when the file was last saved on this device.",
};

export function Review(props: {
  readonly review: Extract<ImportReview, { status: "reviewed" }>;
  readonly sheetIndex: number;
  readonly onSheet: (index: number) => void;
  readonly date: string;
  readonly onDate: (value: string) => void;
  readonly ledger: LedgerState;
  readonly createRevision: () => string;
  readonly onRecord: (next: LedgerState, date: IsoDate) => void;
  readonly save?: RemoteSave;
  readonly onSaveLock?: (locked: boolean) => void;
  readonly locked?: boolean;
}): JSX.Element {
  const { review, sheetIndex, date } = props;
  const chosen = parseIsoDate(date);
  const sheet = review.sheets[sheetIndex];

  return (
    <div class="review">
      <h3>Review</h3>

      <div class="field">
        <label for="statement-date">Statement date</label>
        <input
          id="statement-date"
          type="date"
          disabled={props.locked}
          value={date}
          onInput={(event) => {
            props.onDate(event.currentTarget.value);
          }}
          aria-describedby="statement-date-hint"
        />
        <p class="hint" id="statement-date-hint">
          {chosen === null ? "Choose the day this statement was exported." : `${formatDateLong(chosen)}. `}
          {review.dateCandidate === null ? "" : SOURCE_TEXT[review.dateCandidate.source]} Check it before you go on.
        </p>
      </div>

      {review.sheets.length === 0 ? (
        <div class="review-problem" role="alert">
          <h4>No holdings sheet found</h4>
          <p>
            None of the sheets in this file match the supported Fideuram holdings layout. Choose the file exactly as the
            bank exported it.
          </p>
        </div>
      ) : (
        <>
          {review.sheets.length > 1 && (
            <div class="field">
              <label for="sheet-choice">Sheet to import</label>
              <select
                id="sheet-choice"
                disabled={props.locked}
                value={String(sheetIndex)}
                onChange={(event) => {
                  props.onSheet(Number(event.currentTarget.value));
                }}
              >
                {review.sheets.map((entry, index) => (
                  <option key={entry.name} value={String(index)}>
                    {entry.name}
                    {entry.outcome.ok ? "" : " (has problems)"}
                  </option>
                ))}
              </select>
            </div>
          )}
          {sheet === undefined ? null : sheet.outcome.ok ? (
            <>
              <Statement statement={sheet.outcome.statement} />
              {chosen === null ? (
                <p>Choose the statement date above to continue.</p>
              ) : (
                <CashQuestions
                  key={`${sheet.name}-${chosen}-${props.ledger.revision}`}
                  statement={sheet.outcome.statement}
                  date={chosen}
                  ledger={props.ledger}
                  createRevision={props.createRevision}
                  source={{ sheetName: sheet.name, sheet: sheet.raw }}
                  {...(props.save === undefined ? {} : { save: props.save })}
                  {...(props.onSaveLock === undefined ? {} : { onSaveLock: props.onSaveLock })}
                  onRecord={(next) => {
                    props.onRecord(next, chosen);
                  }}
                />
              )}
            </>
          ) : (
            <Issues issues={sheet.outcome.issues} />
          )}
        </>
      )}
    </div>
  );
}

export function RecordedSummary(props: { readonly ledger: LedgerState }): JSX.Element | null {
  const latest = props.ledger.snapshots[props.ledger.snapshots.length - 1];
  if (latest === undefined) return null;
  return (
    <section aria-labelledby="recorded-heading" class="recorded">
      <h3 id="recorded-heading">Recorded in this browser tab</h3>
      <p>
        {props.ledger.snapshots.length} {props.ledger.snapshots.length === 1 ? "statement" : "statements"}, latest{" "}
        {formatDateLong(latest.date)}. This is kept only while this page stays open; saving to Google is not connected
        yet.
      </p>
      <table class="funds">
        <thead>
          <tr>
            <th scope="col">Fund</th>
            <th scope="col">Value</th>
            <th scope="col">Net invested</th>
          </tr>
        </thead>
        <tbody>
          {props.ledger.funds.map((fund) => {
            const holding = latest.holdings[fund.isin];
            return holding === undefined ? null : (
              <tr key={fund.isin}>
                <th scope="row">
                  {fund.name}
                  <span class="fund-isin">{holding.status === "closed" ? "Closed" : "Active"}</span>
                </th>
                <td>
                  <Amount cents={holding.value} />
                </td>
                <td>
                  <Amount cents={holding.netInvested} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
