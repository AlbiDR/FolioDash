import type { JSX } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { type FundCommand, type PlanRow, applyImport, planImport } from "../../../../core/ImportPlan";
import type { StatementSource } from "../../../../applications/LedgerService";
import type { CheckResult, RecordRequest, RecordResult, RemoteSave } from "../../../../applications/ImportModel";
import { type IsoDate, formatDateLong } from "../../../../core/IsoDate";
import type { LedgerState } from "../../../../core/Ledger";
import { type EuroCents, ZERO_CENTS, parseItalianAmount } from "../../../../core/Money";
import { Amount } from "../../presentation/privacy/privacy";
import type { ReviewStatement } from "../../../../applications/ImportModel";

interface Answer {
  readonly opening: string;
  readonly moneyIn: string;
  readonly moneyOut: string;
  readonly name: string;
  /** For a fund missing from the statement: was it fully sold? */
  readonly sold: "yes" | "no" | "";
  /** For a fund the bank lists at zero value. */
  readonly zero: "keep" | "close";
  readonly reopen: boolean;
}

const BLANK: Answer = { opening: "", moneyIn: "", moneyOut: "", name: "", sold: "", zero: "keep", reopen: false };
export interface CashReviewDraft {
  readonly answers: Readonly<Record<string, Answer>>;
  readonly moneyMoved: "yes" | "no" | "";
}
const AMOUNT_HINT = "Use Italian notation, for example 1.000,50. Enter 0 if there was none.";

function amount(text: string): EuroCents | null {
  return text.trim() === "" ? null : parseItalianAmount(text);
}

interface Built {
  readonly commands: FundCommand[];
  readonly errors: Readonly<Record<string, string>>;
}

function build(rows: readonly PlanRow[], answers: Readonly<Record<string, Answer>>, moneyMoved: "yes" | "no" | ""): Built {
  const commands: FundCommand[] = [];
  const errors: Record<string, string> = {};
  for (const row of rows) {
    const answer = answers[row.isin] ?? BLANK;
    const fail = (message: string): void => {
      errors[row.isin] = message;
    };
    const required = (text: string, what: string): EuroCents | null => {
      const value = amount(text);
      if (value === null) fail(`${what}. ${AMOUNT_HINT}`);
      return value;
    };
    const base = { isin: row.isin, comment: "" };

    if (row.detected === "Opening") {
      const opening = required(answer.opening, "Enter the net invested as of the statement date");
      if (opening !== null) commands.push({ ...base, action: "Start", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, openingNetInvested: opening });
    } else if (row.detected === "New") {
      const moneyIn = required(answer.moneyIn, "Enter the cash paid into this new fund");
      if (moneyIn !== null) {
        commands.push({ ...base, action: "Add", moneyIn, moneyOut: ZERO_CENTS, ...(answer.name.trim() === "" ? {} : { name: answer.name.trim() }) });
      }
    } else if (row.detected === "Closed") {
      commands.push({ ...base, action: "Closed", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS });
    } else if (row.detected === "Missing") {
      if (answer.sold !== "yes") {
        fail("This fund is missing from the statement. Say whether it was fully sold. If it was not, get a complete export.");
        continue;
      }
      const proceeds = required(answer.moneyOut, "Enter the full proceeds you received, not the gain");
      if (proceeds !== null) commands.push({ ...base, action: "Close", moneyIn: ZERO_CENTS, moneyOut: proceeds });
    } else {
      // Held or Reappeared: cash movements depend on the one question above.
      if (row.detected === "Reappeared" && !answer.reopen) {
        fail("This fund was closed and now has value again. Confirm that it is held again.");
        continue;
      }
      if (row.detected === "Held" && row.value === 0 && answer.zero === "close") {
        const proceeds = required(answer.moneyOut, "Enter the full proceeds you received, not the gain");
        if (proceeds !== null) commands.push({ ...base, action: "Close", moneyIn: ZERO_CENTS, moneyOut: proceeds });
        continue;
      }
      if (moneyMoved === "") {
        fail("Answer the question about money movements above.");
        continue;
      }
      let moneyIn: EuroCents | null = ZERO_CENTS;
      let moneyOut: EuroCents | null = ZERO_CENTS;
      if (moneyMoved === "yes") {
        moneyIn = required(answer.moneyIn, "Enter the cash paid in");
        moneyOut = moneyIn === null ? null : required(answer.moneyOut, "Enter the full proceeds and distributions received");
      }
      if (moneyIn !== null && moneyOut !== null) {
        commands.push({ ...base, action: row.detected === "Reappeared" ? "Reopen" : "Keep", moneyIn, moneyOut });
      }
    }
  }
  return { commands, errors };
}

function AmountField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onInput: (value: string) => void;
}): JSX.Element {
  return (
    <div class="field">
      <label for={props.id}>{props.label}</label>
      <input
        id={props.id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={props.value}
        onInput={(event) => {
          props.onInput(event.currentTarget.value);
        }}
      />
    </div>
  );
}

const DETECTION_TEXT: Readonly<Record<PlanRow["detected"], string>> = {
  Opening: "First statement",
  New: "New fund",
  Held: "Held",
  Missing: "Missing from this statement",
  Reappeared: "Closed before, held again",
  Closed: "Closed earlier",
};

type SaveState =
  | { readonly name: "idle" }
  | { readonly name: "saving"; readonly checking?: boolean }
  | { readonly name: "not-saved"; readonly message: string }
  | { readonly name: "refused"; readonly outcome: Extract<RecordResult, { status: "stale" | "rejected" | "damaged" }> }
  | { readonly name: "saved-not-reloaded" }
  | { readonly name: "unknown"; readonly message: string };

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
  useEffect(() => { props.onDraft?.({ answers, moneyMoved }); }, [answers, moneyMoved, props.onDraft]);
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
        setSaving({ name: "not-saved", message: "The spreadsheet shows this statement was not recorded. It is safe to try again." });
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
      settle(await save.record({ date: props.date, statement: props.statement, commands: built.commands, ...(props.source === undefined ? {} : { source: props.source }) }, id, props.ledger.revision));
    } catch {
      setSaving({ name: "unknown", message: "The save may or may not have been recorded. Check what happened before trying again." });
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
        const target = needsMoneyQuestion && moneyMoved === ""
          ? questions.current?.querySelector<HTMLInputElement>(".choice input")
          : questions.current?.querySelector<HTMLElement>('[data-invalid="true"] input, .review-problem');
        target?.focus();
      });
      return;
    }
    if (props.onReview !== undefined) {
      props.onReview({ date: props.date, statement: props.statement, commands: built.commands, ...(props.source === undefined ? {} : { source: props.source }) }, result.state);
      return;
    }
    if (props.save !== undefined) {
      void saveToGoogle(props.save);
      return;
    }
    const final = applyImport(props.ledger, props.statement, props.date, built.commands, props.createRevision());
    if (final.ok) props.onRecord(final.state);
  }

  return (
    <section ref={questions} class="questions" aria-labelledby={`${prefix}-questions-heading`}>
      <h4 id={`${prefix}-questions-heading`} tabIndex={-1}>{latest === undefined ? "Opening amounts" : "Changes since the last statement"}</h4>
      {latest === undefined ? (
        <p>
          For each fund, enter how much cash you had paid in, minus full proceeds already received, as of{" "}
          {formatDateLong(props.date)}. This is not the market value and not the purchase cost.
        </p>
      ) : (
        <p>
          Compared with the statement of {formatDateLong(latest.date)}. Nothing is assumed: a fund missing from a
          statement is not treated as sold.
        </p>
      )}

      {needsMoneyQuestion && (
        <fieldset class="choice" disabled={locked} aria-invalid={attempted && moneyMoved === "" ? "true" : undefined}>
          <legend>
            Did you add or remove money, switch funds, or receive distributions between{" "}
            {latest === undefined ? "statements" : `${formatDateLong(latest.date)} and ${formatDateLong(props.date)}`}?
          </legend>
          <label>
            <input type="radio" name={`${prefix}-money-moved`} checked={moneyMoved === "yes"} onChange={() => { setMoneyMoved("yes"); }} /> Yes
          </label>
          <label>
            <input type="radio" name={`${prefix}-money-moved`} checked={moneyMoved === "no"} onChange={() => { setMoneyMoved("no"); }} /> No
          </label>
          <p class="hint">A switch is money out of one fund and money into the other. Withdrawals are the full proceeds, not the gain.</p>
        </fieldset>
      )}

      {rows.map((row) => {
        const answer = answers[row.isin] ?? BLANK;
        const error = built.errors[row.isin];
        const showMoney = moneyMoved === "yes" && (row.detected === "Held" || row.detected === "Reappeared");
        const id = (suffix: string): string => `${prefix}-${suffix}-${row.isin}`;
        return (
          <fieldset key={row.isin} class="fund-question" disabled={locked} data-invalid={attempted && error !== undefined} aria-describedby={attempted && error !== undefined ? id("error") : undefined}>
            <legend>
              {row.name} <span class="isin">{row.isin}</span> <span class="tag">{DETECTION_TEXT[row.detected]}</span>
            </legend>
            <p class="hint">
              {row.detected === "Missing" || row.detected === "Closed" ? (
                "No value on this statement."
              ) : (
                <>
                  Market value <Amount cents={row.value} />.
                </>
              )}
              {row.detected !== "Opening" && (
                <>
                  {" "}
                  Net invested before: <Amount cents={row.priorNetInvested} />.
                </>
              )}
            </p>

            {row.detected === "Opening" && (
              <AmountField id={id("opening")} label="Net invested at the statement date" value={answer.opening} onInput={(value) => { update(row.isin, { opening: value }); }} />
            )}
            {row.detected === "New" && (
              <>
                <AmountField id={id("in")} label="Cash paid into this fund" value={answer.moneyIn} onInput={(value) => { update(row.isin, { moneyIn: value }); }} />
                <div class="field">
                  <label for={id("name")}>Short name (optional)</label>
                  <input id={id("name")} type="text" value={answer.name} onInput={(event) => { update(row.isin, { name: event.currentTarget.value }); }} />
                </div>
              </>
            )}
            {row.detected === "Missing" && (
              <>
                <p>This fund is not on the statement. Was it fully sold?</p>
                <label>
                  <input type="radio" name={id("sold")} checked={answer.sold === "yes"} onChange={() => { update(row.isin, { sold: "yes" }); }} /> Yes, fully sold
                </label>
                <label>
                  <input type="radio" name={id("sold")} checked={answer.sold === "no"} onChange={() => { update(row.isin, { sold: "no" }); }} /> No, I did not sell it
                </label>
                {answer.sold === "yes" && (
                  <AmountField id={id("out")} label="Full proceeds received" value={answer.moneyOut} onInput={(value) => { update(row.isin, { moneyOut: value }); }} />
                )}
              </>
            )}
            {row.detected === "Held" && row.value === 0 && (
              <>
                <p>The bank still lists this fund at zero value.</p>
                <label>
                  <input type="radio" name={id("zero")} checked={answer.zero === "keep"} onChange={() => { update(row.isin, { zero: "keep" }); }} /> Keep it active at zero
                </label>
                <label>
                  <input type="radio" name={id("zero")} checked={answer.zero === "close"} onChange={() => { update(row.isin, { zero: "close" }); }} /> It was fully sold
                </label>
                {answer.zero === "close" && (
                  <AmountField id={id("out")} label="Full proceeds received" value={answer.moneyOut} onInput={(value) => { update(row.isin, { moneyOut: value }); }} />
                )}
              </>
            )}
            {row.detected === "Reappeared" && (
              <label>
                <input type="checkbox" checked={answer.reopen} onChange={(event) => { update(row.isin, { reopen: event.currentTarget.checked }); }} /> This fund is held again
              </label>
            )}
            {showMoney && !(row.detected === "Held" && row.value === 0 && answer.zero === "close") && (
              <>
                <AmountField id={id("in")} label="Cash paid in" value={answer.moneyIn} onInput={(value) => { update(row.isin, { moneyIn: value }); }} />
                <AmountField id={id("out")} label="Full proceeds and distributions received" value={answer.moneyOut} onInput={(value) => { update(row.isin, { moneyOut: value }); }} />
              </>
            )}
            {error !== undefined && attempted && <p id={id("error")} class="field-error" role="alert">{error}</p>}
          </fieldset>
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

      {result?.ok === true && (
        <section aria-labelledby={`${prefix}-summary-heading`} class="summary">
          <h4 id={`${prefix}-summary-heading`}>What will be recorded for {formatDateLong(props.date)}</h4>
          <ul class="fund-summary">
            {rows.map((row) => {
              const holding = result.state.snapshots[result.state.snapshots.length - 1]?.holdings[row.isin];
              return holding === undefined ? null : (
                <li key={row.isin}>
                  <p class="fund-summary-name">{result.state.funds.find((fund) => fund.isin === row.isin)?.name ?? row.name}</p>
                  <dl class="facts">
                    <div><dt>Decision</dt><dd>{holding.action}</dd></div>
                    <div><dt>Money in</dt><dd><Amount cents={holding.moneyIn} /></dd></div>
                    <div><dt>Money out</dt><dd><Amount cents={holding.moneyOut} /></dd></div>
                    <div><dt>Net invested</dt><dd><Amount cents={holding.netInvested} /></dd></div>
                  </dl>
                </li>
              );
            })}
          </ul>
          <p>
            Check that every contribution, full withdrawal or distribution, and both sides of any switch are included.
            Percentages that depend on when cash moved are estimates.
          </p>
        </section>
      )}

      <p class="hint">
        {props.onReview !== undefined
          ? "This step only prepares your history. Nothing is saved until you review the complete history and confirm."
          : props.save === undefined
          ? "Not connected to Google: this statement will be kept in this browser tab only and is lost when the page reloads."
          : "Confirming saves this statement to your connected Google spreadsheet."}
      </p>
      <button type="button" class="primary" onClick={record} disabled={locked}>
        {saving.name === "saving" ? saving.checking === true ? "Checking the save…" : "Saving statement…" : props.onReview === undefined ? "Confirm and record this statement" : "Keep these answers and continue"}
      </button>
      {hasErrors && attempted && <p class="field-error" role="alert">Some questions above still need an answer.</p>}
      <div aria-live="polite" data-busy={saving.name === "saving"} class="status">
        {saving.name === "saving" && <p>{saving.checking === true ? "Checking your spreadsheet without writing…" : "Saving to your spreadsheet…"}</p>}
      </div>
      {saving.name === "not-saved" && (
        <div class="review-problem" role="alert">
          <h4>Not saved</h4>
          <p>{saving.message}</p>
        </div>
      )}
      {saving.name === "refused" && (
        <div class="review-problem" role="alert">
          <h4>Not saved</h4>
          {saving.outcome.status === "stale" && (
            <p>Another device changed your portfolio. This statement was not saved. Your inputs are still here. Check the updated history and review your decisions before confirming again; reconnect in Your data if Google could not be checked.</p>
          )}
          {saving.outcome.status === "rejected" && (
            <>
              <p>The spreadsheet service checked the statement and did not accept it. Nothing was saved.</p>
              <ul>{saving.outcome.messages.map((message) => <li key={message}>{message}</li>)}</ul>
            </>
          )}
          {saving.outcome.status === "damaged" && <p>{saving.outcome.message} Nothing was saved. Do not record anything until the ledger is restored.</p>}
        </div>
      )}
      {saving.name === "saved-not-reloaded" && (
        <div class="review-problem" role="alert">
          <h4>Saved, but not reloaded</h4>
          <p>The statement was recorded in your spreadsheet, but the ledger could not be read back. Do not record it again. Checking reads your spreadsheet and writes nothing.</p>
          {props.save !== undefined && <button type="button" onClick={() => void checkSave(props.save as RemoteSave)}>Check what happened</button>}
        </div>
      )}
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
    </section>
  );
}
