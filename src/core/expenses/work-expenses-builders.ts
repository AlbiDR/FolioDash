import { type IsoDate, parseIsoDate } from "../values/iso-date";
import { type EuroCents, toEuroCents } from "../values/money";
import type { ExpenseDay } from "./work-expenses";

export function date(value: string): IsoDate {
  const parsed = parseIsoDate(value);
  if (parsed === null) throw new Error("Invalid synthetic date");
  return parsed;
}

export function cents(value: number): EuroCents {
  const parsed = toEuroCents(value);
  if (parsed === null) throw new Error("Invalid synthetic cents");
  return parsed;
}

export function day(on: string, total: number | null, extra: Partial<ExpenseDay> = {}): ExpenseDay {
  return {
    date: date(on),
    revision: on,
    amounts: [
      total === null ? null : cents(total),
      total === null ? null : cents(0),
      total === null ? null : cents(0),
      total === null ? null : cents(0),
      total === null ? null : cents(0),
    ],
    ...extra,
  };
}
