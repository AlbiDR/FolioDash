import type { JSX } from "preact";
import type { FundCommand, PlanRow, applyImport } from "../../../../core/statements/import-plan";
import type { RecordResult, RemoteSave } from "../../../../applications/import/import-model";
import { type IsoDate, formatDateLong } from "../../../../core/values/iso-date";
import { Amount } from "../../presentation/privacy/privacy";
import { Presence } from "../../shared/ui/presence";

const ACTION_TEXT: Readonly<Record<FundCommand["action"], string>> = {
  Start: "Starting balance",
  Add: "New fund",
  Keep: "Still held",
  Close: "Fully sold",
  Reopen: "Held again",
  Closed: "Remains closed",
};

export type SaveState =
  | { readonly name: "idle" }
  | { readonly name: "saving"; readonly checking?: boolean }
  | { readonly name: "not-saved"; readonly message: string }
  | { readonly name: "refused"; readonly outcome: Extract<RecordResult, { status: "stale" | "rejected" | "damaged" }> }
  | { readonly name: "saved-not-reloaded" }
  | { readonly name: "unknown"; readonly message: string };

export function CashSummary(props: {
  readonly result: Extract<ReturnType<typeof applyImport>, { readonly ok: true }>;
  readonly rows: readonly PlanRow[];
  readonly prefix: string;
  readonly date: IsoDate;
}): JSX.Element {
  const { result, rows, prefix } = props;
  return (
    <section aria-labelledby={`${prefix}-summary-heading`} class="summary">
      <h4 id={`${prefix}-summary-heading`}>What will be recorded for {formatDateLong(props.date)}</h4>
      <ul class="fund-summary">
        {rows.map((row) => {
          const holding = result.state.snapshots[result.state.snapshots.length - 1]?.holdings[row.isin];
          return holding === undefined ? null : (
            <li key={row.isin}>
              <p class="fund-summary-name">
                {result.state.funds.find((fund) => fund.isin === row.isin)?.name ?? row.name}
              </p>
              <dl class="facts">
                <div>
                  <dt>After this update</dt>
                  <dd>{ACTION_TEXT[holding.action]}</dd>
                </div>
                <div>
                  <dt>Money added</dt>
                  <dd>
                    <Amount cents={holding.moneyIn} />
                  </dd>
                </div>
                <div>
                  <dt>Money received</dt>
                  <dd>
                    <Amount cents={holding.moneyOut} />
                  </dd>
                </div>
                <div>
                  <dt>Net invested</dt>
                  <dd>
                    <Amount cents={holding.netInvested} />
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
      <p>
        Check the money added and received for each fund, including both sides of any switch. Percentages that depend on
        when cash moved are estimates.
      </p>
    </section>
  );
}

export function SaveOutcome(props: {
  readonly saving: SaveState;
  readonly save: RemoteSave | undefined;
  readonly checkSave: (save: RemoteSave) => Promise<void>;
}): JSX.Element {
  const { saving, checkSave } = props;
  return (
    <>
      <Presence show={saving.name === "not-saved"}>
        {saving.name === "not-saved" && (
          <div class="review-problem" role="alert">
            <h4>Not saved</h4>
            <p>{saving.message}</p>
          </div>
        )}
      </Presence>
      <Presence show={saving.name === "refused"}>
        {saving.name === "refused" && (
          <div class="review-problem" role="alert">
            <h4>Not saved</h4>
            {saving.outcome.status === "stale" && (
              <p>
                Another device changed your portfolio. This statement was not saved. Your inputs are still here. Check
                the updated history and review your decisions before confirming again; reconnect in Your data if Google
                could not be checked.
              </p>
            )}
            {saving.outcome.status === "rejected" && (
              <>
                <p>The spreadsheet service checked the statement and did not accept it. Nothing was saved.</p>
                <ul>
                  {saving.outcome.messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </>
            )}
            {saving.outcome.status === "damaged" && (
              <p>{saving.outcome.message} Nothing was saved. Do not record anything until the ledger is restored.</p>
            )}
          </div>
        )}
      </Presence>
      <Presence show={saving.name === "saved-not-reloaded"}>
        {saving.name === "saved-not-reloaded" && (
          <div class="review-problem" role="alert">
            <h4>Saved, but not reloaded</h4>
            <p>
              The statement was recorded in your spreadsheet, but the ledger could not be read back. Do not record it
              again. Checking reads your spreadsheet and writes nothing.
            </p>
            {props.save !== undefined && (
              <button type="button" onClick={() => void checkSave(props.save as RemoteSave)}>
                Check what happened
              </button>
            )}
          </div>
        )}
      </Presence>
      <Presence show={saving.name === "unknown" && props.save !== undefined}>
        {saving.name === "unknown" && props.save !== undefined && (
          <div class="review-problem" role="alert">
            <h4>The result is not known</h4>
            <p>{saving.message}</p>
            <p>Do not try again yet. Checking reads your spreadsheet and writes nothing.</p>
            <button type="button" onClick={() => void checkSave(props.save as RemoteSave)}>
              Check what happened
            </button>
          </div>
        )}
      </Presence>
    </>
  );
}
