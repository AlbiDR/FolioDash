import { formatDateLong, type IsoDate } from "../../../../core/iso-date";
import type { OverviewModel } from "./overview-model";

/**
 * A statement is due once the latest one is older than a month and a little more, since an export can fall on any
 * day of the month. This only decides when to remind: nothing is calculated from it.
 */
export const STATEMENT_DUE_AFTER_DAYS = 35;

export interface AttentionItem {
  readonly id: "pending-change" | "statement-due";
  readonly message: string;
  readonly action: string;
  readonly href: string;
}

/** Whole days from one date to another, by calendar day, so a clock change never shifts the count. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const start = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((end - start) / 86_400_000);
}

/**
 * What the Portfolio asks the person to do next, most urgent first. Demonstration data asks for nothing: its dates
 * are invented, so an old one is not a task. An unconfirmed history change comes first because it must be checked
 * before another statement is saved.
 */
export function portfolioAttention(input: {
  readonly source: OverviewModel["source"];
  readonly lastStatement: IsoDate | undefined;
  readonly today: IsoDate;
  readonly pendingChange: boolean;
}): AttentionItem[] {
  if (input.source !== "recorded") return [];
  const items: AttentionItem[] = [];
  if (input.pendingChange) {
    items.push({
      id: "pending-change",
      message: "A history change needs checking before you save another statement.",
      action: "Check it",
      href: "#connection",
    });
  }
  if (input.lastStatement !== undefined) {
    const age = daysBetween(input.lastStatement, input.today);
    if (age > STATEMENT_DUE_AFTER_DAYS) {
      items.push({
        id: "statement-due",
        message: `Your latest statement is ${String(age)} days old (${formatDateLong(input.lastStatement)}). Add the next one to keep these figures current.`,
        action: "Add statement",
        href: "#import",
      });
    }
  }
  return items;
}
