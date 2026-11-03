# Dependency maintenance

Run `npm ci --ignore-scripts`, `npm run audit:dependencies` and `npm run verify` after a dependency change. The audit includes development dependencies and fails on moderate or greater severity. Do not dismiss an alert or lower the threshold as a substitute for a fix.

## Current security override

`package.json` overrides requests for `minimatch@^10.0.0` to the exact patched release `11.0.1`. The locked package is used by ESLint 10.14.0, `@eslint/config-array` 0.23.5 and TypeScript-ESLint 8.72.1. At the time of the fix, their latest published versions still requested vulnerable version 10.

The override addresses [GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/advisories/GHSA-g3hv-75wg-m249), tracked by [Dependabot alert 1](https://github.com/AlbiDR/FolioDash/security/dependabot/1). Crafted glob patterns can amplify preprocessing work and consume excessive CPU/memory. This dependency is development tooling, not part of the browser's bank statement reader.

The advisory identifies 11.0.1 as the first patched release. It supports the project's Node 22/24 CI versions. The override is scoped to version 10 requests so unrelated future major versions are not silently replaced. Remove it when the parent packages naturally resolve to patched versions, after a clean install, audit and project checks pass.

Verification after this major-version override:

- Clean `npm ci --ignore-scripts` succeeds and `npm run audit:dependencies` reports zero vulnerabilities.
- All 536 tests, type checking, linting, production build, PWA and Apps Script bundle checks pass.
- ESLint's complete before/after file lists are identical: 142 files, zero errors and warnings. This checks that the glob-library change did not quietly omit lint targets.
- `npm ls minimatch` shows only 11.0.1 across the affected dependency chains.

The lockfile also synchronises its root Node requirement with the existing `package.json` requirement of `>=22.18.0`; the declared supported version was not changed by this fix.
