import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { type FundCommand, type PlanRow, applyImport, planImport } from "../../../../core/ImportPlan";
import { type IsoDate, formatDateLong } from "../../../../core/IsoDate";
import type { LedgerState } from "../../../../core/Ledger";
import { type EuroCents, ZERO_CENTS, formatEuro, parseItalianAmount } from "../../../../core/Money";
import type { ReviewStatement } from "./ImportModel";

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

export function CashQuestions(props: {
  readonly statement: ReviewStatement;
  readonly date: IsoDate;
  readonly ledger: LedgerState;
  readonly createRevision: () => string;
  readonly onRecord: (next: LedgerState) => void;
}): JSX.Element {
  const [answers, setAnswers] = useState<Readonly<Record<string, Answer>>>({});
  const [moneyMoved, setMoneyMoved] = useState<"yes" | "no" | "">("");
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

  function record(): void {
    setAttempted(true);
    if (result === null || !result.ok) return;
    const final = applyImport(props.ledger, props.statement, props.date, built.commands, props.createRevision());
    if (final.ok) props.onRecord(final.state);
  }

  return (
    <section class="questions" aria-labelledby="questions-heading">
      <h4 id="questions-heading">{latest === undefined ? "Opening amounts" : "Changes since the last statement"}</h4>
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
        <fieldset class="choice">
          <legend>
            Did you add or remove money, switch funds, or receive distributions between{" "}
            {latest === undefined ? "statements" : `${formatDateLong(latest.date)} and ${formatDateLong(props.date)}`}?
          </legend>
          <label>
            <input type="radio" name="money-moved" checked={moneyMoved === "yes"} onChange={() => { setMoneyMoved("yes"); }} /> Yes
          </label>
          <label>
            <input type="radio" name="money-moved" checked={moneyMoved === "no"} onChange={() => { setMoneyMoved("no"); }} /> No
          </label>
          <p class="hint">A switch is money out of one fund and money into the other. Withdrawals are the full proceeds, not the gain.</p>
        </fieldset>
      )}

      {rows.map((row) => {
        const answer = answers[row.isin] ?? BLANK;
        const error = built.errors[row.isin];
        const showMoney = moneyMoved === "yes" && (row.detected === "Held" || row.detected === "Reappeared");
        const id = (suffix: string): string => `${suffix}-${row.isin}`;
        return (
          <fieldset key={row.isin} class="fund-question">
            <legend>
              {row.name} <span class="isin">{row.isin}</span> <span class="tag">{DETECTION_TEXT[row.detected]}</span>
            </legend>
            <p class="hint">
              {row.detected === "Missing" || row.detected === "Closed" ? "No value on this statement." : `Market value ${formatEuro(row.value)}.`}
              {row.detected === "Opening" ? "" : ` Net invested before: ${formatEuro(row.priorNetInvested)}.`}
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
            {error !== undefined && attempted && <p class="field-error" role="alert">{error}</p>}
          </fieldset>
        );
      })}

      {result !== null && !result.ok && (
        <div class="review-problem" role="alert">
          <h4>This cannot be recorded yet</h4>
          <ul>
            {result.issues.map((issue) => (
              <li key={`${issue.code}-${issue.isin ?? ""}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      {result?.ok === true && (
        <section aria-labelledby="summary-heading" class="summary">
          <h4 id="summary-heading">What will be recorded for {formatDateLong(props.date)}</h4>
          <table class="funds">
            <thead>
              <tr>
                <th scope="col">Fund</th>
                <th scope="col">Decision</th>
                <th scope="col">Money in</th>
                <th scope="col">Money out</th>
                <th scope="col">Net invested</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const holding = result.state.snapshots[result.state.snapshots.length - 1]?.holdings[row.isin];
                return holding === undefined ? null : (
                  <tr key={row.isin}>
                    <th scope="row">{result.state.funds.find((fund) => fund.isin === row.isin)?.name ?? row.name}</th>
                    <td>{holding.action}</td>
                    <td>{formatEuro(holding.moneyIn)}</td>
                    <td>{formatEuro(holding.moneyOut)}</td>
                    <td>{formatEuro(holding.netInvested)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p>
            Check that every contribution, full withdrawal or distribution, and both sides of any switch are included.
            Percentages that depend on when cash moved are estimates.
          </p>
        </section>
      )}

      <button type="button" class="primary" onClick={record}>
        Confirm and record this statement
      </button>
      {hasErrors && attempted && <p class="field-error" role="alert">Some questions above still need an answer.</p>}
    </section>
  );
}
