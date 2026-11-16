import { describe, expect, it } from "vitest";
import { type IsoDate, parseIsoDate } from "./IsoDate";
import { statementLabels } from "./StatementLabels";

function date(text: string): IsoDate {
  const result = parseIsoDate(text);
  if (result === null) throw new Error("bad date");
  return result;
}

function names(...texts: string[]): { short: string; long: string; kind: string }[] {
  return statementLabels(texts.map(date)).map(({ short, long, kind }) => ({ short, long, kind }));
}

describe("statementLabels", () => {
  it("names an export taken on the 1st to 3rd after the month it closes", () => {
    expect(names("2026-11-01")).toEqual([{ short: "Oct 26", long: "October 2026 close, exported 1 November 2026", kind: "closes-previous-month" }]);
    expect(names("2026-11-03")[0]).toMatchObject({ short: "Oct 26", long: "October 2026 close, exported 3 November 2026" });
  });

  it("leaves every other date named exactly as before", () => {
    expect(names("2026-11-04")).toEqual([{ short: "Nov 26", long: "4 November 2026", kind: "unchanged" }]);
    expect(names("2026-11-14")[0]).toMatchObject({ short: "Nov 26", long: "14 November 2026" });
    expect(names("2026-02-28")[0]).toMatchObject({ short: "Feb 26", kind: "unchanged" });
  });

  it("crosses year ends and leap years", () => {
    expect(names("2026-01-01")[0]).toMatchObject({ short: "Dec 25", long: "December 2025 close, exported 1 January 2026" });
    expect(names("2026-03-01")[0]).toMatchObject({ short: "Feb 26" });
    expect(names("2028-03-01")[0]).toMatchObject({ short: "Feb 28", long: "February 2028 close, exported 1 March 2028" });
  });

  it("gives a clashing statement a date-only name that claims no period", () => {
    expect(names("2026-01-15", "2026-02-01")).toEqual([
      { short: "Jan 26", long: "15 January 2026", kind: "unchanged" },
      { short: "1 Feb 26", long: "Statement of 1 February 2026", kind: "date-only" },
    ]);
  });

  it("does not let one clash push later exports back to the old naming", () => {
    const result = names("2026-01-15", "2026-02-01", "2026-03-01", "2026-04-01");
    expect(result.map((entry) => entry.short)).toEqual(["Jan 26", "1 Feb 26", "Feb 26", "Mar 26"]);
    expect(result[2]).toMatchObject({ long: "February 2026 close, exported 1 March 2026", kind: "closes-previous-month" });
  });

  it("names a series of 1st-of-month exports one month earlier throughout", () => {
    expect(names("2025-07-01", "2025-08-01", "2025-09-01").map((entry) => entry.short)).toEqual(["Jun 25", "Jul 25", "Aug 25"]);
  });

  it("keeps the as-of date in every long name and returns one name per date in the order given", () => {
    const dates = ["2026-02-01", "2026-01-15", "2026-03-01"].map(date);
    const labels = statementLabels(dates);
    expect(labels).toHaveLength(3);
    expect(labels[0]?.long).toBe("Statement of 1 February 2026");
    expect(labels[1]?.long).toBe("15 January 2026");
    expect(labels[2]?.long).toBe("February 2026 close, exported 1 March 2026");
  });

  it("is deterministic and never gives two statements the same period name", () => {
    const sets = [
      ["2025-12-01", "2026-01-01", "2026-01-20", "2026-02-02", "2026-02-20", "2026-03-03"],
      ["2026-05-01", "2026-05-31", "2026-06-01", "2026-07-02", "2026-08-30"],
    ];
    for (const set of sets) {
      const first = statementLabels(set.map(date));
      expect(statementLabels(set.map(date))).toEqual(first);
      const periods = first.filter((label) => label.kind !== "date-only").map((label) => label.short);
      expect(new Set(periods).size).toBe(periods.length);
    }
  });
});
