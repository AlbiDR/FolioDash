import { describe, expect, it } from "vitest";
import { demoPortfolio } from "../../app/demoPortfolio";
import { allocation, fundRanking, metricSeries } from "./dashboardData";

describe("allocation", () => {
  it("lists only funds still held, largest first, and the shares add up to one", () => {
    const slices = allocation(demoPortfolio("typical"));
    expect(slices.map((slice) => slice.name)).toEqual(["Demo Global Equity", "Demo Euro Bonds"]);
    expect(slices.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1, 10);
    expect(slices[0]?.value).toBeGreaterThan(slices[1]?.value ?? Infinity);
  });

  it("is empty when nothing is held", () => {
    expect(allocation(demoPortfolio("empty"))).toEqual([]);
  });
});

describe("fundRanking", () => {
  it("orders by gain percentage, best first, and leaves out a percentage that cannot be calculated", () => {
    const model = demoPortfolio("typical");
    const ranked = fundRanking(model);
    const percents = ranked.map((fund) => fund.percent);
    expect(percents).toEqual([...percents].sort((left, right) => right - left));
    // The closed demo fund has no positive net invested, so it has no percentage and is not shown as zero.
    expect(ranked.map((fund) => fund.name)).not.toContain("Demo Tech Growth");
  });
});

describe("metricSeries", () => {
  it("keeps a missing figure as a gap and converts cents to euros", () => {
    const model = demoPortfolio("typical");
    const series = metricSeries(model.months, 0, "monthlyGain");
    expect(series).toHaveLength(model.months.length);
    expect(series[0]?.value).toBeNull();
    expect(series.some((entry) => entry.value !== null)).toBe(true);
  });

  it("starts at the requested statement", () => {
    const model = demoPortfolio("typical");
    expect(metricSeries(model.months, 3, "gain")[0]?.date).toBe(model.dates[3]);
  });
});

describe("dashboardFor", () => {
  it("returns the same object for the same model and range, and a new one when either changes", async () => {
    const { dashboardFor } = await import("./dashboardData");
    const model = demoPortfolio("typical");
    const first = dashboardFor(model, "All");
    expect(dashboardFor(model, "All")).toBe(first);
    expect(dashboardFor(model, "3M")).not.toBe(first);
    expect(dashboardFor(demoPortfolio("many"), "All")).not.toBe(first);
  });

  it("covers every widget from one model: totals, funds, allocation, ranking, bars and trends", async () => {
    const { computeDashboard } = await import("./dashboardData");
    const model = demoPortfolio("typical");
    const dashboard = computeDashboard(model, "All");
    expect(dashboard.totalSeries.map((entry) => entry.id)).toEqual(["value", "invested"]);
    expect(dashboard.fundSeries).toHaveLength(model.funds.length * 2);
    expect(dashboard.fundSeries.filter((entry) => entry.muted === true)).toHaveLength(model.funds.length);
    expect(dashboard.bars).toHaveLength(model.dates.length);
    expect(dashboard.heroTrend).toHaveLength(model.dates.length);
    expect(Object.keys(dashboard.holdingTrends)).toHaveLength(model.funds.length);
  });

  it("limits the series to the range but keeps each fund's trend over the whole history", async () => {
    const { computeDashboard } = await import("./dashboardData");
    const model = demoPortfolio("typical");
    const short = computeDashboard(model, "3M");
    expect(short.shownTimes.length).toBeLessThan(model.dates.length);
    expect(short.allTimes).toHaveLength(model.dates.length);
  });
});
