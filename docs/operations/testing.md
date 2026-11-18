# Testing

Implemented 2026-11-18 as phase 7 of the organization standard. This document owns what each kind of check proves, where it runs, its recorded floors and the measured gaps. The rules behind it are `STD-5`, `STD-6`, `STD-11`, `GAT-1` and `GAT-3` to `GAT-6` in [CleanStack](../architecture/cleanstack.md).

## The layers

| Layer | Command | Proves | Runs |
|---|---|---|---|
| Unit and contract | `npm test` (Vitest, with coverage) | Behaviour of the kernel, applications, adapters and session logic against fakes | `npm run verify`, CI |
| Property | part of `npm test` | Invariants of the pure kernel over generated inputs: exact cents, dates, decimals, ISIN checksums, canonical JSON, SHA-256 | `npm run verify`, CI |
| Script | `npm run test:scripts` (`node --test`) | The tooling: icon drawing, PNG integrity, Pages assembly, README manifest | `npm run verify`, CI |
| Rendered interaction | `npm run audit:interactions` and seven synthetic journeys | Real Chrome, signed-out demo: control feedback, journeys, recovery, sale and reopening | CI, and locally after an interface change |
| Accessibility | `npm run audit:accessibility` | axe-core rules on 7 screens, 2 widths and 2 colour schemes | CI, and locally after an interface change |
| Reduced motion | `npm run audit:reduced-motion` | With `prefers-reduced-motion`, no transition or animation on any element or pseudo-element of 7 screens at 2 widths, smooth scrolling off, amounts hide at once | CI, and locally after an interface change |
| Mutation | `npm run audit:mutation` | Whether the kernel tests notice a deliberate bug | On demand, about 9 minutes |

None of this is live-Google or real-device proof (`GAT-5`). Every run uses synthetic data.

## Ratchets

- **Coverage.** `npm test` measures V8 coverage and `npm run verify:coverage` compares each area of `src/` with `config/coverage-baseline.json`. A drop in lines or branches fails, a new area needs a floor, and `-- --raise` only ever raises a floor. Measured at the start: `src/core` 97.8% lines and 92.4% branches, `src/applications` 97.0% and 88.6%, `src/adapters` 94.8% and 82.7%. The web layers are low in unit coverage (features 13.2%, presentation 22.0%, shared 34.8%) because the rendered audits, not unit tests, exercise them; the floors record that honestly.
- **Accessibility.** `config/accessibility-baseline.json` is empty: the demo screens pass the automated rules, and the audit was proven to detect an injected missing label, missing alt text and low contrast. Any new violation fails; the record can only shrink. Automated rules find roughly a third of real problems, so a pass is not a conformance claim.
- **Style.** `npm run verify:style` reads every stylesheet and records exceptions to UXC-12 in `config/style-baseline.json`: a duration or easing written out instead of a token (none), a raw colour (4), and a layout property transitioned or animated (6). Each recorded layout transition is deliberate, such as the sidebar grid, the allocation bars and the disclosure rows, and each raw colour is a local tint or a shadow; they are recorded, not hidden, and none may be added. The record only shrinks.
- **Structure and documents.** See [Repository policy](repository-policy.md).

## Property tests

A property test states an invariant and lets a library try many generated inputs, then shrinks a failure to a minimal counterexample. They sit beside their subject as `<name>.property.test.ts`; one that needs the platform, such as the SHA-256 comparison against Node's own implementation, lives in `tests/properties/`, because the kernel is compiled without Node types. The seed is set once in `tests/setup/fast-check.ts`, so no test reads the environment: it is fixed by default (`FOLIODASH_FC_SEED`, default 20261118) and the run count is `FOLIODASH_FC_RUNS` (default 300), so CI is reproducible and a failure can be replayed. Set a new seed or a large count to explore. At the start, 24 properties held over 30,000 runs each on two further seeds with no counterexample.

## Mutation testing, first measurement

Stryker changes the kernel in small ways and checks that a test fails. Static mutants (changes to top-level constants) are skipped, because each costs a full test run. The first run, 2026-11-18, scored **80.06%**: 2,092 of 2,613 mutants caught, 456 survived, 65 in code no test reaches. The run is held by a floor of 80% (`break` in `config/stryker.config.json`), so the score cannot silently fall. It is not part of `verify` because of its length.

| File | Score | Survived | Not covered |
|---|---|---|---|
| `isin.ts` | 97.1% | 1 | 0 |
| `decimal.ts` | 94.0% | 2 | 1 |
| `iso-date.ts` | 93.5% | 11 | 0 |
| `canonical-json.ts` | 90.7% | 4 | 0 |
| `money.ts` | 89.7% | 9 | 3 |
| `raw-sheet.ts` | 88.4% | 17 | 0 |
| `percent.ts` | 88.6% | 4 | 0 |
| `statement-labels.ts` | 87.1% | 8 | 1 |
| `checkpoints.ts` | 86.1% | 33 | 3 |
| `statement-date.ts` | 83.3% | 4 | 1 |
| `metrics.ts` | 82.4% | 27 | 0 |
| `work-expenses.ts` | 79.8% | 117 | 1 |
| `import-plan.ts` | 77.4% | 59 | 2 |
| `ledger.ts` | 65.9% | 101 | 30 |
| `backfill.ts` | 58.0% | 47 | 21 |

**Ranked backlog.** `backfill.ts` and `ledger.ts` come first: they are the least tested business rules and 51 of their mutants are in code no test reaches. Then `work-expenses.ts` (117 survivors) and `import-plan.ts`. A survivor is not always a bug: some are equivalent mutants (a change with no observable effect) or changes to a message string. Each file needs a human reading of its survivors before a test is written, and these gaps are fixed in their own commits, never inside a refactor (`STD-7`). The run included one test-helper file as if it were product code (`work-expenses-builders.ts`, 71%); it is now excluded.

## Decisions not taken, with reasons

- **Component tests with jsdom.** Not adopted. The rendered audits already exercise the real components in real Chrome with real layout, focus and pseudo-states; a simulated DOM would duplicate that with weaker evidence and add a dependency. Revisit if a component needs fast isolated tests.
- **Visual baselines.** Not adopted as a gate. Screenshots differ by operating system and Chrome build, so a baseline taken on one machine would fail on CI. Screenshots were compared byte for byte as a one-off proof during the file splits, on one machine.
- **Browser matrix (WebKit, Firefox).** Not yet. It needs a decision between adding Playwright or extending the in-house Chrome harness, and real Android and Safari proof remains an Open gate in any case (`GAT-5`).
- **Property tests for `metrics.ts` and `ledger.ts`.** Next after the mutation backlog, since those files are where the survivors are.

## Style and motion: decisions not taken, with reasons

- **Stylelint.** Not adopted. The rules needed are three, Prettier already puts one declaration on each line, and Stylelint would add a large dependency tree for them. The checker is one pure module with its own tests (`scripts/verify/style-policy.ts`) and follows the same ratchet as the structure and accessibility records. Revisit if the rule set grows well beyond motion, colour and cheap properties.
- **A separate rule that controls come only from shared primitives.** Not adopted. `npm run verify:interactions` already finds every control in the source, fails on any that has no classified family and contract, and the rendered audit samples each one; a second rule would restate it (UXC-4).
- **A `new:feature` generator.** Not adopted yet. The features do not share one shape (overview has a `model/` folder, import has many step views), and generating a shape that does not exist would break PRN-1. When the next feature is added, its folder becomes the template and the generator can follow.

## Conventions

Unit tests sit beside their subject. A long file's tests are cut along `describe` blocks into a `<subject>-suites/` folder, and shared builders go in `tests/fixtures/<area>/`, because production source may not import tests. A test file must live in `src/`, `tests/` or `scripts/`, where a runner looks; the repository policy rejects one anywhere else. `npm test` is the fast loop (a few seconds); `npm run verify` adds the script tests, the rendered checks in CI, and every gate.
