# Repository policy and automated checks

Implemented 2026-11-04 under the owner's organization audit request. Architecture authority remains [CleanStack sections 4.1 and 4.3](../architecture/cleanstack.md); tooling and root exceptions are recorded in [FD-008 / FD-015](../architecture/decision-register.md). This implementation record does not accept the rest of the draft or close open decisions.

## Current ownership

| Home | Present responsibility |
|---|---|
| `src/core/` | Pure financial values, ledger invariants and canonical calculations |
| `src/applications/` | Use cases, ports and shared workflow contracts; source and session value contracts |
| `src/adapters/` | External formats, Google transport and ledger persistence |
| `src/interfaces/server/` | Retained Apps Script composition and service entry |
| `src/interfaces/web/app/` | Browser composition, routing, session orchestration and infrastructure wiring |
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

The TypeScript syntax walker checks relative imports, type-only imports, re-exports, literal dynamic imports, import type expressions and CommonJS import syntax. Nonliteral module loads, unresolved aliases and unapproved external packages fail closed. Production source cannot import tests or fixtures. Adjacent tests may cross layers and use test dependencies; they are excluded from the production dependency graph. CSS is resolved as a web style dependency, not parsed as TypeScript. The checker does not analyze CSS dependency direction.

The UI external-package allowlist covers the selected Preact and d3 modules. Core and applications cannot import runtime packages. The worker imports only within its area. The browser app cannot import server entry points or Apps Script adapters. Import cycles include type-only edges, keeping contracts independent of the implementations that consume them.

`tests/scripts/repositoryPolicy.test.ts` exercises approved entry points and deliberate violations: private/generated paths, forbidden layer directions, cross-feature imports, barrels, dynamic imports, unresolved dependencies and cycles. `npm run verify` runs the checker before types, lint, tests and builds. Existing CI invokes that command, so no duplicate verification policy is needed.

## Limits and remaining evidence

A path check cannot detect real financial data or credentials inside an otherwise allowed file, certify Git history, inspect ignored folders, or prove that a built artifact contains no private content. Content and release privacy reviews remain required. The import graph does not prove all runtime purity, financial correctness, transitive package capabilities or dynamically constructed network behavior. Core compiler settings exclude DOM and Node globals; code review and kernel tests remain necessary.

This audit changes ownership and imports while preserving calculation and write behavior. Local automated results are reported with the change. It does not establish hosting, deployed Google authorization, real-device accessibility or installation support, backup/restore acceptance, branch protection, licensing or any other unresolved release gate.

## Local verification record, 2026-11-04

Revision: the commit containing this record. Environment: local macOS, Node 26.13.0, synthetic fixtures. `npm run verify`: PASS, including 579 tests in 45 files, type checking, lint, production web build, PWA manifest/cache checks and Apps Script bundle verification. `npm run audit:dependencies`: PASS, zero reported vulnerabilities. `git diff --cached --check`: PASS after staging. CI on the declared Node 22/24 matrix and automatic deployment are separate runs whose results must be inspected after push. No live Google or physical-device acceptance was performed for this organization change.
