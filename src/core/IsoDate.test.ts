import { describe, expect, it } from "vitest";
import {
  compareIsoDates,
  formatDateLong,
  formatMonthShort,
  formatMonthYear,
  fromSpreadsheetSerial,
  monthKey,
  monthSerial,
  parseBankDate,
  parseIsoDate,
  toIsoDate,
} from "./IsoDate";

function date(text: string) {
  const result = parseIsoDate(text);
  if (result === null) throw new Error(`not a date: ${text}`);
  return result;
}

describe("parseIsoDate", () => {
  it.each(["2026-11-01", "2028-02-29", "2000-02-29", "1900-01-01", "2999-12-31"])("accepts %s", (text) => {
    expect(parseIsoDate(text)).toBe(text);
  });

  it("ignores surrounding spaces", () => {
    expect(parseIsoDate(" 2026-11-01 ")).toBe("2026-11-01");
  });

  it.each([
    "",
    "2026-02-29",
    "1900-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-04-31",
    "2026-4-1",
    "20261101",
    "01/11/2026",
    "1899-12-31",
    "3000-01-01",
    "2026-11-01T10:00:00Z",
  ])("rejects %j", (text) => {
    expect(parseIsoDate(text)).toBeNull();
  });
});

describe("parseBankDate", () => {
  it("reads the day-first bank form", () => {
    expect(parseBankDate("01/02/2025")).toBe("2025-02-01");
    expect(parseBankDate("15/03/2025")).toBe("2025-03-15");
  });

  it.each(["", "1/2/2025", "31/04/2025", "07/13/2025", "2025-02-01", "01-02-2025", "01/02/25"])(
    "rejects %j",
    (text) => {
      expect(parseBankDate(text)).toBeNull();
    },
  );
});

describe("fromSpreadsheetSerial", () => {
  it("converts 1900-system serials", () => {
    expect(fromSpreadsheetSerial(45689, false)).toBe("2025-02-01");
    expect(fromSpreadsheetSerial(46327, false)).toBe("2026-11-01");
    expect(fromSpreadsheetSerial(61, false)).toBe("1900-03-01");
    expect(fromSpreadsheetSerial(36585, false)).toBe("2000-02-29");
  });

  it("converts 1904-system serials", () => {
    expect(fromSpreadsheetSerial(45689 - 1462, true)).toBe("2025-02-01");
  });

  it.each([60, 0, -5, 1.5, Number.NaN])("rejects serial %s", (serial) => {
    expect(fromSpreadsheetSerial(serial, false)).toBeNull();
  });
});

describe("toIsoDate", () => {
  it("builds from parts and rejects impossible ones", () => {
    expect(toIsoDate(2026, 11, 1)).toBe("2026-11-01");
    expect(toIsoDate(2026, 2, 29)).toBeNull();
    expect(toIsoDate(2026.5, 1, 1)).toBeNull();
  });
});

describe("ordering and months", () => {
  it("sorts chronologically as plain text", () => {
    const shuffled = ["2026-01-05", "2025-12-31", "2026-01-04", "2025-02-01", "2026-11-01"];
    expect([...shuffled].sort()).toEqual(["2025-02-01", "2025-12-31", "2026-01-04", "2026-01-05", "2026-11-01"]);
  });

  it("compares dates", () => {
    expect(compareIsoDates(date("2026-01-01"), date("2026-01-02"))).toBe(-1);
    expect(compareIsoDates(date("2026-01-02"), date("2026-01-01"))).toBe(1);
    expect(compareIsoDates(date("2026-01-01"), date("2026-01-01"))).toBe(0);
  });

  it("counts consecutive months across a year end", () => {
    expect(monthSerial(date("2026-01-15")) - monthSerial(date("2025-12-31"))).toBe(1);
    expect(monthSerial(date("2026-11-01")) - monthSerial(date("2026-10-03"))).toBe(1);
    expect(monthSerial(date("2026-08-31")) - monthSerial(date("2026-08-01"))).toBe(0);
  });

  it("groups by calendar month", () => {
    expect(monthKey(date("2026-08-14"))).toBe("2026-08");
  });
});

describe("display", () => {
  it("spells the month in full", () => {
    expect(formatDateLong(date("2026-11-01"))).toBe("1 November 2026");
    expect(formatDateLong(date("2025-02-01"))).toBe("1 February 2025");
    expect(formatMonthYear(date("2025-02-01"))).toBe("February 2025");
  });

  it("spells every month", () => {
    const names = Array.from({ length: 12 }, (_, index) => formatMonthYear(date(`2026-${String(index + 1).padStart(2, "0")}-01`)));
    expect(names).toEqual([
      "January 2026",
      "February 2026",
      "March 2026",
      "April 2026",
      "May 2026",
      "June 2026",
      "July 2026",
      "August 2026",
      "September 2026",
      "October 2026",
      "November 2026",
      "December 2026",
    ]);
  });
});

describe("formatMonthShort", () => {
  it("gives a three-letter month and a two-digit year for a column heading", () => {
    expect(formatMonthShort(date("2026-11-01"))).toBe("Nov 26");
    expect(formatMonthShort(date("2025-02-01"))).toBe("Feb 25");
  });
});
