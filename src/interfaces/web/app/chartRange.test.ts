import { describe, expect, it } from "vitest";
import { parseIsoDate } from "../../../core/IsoDate";
import { rangeStart } from "./chartRange";

const dates = ["2025-07-01", "2025-08-01", "2025-09-01", "2025-10-10", "2025-11-02", "2026-06-08", "2026-10-03", "2026-11-01"].map(
  (text) => parseIsoDate(text) as NonNullable<ReturnType<typeof parseIsoDate>>,
);

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
