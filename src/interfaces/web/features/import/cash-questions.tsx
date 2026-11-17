import type { JSX } from "preact";
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { applyImport, planImport } from "../../../../core/statements/import-plan";
import type { StatementSource } from "../../../../applications/ledger/ledger-service";
import type {
  CheckResult,
  RecordRequest,
  RecordResult,
  RemoteSave,
} from "../../../../applications/import/import-model";
import { type IsoDate, formatDateLong } from "../../../../core/values/iso-date";
import type { LedgerState } from "../../../../core/portfolio/ledger";
import { computeMetrics } from "../../../../core/portfolio/metrics";
import { Amount } from "../../presentation/privacy/privacy";
import type { ReviewStatement } from "../../../../applications/import/import-model";
import { type Answer, BLANK, type CashReviewDraft, build } from "./cash-answers";
import { FundQuestion } from "./cash-fund-question";
import { CashSummary, SaveOutcome, type SaveState } from "./cash-outcome";

export function CashQuestions(props: {
  readonly statement: ReviewStatement;
  readonly date: IsoDate;
  readonly ledger: LedgerState;
  readonly createRevision: () => string;
  readonly onRecord: (next: LedgerState) => void;
  /** Collect a reviewed decision locally for a later, explicit whole-history confirmation. */
  readonly onReview?: (request: RecordRequest, next: LedgerState) => void;
  readonly initialDraft?: CashReviewDraft;
  readonly onDraft?: (draft: CashReviewDraft) => void;
  /** Present once the user has connected a spreadsheet. Without it, a statement is kept in this tab only. */
  readonly save?: RemoteSave;
  /** The bank statement being imported, saved with the month so the ledger can always be rebuilt from it. */
  readonly source?: StatementSource;
  readonly onSaveLock?: (locked: boolean) => void;
}): JSX.Element {
  const [saving, setSaving] = useState<SaveState>({ name: "idle" });
  const prefix = useId();
  const inFlight = useRef(false);
  const questions = useRef<HTMLElement>(null);
  const locked = saving.name === "saving" || saving.name === "unknown" || saving.name === "saved-not-reloaded";
  useEffect(() => {
    props.onSaveLock?.(locked);
  }, [locked, props.onSaveLock]);
  // One id per user action. It is kept across a failed attempt so a retry cannot be recorded twice.
  const [commandId, setCommandId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Readonly<Record<string, Answer>>>(props.initialDraft?.answers ?? {});
  const [moneyMoved, setMoneyMoved] = useState<"yes" | "no" | "">(props.initialDraft?.moneyMoved ?? "");
  useEffect(() => {
    props.onDraft?.({ answers, moneyMoved });
  }, [answers, moneyMoved, props.onDraft]);
  const [attempted, setAttempted] = useState(false);

  const rows = planImport(props.ledger, props.statement);
  const latest = props.ledger.snapshots[props.ledger.snapshots.length - 1];
  const needsMoneyQuestion = rows.some((row) => row.detected === "Held" || row.detected === "Reappeared");
  const built = build(rows, answers, needsMoneyQuestion ? moneyMoved : "no");
  const hasErrors = Object.keys(built.errors).length > 0;
  const result = hasErrors ? null : applyImport(props.ledger, props.statement, props.date, built.commands, "preview");

  function update(isin: string, patch: Partial<Answer>): void {
    setAnswers((current) => ({ ...current, [isin]: { ...(current[isin] ?? BLANK), ...patch } }));
  }

  function settle(outcome: RecordResult | CheckResult): void {
    switch (outcome.status) {
      case "recorded":
        props.onRecord(outcome.ledger);
        return;
      case "saved-not-reloaded":
        setSaving({ name: "saved-not-reloaded" });
        return;
      case "stale":
      case "rejected":
      case "damaged":
        setCommandId(null);
        setSaving({ name: "refused", outcome });
        return;
      case "not-saved":
        setSaving({ name: "not-saved", message: outcome.message });
        return;
      case "not-recorded":
        setCommandId(null);
        setSaving({
          name: "not-saved",
          message: "The spreadsheet shows this statement was not recorded. It is safe to try again.",
        });
        return;
      case "unknown":
        setSaving({ name: "unknown", message: outcome.message });
        return;
      case "cannot-tell":
        setSaving({ name: "unknown", message: outcome.message });
        return;
    }
  }

  async function saveToGoogle(save: RemoteSave): Promise<void> {
    if (result === null || !result.ok || inFlight.current || locked) return;
    inFlight.current = true;
    const id = commandId ?? save.newCommandId();
    setCommandId(id);
    setSaving({ name: "saving" });
    try {
      settle(
        await save.record(
          {
            date: props.date,
            statement: props.statement,
            commands: built.commands,
            ...(props.source === undefined ? {} : { source: props.source }),
          },
          id,
          props.ledger.revision,
        ),
      );
    } catch {
      setSaving({
        name: "unknown",
        message: "The save may or may not have been recorded. Check what happened before trying again.",
      });
    } finally {
      inFlight.current = false;
    }
  }

  async function checkSave(save: RemoteSave): Promise<void> {
    if (commandId === null || inFlight.current) return;
    inFlight.current = true;
    setSaving({ name: "saving", checking: true });
    try {
      settle(await save.check(commandId));
    } catch {
      setSaving({ name: "unknown", message: "The spreadsheet could not be checked. Try again shortly." });
    } finally {
      inFlight.current = false;
    }
  }

  function record(): void {
    if (locked || inFlight.current) return;
    setAttempted(true);
    if (result === null || !result.ok) {
      requestAnimationFrame(() => {
        const target =
          needsMoneyQuestion && moneyMoved === ""
            ? questions.current?.querySelector<HTMLInputElement>(".choice input")
            : questions.current?.querySelector<HTMLElement>('[data-invalid="true"] input, .review-problem');
        target?.focus();
      });
      return;
    }
    if (props.onReview !== undefined) {
      props.onReview(
        {
          date: props.date,
          statement: props.statement,
          commands: built.commands,
          ...(props.source === undefined ? {} : { source: props.source }),
        },
        result.state,
      );
      return;
    }
    if (props.save !== undefined) {
      void saveToGoogle(props.save);
      return;
    }
    const final = applyImport(props.ledger, props.statement, props.date, built.commands, props.createRevision());
    if (final.ok) props.onRecord(final.state);
  }

  /** Where the portfolio stands before this statement, from the same metrics Month by month uses. */
  const before = useMemo(
    () => (props.ledger.snapshots.length === 0 ? undefined : computeMetrics(props.ledger).at(-1)),
    [props.ledger],
  );
  /** And as it would stand once these answers are recorded; only known when every fund is answered and the result is valid. */
  const after = result?.ok === true ? computeMetrics(result.state).at(-1) : undefined;
  const unanswered = Object.keys(built.errors).length;
  const answered = Math.max(0, rows.length - unanswered);

  return (
    <section ref={questions} class="questions" aria-labelledby={`${prefix}-questions-heading`}>
      <aside class="questions-rail" aria-labelledby={`${prefix}-rail-heading`}>
        <h4 id={`${prefix}-rail-heading`}>Your statement so far</h4>
        <p class="rail-date">{formatDateLong(props.date)}</p>
        {rows.length > 0 && (
          <progress class="rail-progress" value={answered} max={rows.length} aria-label="Funds answered">
            {answered} of {rows.length}
          </progress>
        )}
        <p class="rail-status" role="status" aria-atomic="true">
          {result?.ok === true
            ? "Every fund is answered. Ready to continue."
            : rows.length === 0
              ? "No funds to answer."
              : `${String(answered)} of ${String(rows.length)} ${rows.length === 1 ? "fund" : "funds"} answered.`}
        </p>
        <dl class="facts stacked">
          <div>
            <dt>Funds in this statement</dt>
            <dd>{props.statement.funds.length}</dd>
          </div>
          <div>
            <dt>Funds subtotal</dt>
            <dd>
              <Amount cents={props.statement.fundsSubtotal} />
            </dd>
          </div>
          <div>
            <dt>Net invested before</dt>
            <dd>{before === undefined ? "-" : <Amount cents={before.invested} />}</dd>
          </div>
          <div>
            <dt>Net invested after</dt>
            <dd>
              {after === undefined ? (
                <span class="rail-waiting">After every fund is answered</span>
              ) : (
                <Amount cents={after.invested} />
              )}
            </dd>
          </div>
        </dl>
      </aside>
      <div class="questions-body">
        <h4 id={`${prefix}-questions-heading`} tabIndex={-1}>
          {latest === undefined ? "Set your starting balances" : "Review money in and out"}
        </h4>
        {latest === undefined ? (
          <p id={`${prefix}-opening-help`}>
            Start from your records as of {formatDateLong(props.date)}: total money paid into each fund, minus all money
            already received from it. Enter that net invested amount below. It is separate from the fund’s current
            market value.
          </p>
        ) : (
          <p>
            Include only money movements after {formatDateLong(latest.date)} and up to {formatDateLong(props.date)}.
            Changes in fund prices are already reflected in the values you entered.
          </p>
        )}

        {needsMoneyQuestion && (
          <fieldset class="choice" disabled={locked} aria-invalid={attempted && moneyMoved === "" ? "true" : undefined}>
            <legend>For funds already in your portfolio, did money go in or out?</legend>
            <label>
              <input
                type="radio"
                name={`${prefix}-money-moved`}
                checked={moneyMoved === "yes"}
                onChange={() => {
                  setMoneyMoved("yes");
                }}
              />{" "}
              Yes, money went in or out
            </label>
            <label>
              <input
                type="radio"
                name={`${prefix}-money-moved`}
                checked={moneyMoved === "no"}
                onChange={() => {
                  setMoneyMoved("no");
                }}
              />{" "}
              No money moved
            </label>
            <p class="hint">
              Include extra investments, partial sales, cash distributions and switches. New funds and full sales are
              reviewed separately below. For a switch, record money received from the old fund and money added to the
              new one.
            </p>
            {moneyMoved === "yes" && (
              <p id={`${prefix}-movement-help`} class="hint">
                <strong>Money added</strong> is contributions and money switched into a fund.{" "}
                <strong>Money received</strong> is the whole amount paid out by sales, withdrawals, cash distributions
                and switches out, not just the profit. Enter 0 where there was none.
              </p>
            )}
          </fieldset>
        )}

        {rows.map((row) => {
          const answer = answers[row.isin] ?? BLANK;
          const error = built.errors[row.isin];
          const showMoney = moneyMoved === "yes" && (row.detected === "Held" || row.detected === "Reappeared");
          return (
            <FundQuestion
              key={row.isin}
              row={row}
              answer={answer}
              error={error}
              showMoney={showMoney}
              attempted={attempted}
              locked={locked}
              prefix={prefix}
              update={update}
            />
          );
        })}

        {result !== null && !result.ok && (
          <div class="review-problem" role="alert" tabIndex={-1}>
            <h4>This cannot be recorded yet</h4>
            <ul>
              {result.issues.map((issue) => (
                <li key={`${issue.code}-${issue.isin ?? ""}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}

        {result?.ok === true && <CashSummary result={result} rows={rows} prefix={prefix} date={props.date} />}

        <p class="hint">
          {props.onReview !== undefined
            ? "This step only prepares your history. Nothing is saved until you review the complete history and confirm."
            : props.save === undefined
              ? "Not connected to Google: this statement will be kept in this browser tab only and is lost when the page reloads."
              : "Confirming saves this statement to your connected Google spreadsheet."}
        </p>
        <button type="button" class="primary" onClick={record} disabled={locked}>
          {saving.name === "saving"
            ? saving.checking === true
              ? "Checking the save…"
              : "Saving statement…"
            : props.onReview === undefined
              ? "Confirm and record this statement"
              : "Keep these answers and continue"}
        </button>
        {hasErrors && attempted && (
          <p class="field-error" role="alert">
            Some questions above still need an answer.
          </p>
        )}
        <div aria-live="polite" data-busy={saving.name === "saving"} class="status">
          {saving.name === "saving" && (
            <p>
              {saving.checking === true ? "Checking your spreadsheet without writing…" : "Saving to your spreadsheet…"}
            </p>
          )}
        </div>
        <SaveOutcome saving={saving} save={props.save} checkSave={checkSave} />
      </div>
    </section>
  );
}
