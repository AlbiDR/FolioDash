import { describe, expect, it } from "vitest";
import { type IsoDate, toIsoDate } from "./IsoDate";
import { statementDateCandidate } from "./StatementDate";

// A fixed UTC+1 clock, so the tests do not depend on the machine's time zone.
function plusOneHour(milliseconds: number): IsoDate | null {
  const moment = new Date(milliseconds + 60 * 60 * 1000);
  return toIsoDate(moment.getUTCFullYear(), moment.getUTCMonth() + 1, moment.getUTCDate());
}

function candidate(overrides: Partial<Parameters<typeof statementDateCandidate>[0]>) {
  return statementDateCandidate({
    created: null,
    fileName: "export.xlsx",
    lastModified: null,
    localDateOf: plusOneHour,
    ...overrides,
  });
}

describe("statementDateCandidate", () => {
  it("prefers the creation time stored in the file", () => {
    expect(
      candidate({ created: "2026-11-01T10:48:57Z", fileName: "2025-01-01.xlsx", lastModified: Date.UTC(2026, 5, 1) }),
    ).toEqual({ date: "2026-11-01", source: "file-created" });
  });

  it("uses the local date, which can differ from the UTC date near midnight", () => {
    expect(candidate({ created: "2026-11-01T23:30:00Z" })).toEqual({ date: "2026-11-02", source: "file-created" });
  });

  it("falls back to a date in the file name", () => {
    expect(candidate({ fileName: "2026-03-15.xlsx" })).toEqual({ date: "2026-03-15", source: "file-name" });
    expect(candidate({ created: "not a date", fileName: "statement 2026-03-15 final.xlsx" })).toEqual({
      date: "2026-03-15",
      source: "file-name",
    });
  });

  it("ignores an impossible date in the file name", () => {
    expect(candidate({ fileName: "2026-02-30.xlsx", lastModified: Date.UTC(2026, 4, 3, 8) })).toEqual({
      date: "2026-05-03",
      source: "file-modified",
    });
  });

  it("falls back to the last-modified time, then to nothing", () => {
    expect(candidate({ lastModified: Date.UTC(2026, 4, 3, 8) })).toEqual({ date: "2026-05-03", source: "file-modified" });
    expect(candidate({})).toBeNull();
  });
});
