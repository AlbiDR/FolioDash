import { it } from "vitest";
import { parseIsoDate, type IsoDate } from "../../src/core/IsoDate";
import { toEuroCents, type EuroCents } from "../../src/core/Money";
import { expenseReport, type ExpenseDay } from "../../src/core/WorkExpenses";
import { computeLineChart } from "../../src/interfaces/web/presentation/charts/lineChartGeometry";
import { positionAxisLabels } from "../../src/interfaces/web/presentation/charts/axisLabels";
import { monthLabel, utcTime, euroLabel } from "../../src/interfaces/web/features/overview/chartData";
import { describeAge } from "../../src/interfaces/web/features/account/timeAgo";
import { formatPercent } from "../../src/core/Percent";
import { motionMilliseconds } from "../../src/interfaces/web/shared/ui/motionTiming";
import { maskNumbers } from "../../src/interfaces/web/presentation/privacy/privacyChoice";

const d = (s: string): IsoDate => parseIsoDate(s) as IsoDate;
const c = (n: number): EuroCents => toEuroCents(n) as EuroCents;
const day = (on: string, total: number): ExpenseDay => ({ date: d(on), revision: on, amounts: [c(total), c(0), c(0), null, null] });
const LAYOUT = { width: 720, height: 300, margin: { top: 12, right: 78, bottom: 28, left: 8 }, includeZero: false };

it("explore", () => {
  // month starting on a weekend
  const nov: ExpenseDay[] = [];
  for (let n = 2; n <= 30; n++) { const date = d(`2026-11-${String(n).padStart(2, "0")}`); const wd = new Date(`${date}T12:00:00Z`).getUTCDay(); if (wd >= 1 && wd <= 5) nov.push(day(date, 1000)); }
  const r = expenseReport(nov, 2026, d("2026-12-10"));
  console.log("NOV", nov.length, r.startDate, r.eligibleMonths, r.averageMonthly, r.eligibleWeeks, r.averageWeekly);
  const oct = [day("2026-10-01", 1000), day("2026-10-30", 1000)];
  const r2 = expenseReport(oct, 2026, d("2026-12-10"));
  console.log("OCT", r2.startDate, r2.eligibleMonths, r2.averageMonthly);

  for (const dates of [["2026-11-01"], ["2026-10-03", "2026-11-01"], ["2026-09-02", "2026-10-03", "2026-11-01"], ["2026-08-01","2026-09-02", "2026-10-03", "2026-11-01"], ["2025-11-02","2026-06-08","2026-10-03","2026-11-01"]]) {
    for (const width of [720, 360]) {
      const g = computeLineChart([{ id: "v", label: "v", points: dates.map((s, i) => ({ time: utcTime(d(s)), value: 1000 + i * 10 })) }], { ...LAYOUT, width });
      const labels = g.xTicks.map(t => ({ key: String(t.time), text: monthLabel(t.time), x: t.x }));
      const pos = positionAxisLabels(labels, {}, g.plot.left, g.plot.left + g.plot.width, 12);
      console.log(dates.length, width, "ticks:", g.xTicks.map(t => new Date(t.time).toISOString().slice(0, 10) + "=" + monthLabel(t.time)).join(" | "), "VISIBLE:", pos.filter(p => p.visible).map(p => p.text).join(","), "yticks", g.yTicks.map(t => euroLabel(t.value)).join(" "));
    }
  }
  const M = 60000;
  for (const age of [59.5 * M, 89.4 * M, 89.5 * M, 23.49 * 60 * M, 35.49 * 60 * M, 36 * 60 * M, 59_500, 59_499]) console.log(age / M, describeAge(1e12, 1e12 - age));
  console.log(formatPercent(0.00004, { signed: true }), formatPercent(-0.00004, { signed: true }), formatPercent(1e20));
  console.log(["180ms", ".18s", "0.18s", " 0.2s ", "1e3ms", "", "0", "200", "calc(1s)"].map(v => motionMilliseconds(v)));
  console.log(maskNumbers("-1.234,56 €"), maskNumbers("+0,00 €"));
  // flat tiny span
  const g2 = computeLineChart([{ id: "v", label: "v", points: [{ time: 0, value: 100 }, { time: 86400000 * 40, value: 100.01 }] }], LAYOUT);
  console.log(g2.yTicks.map(t => String(t.value) + "=" + euroLabel(t.value)).join(" "));
  const g3 = computeLineChart([{ id: "v", label: "v", points: [{ time: 0, value: 0 }, { time: 86400000 * 40, value: 0 }] }], LAYOUT);
  console.log(g3.yTicks.map(t => String(t.value) + "=" + euroLabel(t.value)).join(" "), JSON.stringify(g3.series[0]?.paths));
});
