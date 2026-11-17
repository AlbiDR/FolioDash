import { describe, expect, it } from "vitest";
import { parseIsoDate } from "../../../../core/IsoDate";
import { availableRanges, rangeStart, resolveRange } from "./chartRange";

const dates = [
  "2025-07-01",
  "2025-08-01",
  "2025-09-01",
  "2025-10-10",
  "2025-11-02",
  "2026-06-08",
  "2026-10-03",
  "2026-11-01",
].map((text) => parseIsoDate(text) as NonNullable<ReturnType<typeof parseIsoDate>>);

describe("rangeStart", () => {
  it("starts at the first statement for All and for an empty history", () => {
    expect(rangeStart(dates, "All")).toBe(0);
    expect(rangeStart([], "1Y")).toBe(0);
  });

  it("counts calendar months back from the latest statement, not statements", () => {
    // Latest is November 2026: 3M starts at August 2026, which has no statement, so the first one on or after is October 2026.
    expect(dates[rangeStart(dates, "3M")]).toBe("2026-10-03");
    // 6M starts at May 2026, so June 2026 is the first inside it.
    expect(dates[rangeStart(dates, "6M")]).toBe("2026-06-08");
    // 1Y starts at November 2025.
    expect(dates[rangeStart(dates, "1Y")]).toBe("2025-11-02");
  });

  it("shows everything when the history is shorter than the range", () => {
    expect(rangeStart(dates.slice(0, 3), "1Y")).toBe(0);
  });
});

describe("availableRanges", () => {
  const ids = (list: readonly string[]) =>
    availableRanges(list.map((text) => parseIsoDate(text) as NonNullable<ReturnType<typeof parseIsoDate>>)).map(
      (option) => option.id,
    );

  it("offers only All for a single statement", () => {
    expect(ids(["2026-11-01"])).toEqual(["All"]);
  });

  it("hides ranges the history cannot fill", () => {
    expect(ids(["2026-05-01", "2026-08-01", "2026-11-01"])).toEqual(["3M", "6M", "All"]);
    expect(ids(["2025-11-01", "2026-11-01"])).toEqual(["3M", "6M", "1Y", "All"]);
    expect(ids(["2023-11-01", "2026-06-01", "2026-11-01"])).toEqual(["3M", "6M", "YTD", "1Y", "3Y", "All"]);
  });

  it("offers YTD only when it shows two statements and differs from All", () => {
    expect(ids(["2026-01-05", "2026-11-01"])).not.toContain("YTD");
    expect(ids(["2025-12-01", "2026-01-05"])).not.toContain("YTD");
    expect(ids(["2025-06-01", "2026-03-01", "2026-11-01"])).toContain("YTD");
  });

  it("starts YTD at January of the latest statement's year", () => {
    const list = ["2025-06-01", "2025-12-20", "2026-02-01", "2026-11-01"].map(
      (text) => parseIsoDate(text) as NonNullable<ReturnType<typeof parseIsoDate>>,
    );
    expect(list[rangeStart(list, "YTD")]).toBe("2026-02-01");
  });

  it("falls back to All when the chosen range is not available", () => {
    const list = dates.slice(0, 3);
    expect(resolveRange("3Y", list)).toBe("All");
    expect(resolveRange("All", list)).toBe("All");
  });
});
