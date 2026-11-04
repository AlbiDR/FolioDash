# Growth assessment and synthetic history measurements

Recorded 2026-11-04. Architecture authority: [CleanStack](../architecture/cleanstack.md). Quality targets and supported devices remain open under FD-012 in the [decision register](../architecture/decision-register.md). These measurements are engineering evidence, not accepted product capacity or a Google quota guarantee.

## Reproduce

Run `npm ci --ignore-scripts`, then `npm run benchmark:history`. The command bundles the benchmark with the existing esbuild dependency into ignored `dist/benchmarks/history.mjs` and runs it in Node. No production dependency, cloud resource, credential, network access or private data is required. The benchmark exits unsuccessfully if a measured operation throws or a stored ledger fails validation. Timing values are reported, not used as flaky CI pass/fail thresholds.

The output names the Node version, operating system, architecture, CPU and synthetic dimensions. Each operation gets one untimed warm-up followed by seven timed samples; output reports median, nearest-rank p95 and worst. With seven samples, p95 is the worst sample. No forced garbage collection is used. Timing includes ordinary runtime and allocation variability. These are warm operation measurements, not cold starts or input-to-pixel latency. Operations are measured separately; adding medians does not establish an end-to-end percentile.

`tests/fixtures/SyntheticHistory.ts` constructs valid monthly histories directly, outside measured operations. Every fund remains active, opens with 100,000 cents invested, starts with a deterministic additional value and gains 10 cents per month without cash movement. ISINs are invented and checksum-valid. Existing kernel tests cover cash flows, closure, gaps and other financial cases; these growth fixtures do not replace them.

The pipeline measures ledger validation, canonical metrics, overview projection, dashboard data, actual production chart geometry, checksummed row-ledger loading and serialization. Row-ledger setup publishes one complete synthetic revision with snapshot references and no source statements. It does not represent the cumulative journal rows of years of separate commits or retained bank statements. No Google calls, XLSX parsing, source replay, DOM/SVG rendering, browser storage or network timing is measured.

## Local results

Environment: Apple M3 Pro, macOS arm64, Node 26.13.0. Baseline: `2e92105`; after: the commit containing this record. Independent runs on the same machine, same fixtures and seven samples per operation. Times are milliseconds and rounded to two decimals below; the command prints three decimals.

| Months / funds | Holdings | Chart points | Metrics median before / after | Overview median before / after | Geometry median before / after |
|---|---:|---:|---:|---:|---:|
| 120 / 10 | 1,200 | 2,400 | 0.80 / 0.13 | 0.97 / 0.18 | 1.04 / 0.97 |
| 360 / 50 | 18,000 | 36,000 | 12.03 / 4.97 | 11.41 / 4.90 | 13.71 / 12.73 |
| 1,200 / 100 | 120,000 | 240,000 | 103.89 / 33.46 | 109.27 / 42.29 | Argument-limit crash / 93.49 |

| After, months / funds | Metrics p95 | Overview p95 | Geometry p95 | Validated ledger read median / p95 | Serialized ledger characters |
|---|---:|---:|---:|---:|---:|
| 120 / 10 | 0.41 | 0.36 | 1.42 | 13.05 / 13.54 | 182,197 |
| 360 / 50 | 6.74 | 5.22 | 13.06 | 174.01 / 187.55 | 2,636,677 |
| 1,200 / 100 | 34.68 | 44.81 | 124.70 | 1,098.34 / 1,158.69 | 17,482,839 |

The 100-year case is a stress case, not a plausible supported-history promise. The largest case's validation median was 9.06 ms, dashboard-data median 21.29 ms and serialization median 26.17 ms. The remaining ledger-read cost includes parsing and checksum verification; this assessment does not remove or weaken integrity checks.

## Confirmed causes and changes

Metrics previously copied and searched the earlier history twice per statement for calendar baselines. It now indexes the first earlier statement in each month while traversing history, reducing baseline lookup from quadratic history work to linear work. The index is updated after calculating the current statement, preserving the existing first-earlier January and prior-year rules. Financial formulas, denominators and unavailable values are unchanged. Local exact JSON comparisons against the baseline implementation matched for 1/1, 13/2, 360/50 and 1,200/100 month/fund fixtures; independent expected-value tests remain in the suite.

Chart bounds previously flattened observed points and spread each dimension into `Math.min` and `Math.max`, exceeding the engine's argument limit at 240,000 points in this environment. A bounded-argument scan now visits every observation. Point counts, gaps, all-series bounds and plotted values are preserved. A 150,000-observation regression test uses the production geometry code; it does not claim a browser rendered those points responsively.

## Remaining limits and revisit triggers

- **Device cache:** the existing two-million-character cap prevents storing the middle and large fixtures. The app can still read online, but large portfolios cannot be promised a persistent device copy. Measure real supported browser storage and review the chosen retention policy before changing that cap or adopting a different cache adapter.
- **Google persistence:** the 45,000-character per-record safety limit, fund metadata size, snapshot size, growing timeline records and retained statement pieces are bounded by the current protocol. The benchmark is not proof of unlimited fund counts or workbook history. Larger workloads need synthetic live API payload, quota, concurrency and recovery tests before support claims. Do not compact or migrate records without an approved recovery path.
- **History replay:** rebuild and verification invoke canonical validation over growing history prefixes. That work can grow faster than a simple read. Measure source-backed histories separately before moving work to a worker or designing incremental replay; do not skip validation to reduce latency.
- **Rendering and interaction:** SVG point counts and UI table/card counts grow with history and fund count. Node geometry success is not a rendering budget. Measure supported browsers and devices before choosing aggregation, virtualization or a worker; any aggregation must preserve financial meaning and accessible source values.
- **Composition and contracts:** the present app shell and session orchestrator have current composition responsibilities. Their line counts alone do not justify more layers. Extract a cohesive use case when unrelated workflows share behavior or when a change cannot be tested without constructing the whole shell. Do not allow features to import one another to avoid designing a contract.
- **Provider lifecycle:** retain the Apps Script implementation only under FD-017's live-proof removal condition. Additional providers require a present need and narrow ports, not parallel feature implementations.

Organized growth means a change has an owner, respects dependency and environment boundaries, has representative synthetic correctness evidence, and records any new capacity assumptions. The next capacity work should follow measured browser, source-replay or provider pressure rather than add infrastructure in anticipation.
