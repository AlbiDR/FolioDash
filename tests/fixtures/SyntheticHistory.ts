import { parseIsin } from "../../src/core/Isin";
import { type IsoDate, parseIsoDate } from "../../src/core/IsoDate";
import type { Fund, Holding, LedgerState, Snapshot } from "../../src/core/Ledger";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "../../src/core/Money";

function cents(value: number): EuroCents {
  const result = toEuroCents(value);
  if (result === null) throw new Error("Synthetic history amount is outside the supported range.");
  return result;
}

function syntheticIsin(index: number): string {
  const body = `XS${String(index).padStart(9, "0")}`;
  for (let digit = 0; digit < 10; digit++) {
    const result = parseIsin(`${body}${String(digit)}`);
    if (result !== null) return result;
  }
  throw new Error("Could not construct a synthetic ISIN.");
}

/** Invented monthly history; direct construction avoids timing repeated import setup. */
export function syntheticHistory(months: number, fundCount: number): LedgerState {
  if (!Number.isInteger(months) || months < 1 || months > 1200 || !Number.isInteger(fundCount) || fundCount < 1 || fundCount > 200) {
    throw new Error("Synthetic history expects 1-1200 months and 1-200 funds.");
  }
  const dates: IsoDate[] = Array.from({ length: months }, (_, index) => {
    const date = parseIsoDate(`${String(2000 + Math.floor(index / 12))}-${String(index % 12 + 1).padStart(2, "0")}-15`);
    if (date === null) throw new Error("Invalid synthetic date.");
    return date;
  });
  const firstDate = dates[0];
  if (firstDate === undefined) throw new Error("Synthetic history has no opening date.");
  const funds: Fund[] = Array.from({ length: fundCount }, (_, index) => ({
    isin: syntheticIsin(index), name: `Synthetic Fund ${String(index + 1)}`, fullName: `Synthetic Fund ${String(index + 1)}`, firstDate,
  }));
  const snapshots: Snapshot[] = dates.map((date, month) => {
    const holdings: Record<string, Holding> = {};
    let total = 0;
    funds.forEach((fund, index) => {
      const value = cents(100_000 + index * 100 + month * 10);
      total += value;
      holdings[fund.isin] = { value, netInvested: cents(100_000), moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, status: "active", action: month === 0 ? "Start" : "Keep", cashVerified: true, comment: "" };
    });
    return { date, fundsSubtotal: cents(total), holdings };
  });
  return { revision: "synthetic-growth", funds, snapshots };
}
