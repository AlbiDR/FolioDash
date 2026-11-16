import { describe, expect, it } from "vitest";
import { chartMarkers } from "../../../../core/Checkpoints";
import { type IsoDate, parseIsoDate } from "../../../../core/IsoDate";
import { toEuroCents } from "../../../../core/Money";
import { statementLabels } from "../../../../core/StatementLabels";
import { demoPortfolio } from "../../app/demoPortfolio";
import { demoCheckpoints } from "../../app/demoCheckpoints";
import { computeLineChart } from "../../presentation/charts/lineChartGeometry";
import { monthLabel, observationLabel, utcTime } from "./chartData";
import { checkpointSeries, computeDashboard } from "./dashboardData";

// Synthetic figures only.
function date(text: string): IsoDate {
  const result = parseIsoDate(text);
  if (result === null) throw new Error("bad date");
  return result;
}
const cents = (value: number) => {
  const result = toEuroCents(Math.round(value * 100));
  if (result === null) throw new Error("bad amount");
  return result;
};
const checkpoint = (id: string, on: string, value: number) => ({ id, date: date(on), cents: cents(value), note: "" });

describe("checkpoint markers on the chart", () => {
  it("X8 keeps only markers inside the shown period and draws one point per date", () => {
    const markers = chartMarkers([checkpoint("c1", "2026-03-05", 1000), checkpoint("c2", "2026-10-20", 1200), checkpoint("c3", "2026-10-20", 1210)]);
    const series = checkpointSeries(markers, date("2026-06-01"));
    expect(series?.points).toHaveLength(1);
    expect(series?.points[0]).toMatchObject({ time: utcTime(date("2026-10-20")), value: 1210, detail: "2 checkpoints on this date" });
    expect(checkpointSeries(markers, date("2026-11-01"))).toBeNull();
    expect(checkpointSeries(markers, undefined)).toBeNull();
    expect(series?.markers).toBe(true);
  });

  it("X5 to X7: one marker per date shows the latest, and the earlier returns when the latest is withdrawn", () => {
    const both = chartMarkers([checkpoint("c1", "2026-10-20", 1200), checkpoint("c2", "2026-10-20", 1210)]);
    expect(both).toHaveLength(1);
    expect(both[0]).toMatchObject({ cents: cents(1210), count: 2 });
    const afterVoid = chartMarkers([checkpoint("c1", "2026-10-20", 1200)]);
    expect(afterVoid[0]).toMatchObject({ cents: cents(1200), count: 1 });
  });

  it("is drawn as separate points, never joined, and widens the value axis to include them", () => {
    const geometry = computeLineChart([
      { id: "value", label: "Value", points: [{ time: 1_000_000_000_000, value: 100 }, { time: 1_000_086_400_000, value: 110 }] },
      { id: "checkpoints", label: "Checkpoint", markers: true, points: [{ time: 1_000_043_200_000, value: 150 }, { time: 1_000_172_800_000, value: 90 }] },
    ], { width: 700, height: 300, margin: { top: 10, right: 60, bottom: 20, left: 8 }, includeZero: false });
    const markers = geometry.series.find((entry) => entry.id === "checkpoints");
    expect(markers?.markers).toBe(true);
    expect(markers?.paths).toEqual([]);
    expect(markers?.areas).toEqual([]);
    expect(markers?.points).toHaveLength(2);
    const values = geometry.yTicks.map((tick) => tick.value);
    expect(Math.max(...values)).toBeGreaterThanOrEqual(150);
    expect(Math.min(...values)).toBeLessThanOrEqual(90);
  });

  it("X3 and X4 name a checkpoint by its full date, and a shared date by both", () => {
    const dates = [date("2026-09-15"), date("2026-11-01")];
    const labels = statementLabels(dates);
    const name = observationLabel(dates, labels, [date("2026-10-10"), date("2026-11-01")]);
    expect(name(utcTime(date("2026-10-10")))).toBe("Checkpoint of 10 October 2026");
    expect(name(utcTime(date("2026-11-01")))).toBe("Oct 26, exported 1 November 2026; checkpoint also recorded");
    expect(name(utcTime(date("2026-09-15")))).toBe("Sep 26");
    // A position that is neither keeps its calendar label.
    expect(name(utcTime(date("2026-10-01")))).toBe(monthLabel(utcTime(date("2026-10-01"))));
  });

  it("adds a checkpoint series to the dashboard without changing the statement lines", () => {
    const model = demoPortfolio("typical");
    const withMarkers = computeDashboard(model, "All", chartMarkers(demoCheckpoints(model)));
    const without = computeDashboard(model, "All");
    expect(withMarkers.totalSeries.map((entry) => entry.id)).toEqual(["value", "invested", "checkpoints"]);
    expect(without.totalSeries.map((entry) => entry.id)).toEqual(["value", "invested"]);
    expect(withMarkers.totalSeries.slice(0, 2)).toEqual(without.totalSeries);
    expect(withMarkers.metricTrends).toEqual(without.metricTrends);
  });

  it("only the demo has sample checkpoints", () => {
    expect(demoCheckpoints(demoPortfolio("typical"))).toHaveLength(2);
    expect(demoCheckpoints(demoPortfolio("empty"))).toEqual([]);
  });
});
