import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  compareIsoDates,
  fromSpreadsheetSerial,
  monthKey,
  parseIsoDate,
  toIsoDate,
  toSpreadsheetSerial,
  type IsoDate,
} from "./iso-date";

const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const validDate = fc
  .record({
    year: fc.integer({ min: 1901, max: 2999 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ year, month, day }) => {
    const date = toIsoDate(year, month, day);
    if (date === null) throw new Error("a day up to the 28th is always valid");
    return date;
  });

describe("date-only values", () => {
  it("round-trips through their text form and keeps the year-month key as a prefix", () => {
    fc.assert(
      fc.property(validDate, (date) => {
        expect(parseIsoDate(date)).toBe(date);
        expect(date.startsWith(monthKey(date))).toBe(true);
      }),
    );
  });

  it("rejects days that do not exist, including 29 February in a common year", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1900, max: 2999 }), (year) => {
        expect(toIsoDate(year, 2, 30)).toBeNull();
        expect(toIsoDate(year, 4, 31)).toBeNull();
        expect(toIsoDate(year, 2, 29) !== null).toBe(isLeap(year));
      }),
    );
  });

  it("orders chronologically, antisymmetrically, the same way the text sorts", () => {
    fc.assert(
      fc.property(validDate, validDate, (left, right) => {
        const order = Math.sign(compareIsoDates(left, right));
        expect(order).toBe(left < right ? -1 : left > right ? 1 : 0);
        expect(Math.sign(compareIsoDates(right, left))).toBe(-order);
      }),
    );
  });

  it("round-trips through a spreadsheet serial number", () => {
    fc.assert(
      fc.property(validDate, (date) => {
        const serial = toSpreadsheetSerial(date);
        expect(fromSpreadsheetSerial(serial, false)).toBe(date satisfies IsoDate);
      }),
    );
  });

  it("rejects non-dates written in the right shape", () => {
    fc.assert(
      fc.property(fc.integer({ min: 13, max: 99 }), fc.integer({ min: 1, max: 28 }), (month, day) => {
        expect(parseIsoDate(`2026-${String(month)}-${String(day).padStart(2, "0")}`)).toBeNull();
      }),
    );
  });
});
