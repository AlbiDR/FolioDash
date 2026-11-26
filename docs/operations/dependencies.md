# Dependency maintenance

Run `npm ci --ignore-scripts`, `npm run audit:dependencies` and `npm run verify` after a dependency change. The audit covers production dependencies (`--omit=dev`) and fails on moderate or greater severity. Do not dismiss an alert or lower the threshold as a substitute for a fix.

Development tooling is excluded since 2026-11-17 on the owner's decision: GHSA-fc5q-39xc-vjpf (picomatch ReDoS, high, no patched version; 4.0.7 is the latest release) is reachable only through vite, vitest and typescript-eslint at build and test time and is not shipped. Run `npm audit --audit-level=moderate` without the flag to see the full tree and restore the full gate once picomatch publishes a fix.

## Current security override

`package.json` overrides requests for `minimatch@^10.0.0` to the exact patched release `11.0.1`. The locked package is used by ESLint 10.14.0, `@eslint/config-array` 0.23.5 and TypeScript-ESLint 8.72.1. At the time of the fix, their latest published versions still requested vulnerable version 10.

The override addresses [GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/advisories/GHSA-g3hv-75wg-m249), tracked by [Dependabot alert 1](https://github.com/AlbiDR/FolioDash/security/dependabot/1). Crafted glob patterns can amplify preprocessing work and consume excessive CPU/memory. This dependency is development tooling, not part of the browser's bank statement reader.

The advisory identifies 11.0.1 as the first patched release. It supports the project's Node 22 CI version. The override is scoped to version 10 requests so unrelated future major versions are not silently replaced. Remove it when the parent packages naturally resolve to patched versions, after a clean install, audit and project checks pass.

Verification after this major-version override:

- Clean `npm ci --ignore-scripts` succeeds and `npm run audit:dependencies` reports zero vulnerabilities.
- All 536 tests, type checking, linting, production build, PWA and Apps Script bundle checks pass.
- ESLint's complete before/after file lists are identical: 142 files, zero errors and warnings. This checks that the glob-library change did not quietly omit lint targets.
- `npm ls minimatch` shows only 11.0.1 across the affected dependency chains.

The lockfile also synchronises its root Node requirement with the existing `package.json` requirement of `>=22.18.0`; the declared supported version was not changed by this fix.

## Formatter: Prettier

Added 2026-11-17 for the organization standard. Prettier 3.9.10, MIT licence, development dependency only, exact-pinned. It is pinned exactly because formatter output changes between releases, and a drifting range would make the format check flaky. Release 3.9.10 was published on 2026-10-10; the newer 3.10.0 and 3.10.1 (2026-11-11 and 2026-11-12) were passed over until they have aged. It runs only at development time through `npm run format` and `npm run format:check`, with configuration in `config/prettier.json`, and ships nothing to the browser. It is installed with `--ignore-scripts` like every other dependency. Markdown, YAML and the public asset folder are outside its scope for now.

## Browser component tests, 2026-11-26

Added on the owner's request ("add browser component tests") as the FD-008 evaluation for this dependency. Both are development dependencies, exact-pinned, installed with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, and neither ships in the application (`npm ls --omit=dev` finds neither). `npm audit` reports no vulnerability.

| Package | Version | Licence | Published | Purpose |
|---|---|---|---|---|
| `@vitest/browser-playwright` | 5.0.5 | MIT | 2026-10-15 | Vitest browser mode with Playwright as its provider, pinned to the installed Vitest 5.0.5 exactly |
| `playwright` | 1.65.1 | Apache-2.0 | 2026-11-13 | Starts and drives the browser for those tests. No browser is downloaded: the tests use the Google Chrome already installed, or the `CHROME_PATH` override, like the rendered audits |

Together they add about 20 MB to `node_modules` (`playwright-core` is 14 MB) and no application bytes. They exist for one purpose: component tests of motion in a real browser (`npm run test:browser`, [Testing](testing.md#browser-component-tests)). If those tests stop earning their place, removing the two packages and `config/vitest.browser.config.ts` leaves nothing else behind.

## Test layer, 2026-11-18

Added for phase 7 of the organization standard. All are development dependencies, installed with `--ignore-scripts`, exact-pinned, and none ships in the application.

| Package | Version | Licence | Published | Purpose |
|---|---|---|---|---|
| `@vitest/coverage-v8` | 5.0.5 | MIT | 2026-10-15 | V8 coverage for the coverage ratchet. Pinned to the installed Vitest 5.0.5 exactly: a caret range moved Vitest itself to 5.1.0 during installation, which was reverted |
| `fast-check` | 4.10.2 | MIT | 2026-09-19 | Property-based tests for the pure kernel, with a fixed default seed |
| `axe-core` | 4.14.0 | MPL-2.0 | 2026-10-05 | Automated accessibility rules injected into the existing rendered audit. MPL-2.0 is file-level copyleft that applies to modified axe files; it is used unmodified as a development tool and is not distributed |
| `@stryker-mutator/core`, `@stryker-mutator/vitest-runner` | 10.1.1 | Apache-2.0 | 2026-10-23 | Mutation testing of the kernel, run on demand with `npm run audit:mutation` |

Stryker brings about 200 transitive packages, the largest footprint of the four. It is kept only for the kernel mutation audit and is a candidate for removal if that audit stops finding gaps. `npm run audit:dependencies` covers production dependencies only (see above), so none of these is in its scope.

