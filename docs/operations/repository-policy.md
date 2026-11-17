# Repository policy and automated checks

Implemented 2026-11-04 under the owner's organization audit request. Architecture authority remains [CleanStack sections 4.1 and 4.3](../architecture/cleanstack.md); tooling and root exceptions are recorded in FD-008 / FD-015. This implementation record does not accept the rest of the draft or close open decisions.

## Current ownership

| Home | Present responsibility |
|---|---|
| `src/core/` | Pure financial values, ledger invariants and canonical calculations |
| `src/applications/` | Use cases, ports and shared workflow contracts; source and session value contracts |
| `src/adapters/` | External formats, Google transport, ledger persistence and concrete browser identity/storage under `browser/` |
| `src/interfaces/server/` | Retained Apps Script composition and service entry |
| `src/interfaces/web/app/` | Browser composition, routing, session orchestration and infrastructure wiring; concrete browser identity/storage implementations belong in adapters |
| `src/interfaces/web/features/` | Isolated account, import, history and overview workflows; overview data selection and chart ranges |
| `src/interfaces/web/presentation/` | Domain-aware chart and amount/privacy presentation shared by workflows |
| `src/interfaces/web/shared/` | Domain-blind UI primitives, memoization and tokens |
| `src/interfaces/web/serviceWorker/` | Public-asset cache policy and worker entry |
| `src/interfaces/web/public/` | Public passthrough assets beside the configured Vite web entry |
| `tests/` | Synthetic fixtures and checks spanning layers; unit tests stay adjacent to their subject |
| `scripts/`, `config/`, `docs/`, `.github/` | Tooling, explicitly addressed settings, documentation and GitHub discovery metadata |

There are no empty directories for future migrations or services. The retained Apps Script implementation has an explicit FD-017 removal condition; it is not an accidental second implementation to delete during cleanup. Local user-supplied legacy/private folders are not production dependencies and are outside this audit's migration authority.

## Reproducible checks

`npm run verify:repository` checks tracked files plus new non-ignored files. Deleted working-tree files are omitted, so a move can be verified before staging. CI sees the committed checkout. It enforces the current root entry allowlist, known generated/private artifact paths and extensions, source-layer ownership, import direction and production dependency cycles.

The TypeScript syntax walker checks relative imports, type-only imports, re-exports, literal dynamic imports, import type expressions and CommonJS import syntax. Nonliteral module loads, unresolved aliases and unapproved external packages fail closed. Production source cannot import tests or fixtures. Adjacent tests may cross layers and use test dependencies; they are excluded from the production dependency graph. CSS is resolved as a web style dependency, not parsed as TypeScript. The checker does not analyze CSS dependency direction. Transitive source dependencies are also traversed to prevent browser roots from reaching server/Apps Script implementations, or server roots from reaching browser implementations, through intermediate adapters.

The UI external-package allowlist covers the selected Preact and d3 modules. Core and applications cannot import runtime packages. The worker imports only within its area. The browser app cannot import server entry points or Apps Script adapters. Import cycles include type-only edges, keeping contracts independent of the implementations that consume them.

`tests/scripts/repositoryPolicy.test.ts` exercises approved entry points and deliberate violations: private/generated paths, forbidden layer directions, cross-feature imports, barrels, dynamic imports, unresolved dependencies and cycles. `npm run verify` runs the checker before types, lint, tests and builds. Existing CI invokes that command, so no duplicate verification policy is needed.

## Filesystem compartment checks

The path check also rejects case-colliding files or directory names, documentation outside named documentation sections, non-configuration content in `config/`, non-TypeScript content in tooling/tests, loose adapters outside a named integration directory and Markdown inside production source. New binary fixtures need a reviewed policy exception; they are not automatically allowed merely because they are called synthetic. These checks enforce location and naming, not the semantic contents of a file.

Browser identity, client-ID storage and ledger-cache implementations and their adjacent tests now live in `src/adapters/browser/`. The web compiler includes that environment; the pure runtime compiler excludes it. All TypeScript configuration files are now type-checked and linted, including the Vitest configuration. The tooling compiler inherits web settings because the history benchmark imports the actual web projection/geometry pipeline; it retains Node types for tools. No root entry, empty future layer or production package was added.

See [Growth assessment](scalability.md) for the synthetic benchmark, regression tests and remaining capacity limits. User-supplied legacy/private folders remain ignored and untouched; the tracked-file check does not inventory their contents or authorize moving them.

## Limits and remaining evidence

A path check cannot detect real financial data or credentials inside an otherwise allowed file, certify Git history, inspect ignored folders, or prove that a built artifact contains no private content. Content and release privacy reviews remain required. The import graph does not prove all runtime purity, financial correctness, transitive package capabilities or dynamically constructed network behavior. Core compiler settings exclude DOM and Node globals; code review and kernel tests remain necessary.

This audit changes ownership and imports while preserving calculation and write behavior. Local automated results are reported with the change. It does not establish hosting, deployed Google authorization, real-device accessibility or installation support, backup/restore acceptance, branch protection, licensing or any other unresolved release gate.

## Local verification record, 2026-11-04

Revision: the commit containing this record. Environment: local macOS, Node 26.13.0, synthetic fixtures. `npm run verify`: PASS, including 579 tests in 45 files, type checking, lint, production web build, PWA manifest/cache checks and Apps Script bundle verification. `npm run audit:dependencies`: PASS, zero reported vulnerabilities. `git diff --cached --check`: PASS after staging. CI on the declared Node 22/24 matrix and automatic deployment are separate runs whose results must be inspected after push. No live Google or physical-device acceptance was performed for this organization change.

## Verification environment correction, 2026-11-15

Cross-layer tests now compile under the tooling configuration, which supplies Node and DOM types for synthetic file fixtures and browser session composition. The production core/application configuration still compiles without Node or DOM globals. No test files are excluded from verification; the same tests also remain in Vitest and ESLint. Exploratory files in the workspace were made type/lint clean and the restoration reproductions now assert retained cache contents without printing financial payloads.

The contributor allowlist records ADR as an exact alternate name for the already-approved AlbiDR GitHub no-reply address. Upstream commit `b3ed60e` used that identity. All author/co-author/automation checks remain enabled; no history was rewritten.

## Tooling floor, 2026-11-17

Phase 1 of the organization standard added the baselines every contributor and tool shares. It changes no source behavior, layer, financial rule or write path.

| File | Why it is at the root |
|---|---|
| `.editorconfig` | Editors resolve it upward from the edited file. It fixes UTF-8, LF, two-space indentation, a final newline and trimmed trailing whitespace, except in Markdown where two trailing spaces are a hard line break. |
| `.gitattributes` | Git reads it from the working-tree root. It normalises text to LF, marks images as binary and marks the lockfile as generated. |
| `.nvmrc` | Version managers read it from the root. It names the Node release CI runs; `engines` in `package.json` remains the minimum. |
| `.vscode/` | Shared editor settings that apply the formatter and recommend three extensions. It holds no personal preferences. |

The root allowlist in `scripts/repositoryPolicy.ts` lists exactly these entries and its test covers them and a rejected look-alike (`.prettierrc`). The formatter configuration lives in `config/prettier.json` and is passed explicitly, so it needs no root dotfile.

`npm run format:check` reports 238 files that the formatter would change. The repository-wide format is a separate, behavior-neutral commit that is added to `.git-blame-ignore-revs`; the check joins `verify` in that commit, not before it.

## Built-output oracle

A reorganization must not change a built byte. `npm run oracle -- write <file>` builds the web app and the Apps Script bundle with a pinned stamp and records the SHA-256 of every built file except source maps. `npm run oracle -- check <file>` builds the same way and fails on any added, removed or changed file. The snapshot holds hashes only.

The normal web build stamps the git revision, a `-dirty` flag and the current minute into the bundle. Content-hashed filenames cascade from that stamp, so any uncommitted change or minute boundary renames every output file. `FOLIODASH_BUILD_STAMP` pins the whole label; the oracle sets it and normal builds do not.

To regenerate the baseline, check out the tag `checkpoint-2026-11-17`, apply only the `FOLIODASH_BUILD_STAMP` handling in `config/vite.config.ts`, and run the `write` command. Verified 2026-11-17: the phase 1 branch produced 32 built files byte-identical to the checkpoint build. The oracle proves identical output on one machine and Node version; it does not prove identical output across operating systems or Node releases, and it cannot detect a change that leaves built bytes the same but alters tests or documentation.
