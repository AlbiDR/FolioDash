import { type FundCommand, type PlanRow } from "../../../../core/statements/import-plan";
import { type EuroCents, ZERO_CENTS, parseItalianAmount } from "../../../../core/values/money";

export interface Answer {
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

export const BLANK: Answer = {
  opening: "",
  moneyIn: "",
  moneyOut: "",
  name: "",
  sold: "",
  zero: "keep",
  reopen: false,
};
export interface CashReviewDraft {
  readonly answers: Readonly<Record<string, Answer>>;
  readonly moneyMoved: "yes" | "no" | "";
}
const AMOUNT_HINT = "Use Italian notation, for example 1.000,50. Enter 0 if there was none.";

export function amount(text: string): EuroCents | null {
  return text.trim() === "" ? null : parseItalianAmount(text);
}

export interface Built {
  readonly commands: FundCommand[];
  readonly errors: Readonly<Record<string, string>>;
}

export function build(
  rows: readonly PlanRow[],
  answers: Readonly<Record<string, Answer>>,
  moneyMoved: "yes" | "no" | "",
): Built {
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
      if (opening !== null)
        commands.push({
          ...base,
          action: "Start",
          moneyIn: ZERO_CENTS,
          moneyOut: ZERO_CENTS,
          openingNetInvested: opening,
        });
    } else if (row.detected === "New") {
      const moneyIn = required(answer.moneyIn, "Enter the money added to this new fund");
      if (moneyIn !== null) {
        commands.push({
          ...base,
          action: "Add",
          moneyIn,
          moneyOut: ZERO_CENTS,
          ...(answer.name.trim() === "" ? {} : { name: answer.name.trim() }),
        });
      }
    } else if (row.detected === "Closed") {
      commands.push({ ...base, action: "Closed", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS });
    } else if (row.detected === "Missing") {
      if (answer.sold !== "yes") {
        fail(
          "Confirm whether you sold all of this fund. If you still hold it, go back and include its value or choose a complete statement.",
        );
        continue;
      }
      const proceeds = required(
        answer.moneyOut,
        "Enter the total money received from selling this fund, not just the profit",
      );
      if (proceeds !== null) commands.push({ ...base, action: "Close", moneyIn: ZERO_CENTS, moneyOut: proceeds });
    } else {
      // Held or Reappeared: cash movements depend on the one question above.
      if (row.detected === "Reappeared" && !answer.reopen) {
        fail("This fund was closed and now has value again. Confirm that it is held again.");
        continue;
      }
      if (row.detected === "Held" && row.value === 0 && answer.zero === "close") {
        const proceeds = required(
          answer.moneyOut,
          "Enter the total money received from selling this fund, not just the profit",
        );
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
        moneyIn = required(answer.moneyIn, "Enter the money added to this fund");
        moneyOut = moneyIn === null ? null : required(answer.moneyOut, "Enter the total money received from this fund");
      }
      if (moneyIn !== null && moneyOut !== null) {
        commands.push({ ...base, action: row.detected === "Reappeared" ? "Reopen" : "Keep", moneyIn, moneyOut });
      }
    }
  }
  return { commands, errors };
}
