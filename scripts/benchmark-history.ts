import { performance } from "node:perf_hooks";
import { arch, cpus, platform } from "node:os";
import { syntheticHistory } from "../tests/fixtures/SyntheticHistory";
import { validateLedger } from "../src/core/Ledger";
import { computeMetrics } from "../src/core/Metrics";
import { overviewFromLedger } from "../src/interfaces/web/app/overviewFromLedger";
import { computeDashboard } from "../src/interfaces/web/features/overview/dashboardData";
import { computeLineChart } from "../src/interfaces/web/presentation/charts/lineChartGeometry";
import { type LedgerRow, RowLedgerStore } from "../src/adapters/ledger/RowLedgerStore";

const SAMPLES = 7;
function measure(run: () => unknown): { medianMs: number; p95Ms: number; worstMs: number } | { error: string } {
  try {
    run(); // One untimed warm-up. This is not a cold-start or browser benchmark.
    const times = Array.from({ length: SAMPLES }, () => {
      const start = performance.now();
      run();
      return performance.now() - start;
    }).sort((left, right) => left - right);
    const rounded = (index: number): number => Number((times[index] ?? 0).toFixed(3));
    return { medianMs: rounded(Math.floor(SAMPLES / 2)), p95Ms: rounded(Math.ceil(SAMPLES * 0.95) - 1), worstMs: rounded(SAMPLES - 1) };
  } catch (error) {
    process.exitCode = 1;
    return { error: error instanceof Error ? error.message : "Benchmark failed" };
  }
}

console.log(JSON.stringify({ node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, samples: SAMPLES, warmups: 1, data: "synthetic monthly history, no network or browser rendering" }));
for (const [months, funds] of [[120, 10], [360, 50], [1200, 100]] as const) {
  const ledger = syntheticHistory(months, funds);
  if (validateLedger(ledger).length > 0) throw new Error("Benchmark fixture is not a valid ledger.");
  const model = overviewFromLedger(ledger, "recorded");
  const dashboard = computeDashboard(model, "All");
  const rows: LedgerRow[] = [];
  const store = new RowLedgerStore({ readRows: () => rows, appendRows: (added) => { for (const row of added) rows.push(row); }, flush: () => undefined });
  store.publish(ledger, { commandId: "synthetic-growth", revision: ledger.revision, requestHash: "synthetic" });
  console.log(JSON.stringify({
    months, funds, holdings: months * funds, chartPoints: months * funds * 2,
    serializedCharacters: JSON.stringify(ledger).length,
    validate: measure(() => { if (validateLedger(ledger).length > 0) throw new Error("Invalid ledger"); }),
    metrics: measure(() => computeMetrics(ledger)),
    overview: measure(() => overviewFromLedger(ledger, "recorded")),
    dashboard: measure(() => computeDashboard(model, "All")),
    chartGeometry: measure(() => computeLineChart(dashboard.fundSeries, { width: 900, height: 300, margin: { top: 20, right: 20, bottom: 30, left: 70 }, includeZero: false })),
    ledgerRead: measure(() => { if (store.load().status !== "ok") throw new Error("Stored history did not validate"); }),
    serialize: measure(() => JSON.stringify(ledger)),
  }));
}
