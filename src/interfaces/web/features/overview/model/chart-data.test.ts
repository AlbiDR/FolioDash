import { describe, expect, it } from "vitest";
import { parseIsoDate } from "../../../../../core/values/iso-date";
import { euroAxisLabel, euroLabel, euros, monthLabel, utcTime } from "./chart-data";

describe("chart axis text", () => {
  it("names a month by its short name and two-digit year, from a UTC time", () => {
    expect(monthLabel(Date.UTC(2026, 10, 15))).toBe("Nov 26");
    expect(monthLabel(Date.UTC(2027, 0, 1))).toBe("Jan 27");
  });

  it("returns no label for a time that is not a date", () => {
    expect(monthLabel(Number.NaN)).toBe("");
  });

  it("writes an amount in euros with Italian notation, rounded to the cent", () => {
    expect(euroLabel(1234.5)).toBe("1.234,50 €");
    expect(euroLabel(-0.004)).toBe("0,00 €");
    expect(euroLabel(0.005)).toBe("0,01 €");
  });

  it("returns no label for an amount that cannot be exact cents", () => {
    expect(euroLabel(Number.NaN)).toBe("");
    expect(euroLabel(1e300)).toBe("");
  });

  it("turns a date into the UTC time the chart plots, and cents into euros", () => {
    const date = parseIsoDate("2026-03-31");
    expect(date).not.toBeNull();
    if (date !== null) expect(utcTime(date)).toBe(Date.UTC(2026, 2, 31));
    expect(euros(null)).toBeNull();
    expect(euros(12345 as never)).toBe(123.45);
  });
});

describe("euroAxisLabel", () => {
  it("keeps real zero, signs and Italian separators while abbreviating only the axis", () => {
    expect(euroAxisLabel(0)).toBe("0");
    expect(euroAxisLabel(-0)).toBe("0");
    expect(euroAxisLabel(125)).toBe("125");
    expect(euroAxisLabel(1250)).toBe("1,3k");
    expect(euroAxisLabel(-1250)).toBe("-1,3k");
    expect(euroAxisLabel(136078.49)).toBe("136,1k");
    expect(euroAxisLabel(1250000)).toBe("1,3M");
    expect(euroLabel(136078.49)).toContain("136.078,49");
  });
  it("does not turn unavailable or non-finite data into a zero", () => {
    expect(euroAxisLabel(Number.NaN)).toBe("");
    expect(euroAxisLabel(Number.POSITIVE_INFINITY)).toBe("");
  });
});
