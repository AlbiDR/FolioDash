import type { JSX } from "preact";
import type { PlanRow } from "../../../../core/statements/import-plan";
import { Presence } from "../../shared/ui/presence";
import { Amount } from "../../presentation/privacy/privacy";
import { type Answer, amount } from "./cash-answers";

function AmountField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  /** One explanation shown once for a whole group of fields, instead of the same text under each fund. */
  readonly describedBy?: string;
  readonly onInput: (value: string) => void;
}): JSX.Element {
  return (
    <div class="field">
      <label for={props.id}>
        {props.label} <span class="cash-currency">(EUR)</span>
      </label>
      <input
        id={props.id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-describedby={props.hint === undefined ? props.describedBy : `${props.id}-hint`}
        value={props.value}
        onInput={(event) => {
          props.onInput(event.currentTarget.value);
        }}
      />
      {props.hint !== undefined && (
        <p id={`${props.id}-hint`} class="hint cash-field-help">
          {props.hint}
        </p>
      )}
    </div>
  );
}

const DETECTION_TEXT: Readonly<Record<PlanRow["detected"], string>> = {
  Opening: "Starting balance",
  New: "New fund",
  Held: "Still held",
  Missing: "Not included in this update",
  Reappeared: "Closed before, held again",
  Closed: "Closed earlier",
};

export function FundQuestion(props: {
  readonly row: PlanRow;
  readonly answer: Answer;
  readonly error: string | undefined;
  readonly showMoney: boolean;
  readonly attempted: boolean;
  readonly locked: boolean;
  readonly prefix: string;
  readonly update: (isin: string, patch: Partial<Answer>) => void;
}): JSX.Element {
  const { row, answer, error, showMoney, attempted, locked, prefix, update } = props;
  const id = (suffix: string): string => `${prefix}-${suffix}-${row.isin}`;
  return (
    <fieldset
      class="fund-question"
      disabled={locked}
      data-invalid={attempted && error !== undefined}
      aria-describedby={attempted && error !== undefined ? id("error") : undefined}
    >
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
        <AmountField
          id={id("opening")}
          label="Net invested on this date"
          describedBy={`${prefix}-opening-help`}
          value={answer.opening}
          onInput={(value) => {
            update(row.isin, { opening: value });
          }}
        />
      )}
      {row.detected === "New" && (
        <>
          <AmountField
            id={id("in")}
            label="Money added to this fund"
            hint="Total invested in this new fund during the period, including money switched in from another fund. Enter 0 if none."
            value={answer.moneyIn}
            onInput={(value) => {
              update(row.isin, { moneyIn: value });
            }}
          />
          <div class="field">
            <label for={id("name")}>Short name (optional)</label>
            <input
              id={id("name")}
              type="text"
              value={answer.name}
              onInput={(event) => {
                update(row.isin, { name: event.currentTarget.value });
              }}
            />
          </div>
        </>
      )}
      {row.detected === "Missing" && (
        <>
          <p>This fund is not included in your update. Did you sell all of it?</p>
          <label>
            <input
              type="radio"
              name={id("sold")}
              checked={answer.sold === "yes"}
              onChange={() => {
                update(row.isin, { sold: "yes" });
              }}
            />{" "}
            Yes, fully sold
          </label>
          <label>
            <input
              type="radio"
              name={id("sold")}
              checked={answer.sold === "no"}
              onChange={() => {
                update(row.isin, { sold: "no" });
              }}
            />{" "}
            No, I did not sell it
          </label>
          {answer.sold === "yes" && (
            <AmountField
              id={id("sale-proceeds")}
              label="Total money received from the sale"
              hint="Enter the actual total paid to you when you sold the fund, not just the profit. Enter 0 if nothing was received."
              value={answer.moneyOut}
              onInput={(value) => {
                update(row.isin, { moneyOut: value });
              }}
            />
          )}
        </>
      )}
      {row.detected === "Held" && row.value === 0 && (
        <>
          <p>This update lists the fund at zero value. Do you still hold it?</p>
          <label>
            <input
              type="radio"
              name={id("zero")}
              checked={answer.zero === "keep"}
              onChange={() => {
                update(row.isin, { zero: "keep" });
              }}
            />{" "}
            Keep it active at zero
          </label>
          <label>
            <input
              type="radio"
              name={id("zero")}
              checked={answer.zero === "close"}
              onChange={() => {
                update(row.isin, { zero: "close" });
              }}
            />{" "}
            It was fully sold
          </label>
          {answer.zero === "close" && (
            <AmountField
              id={id("sale-proceeds")}
              label="Total money received from the sale"
              hint="Enter the actual total paid to you when you sold the fund, not just the profit. Enter 0 if nothing was received."
              value={answer.moneyOut}
              onInput={(value) => {
                update(row.isin, { moneyOut: value });
              }}
            />
          )}
        </>
      )}
      {row.detected === "Reappeared" && (
        <label>
          <input
            type="checkbox"
            checked={answer.reopen}
            onChange={(event) => {
              update(row.isin, { reopen: event.currentTarget.checked });
            }}
          />{" "}
          This fund is held again
        </label>
      )}
      <Presence show={showMoney && !(row.detected === "Held" && row.value === 0 && answer.zero === "close")}>
        <div class="cash-movements">
          <div class="cash-movement-fields">
            <AmountField
              id={id("in")}
              label="Money added to this fund"
              describedBy={`${prefix}-movement-help`}
              value={answer.moneyIn}
              onInput={(value) => {
                update(row.isin, { moneyIn: value });
              }}
            />
            <AmountField
              id={id("out")}
              label="Money received from this fund"
              describedBy={`${prefix}-movement-help`}
              value={answer.moneyOut}
              onInput={(value) => {
                update(row.isin, { moneyOut: value });
              }}
            />
          </div>
          <button
            type="button"
            class="link-button"
            disabled={locked || (amount(answer.moneyIn) === 0 && amount(answer.moneyOut) === 0)}
            onClick={() => {
              update(row.isin, { moneyIn: "0", moneyOut: "0" });
            }}
          >
            No money moved for this fund
          </button>
        </div>
      </Presence>
      {error !== undefined && attempted && (
        <p id={id("error")} class="field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
