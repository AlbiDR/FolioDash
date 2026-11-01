# Architecture decision register

Status: draft record, created 2026-11-01. This is not a list of already-implemented capabilities.

The CleanStack ADR owns architecture rules. This register owns decision state and approval history. An implementation cannot turn an unresolved privacy or accounting choice into a de facto accepted decision.

## Confirmed context

- The project name and intended folder are **FolioDash**.
- The user uses Mac and Android and wants simple access from both.
- Existing inputs are bank Excel exports, with some reconstructed early history.
- Normal use must not need AI or developer intervention.
- Consistent organisation and presentation are requirements, not afterthoughts.
- The working Sheets system must not be damaged during exploration/migration.

The owner has now selected GitHub-managed frontend delivery with a user-owned private Google workbook and Apps Script as the backend (FD-013). No deployment, real-data integration, OAuth/deployment ownership model, frontend framework or licence has been authorised. The suggested GitHub-secrets runtime bridge is not technically adopted: runtime access needs authenticated user Google authorisation, as documented in FD-014.

## Decisions

| ID | Subject | State | Recommended direction | Blocks |
|---|---|---|---|---|
| FD-001 | Product boundary and delivery | Proposed | Responsive installable PWA; no native twin, trading or bank login in v1 | Product acceptance |
| FD-002 | CleanStack dependency law | Proposed | Pure kernel, port-based use cases, adapters and isolated interfaces | Runtime structure |
| FD-003 | Cloud privacy and encryption | Constrained by FD-013; privacy review pending | Private Google-readable workbook, not FolioDash E2EE; caller scopes/code-delivery trust still need review | Security claims and real-data integration |
| FD-004 | Original-source retention | **Open details** | Native bank import tabs in the user's workbook; exact retained fields/full-XLSX Drive archive still undecided | Import payload and document storage |
| FD-005 | Authentication and sessions | **Open** | Established auth, explicit credential ownership, revocation/recovery, account isolation | Account/backend implementation |
| FD-006 | Snapshot granularity | Proposed | One coherent snapshot per date; multiple per month; explicit same-date revision | Temporal model and import schema |
| FD-007 | Financial reporting and migration policy | **Open** | Preserve labelled legacy definitions for parity; approve granular/monthly baselines explicitly | Public calculation contract and parity sign-off |
| FD-008 | Stack, hosting and dependencies | Partially selected by FD-013; language chosen by owner | GitHub frontend and Google service/storage; TypeScript, npm, Vitest, ESLint with typescript-eslint and esbuild (owner-agreed 2026-11-01, versions and licences to be verified at scaffold); Preact with Vite for the UI and SVG charts drawn with `d3-scale`, `d3-shape` and `d3-array` (both owner-agreed 2026-11-01); PWA tooling, Pages visibility/plan, origin and deployment tooling still open | UI scaffolding and publication |
| FD-009 | Backup, restore, deletion and retention | **Open** | Complete portable backup, tested restore, explicit retention/expiry and recovery targets | Production persistence/deletion release |
| FD-010 | Offline and update behaviour | Proposed | Offline viewing only; online confirmation/corrections; account-scoped caches and non-disruptive updates | PWA cache/service-worker implementation |
| FD-011 | Licence, authorship and reuse | **Open** | Choose deliberately; review legacy-source provenance before porting | Source reuse and public distribution |
| FD-012 | Quality targets and test environment | Proposed / measurements open | Adopt web contract; choose supported device/browser versions and measured budgets before release | Support/performance claims |
| FD-013 | Google-backed application | **Direction selected by owner** | GitHub holds code/frontend; private user-owned Sheets holds imports plus ledger; Apps Script provides the service; no separate database provider | Defined in [Google-backed architecture](google-sheets-backend.md); not a deployment approval |
| FD-014 | Authenticated browser-to-Google route | **Proposed; NOT VERIFIED** | User Google OAuth to Apps Script API executable; deployment ownership/scopes and real-browser setup to prove first; no browser GitHub secret | Connection implementation and all real-data access |
| FD-015 | Lean repository root | **Principle selected by owner; detailed policy proposed** | Root holds essential entry/discovery files only; canonical content homes and justified tool exceptions are in CleanStack section 4.3 | Source scaffolding/root-policy enforcement |
| FD-016 | Apps Script source sync | **Owner direction; NOT SET UP; details proposed** | GitHub is the source of truth; reviewed merges push the Apps Script code with clasp from CI, one-way, so editor edits are overwritten | FD-014 deployment model, any CI credential, repository creation |

## FD-003: privacy implications of the selected Google direction

### Current direction

Financial records stay in the user's private Google workbook. Google controls its platform protections and the user controls sharing. Authorised Apps Script code processes readable data and can independently validate financial semantics. User ownership avoids an additional developer-owned portfolio database; it does not make GitHub secrets a runtime API, turn Sheets into E2EE, or remove trust in deployed frontend/script code.

### Alternative requiring a superseding decision

An E2EE version would store encrypted contents and shift financial validation to trusted clients, rather than operate a normal readable bank/ledger workbook. Device enrolment, key recovery, revocation and encrypted schema migrations would need a different approved design. It is not provided by the current direction.

The hosted web client's delivery remains a trust boundary in either case. Do not promise that a login password, private GitHub repository or HTTPS alone provides E2EE. Do not invent a custom cryptographic protocol to close this decision cheaply.

### Review still required before real-data access

1. Accept and document Google's role, the actual OAuth scope reach and application/script code-delivery trust.
2. Prove the selected execution identity and user-workbook binding with two accounts; developer identity is not a substitute for caller identity.
3. Choose any sensitive offline caching and define logout/revocation/backup behaviour.

The owner's Google-backed direction is recorded, not re-opened as an unselected generic database choice. Unproven privacy/session properties remain explicitly unproven; synthetic feasibility work can proceed under its own task authority.

## FD-004: evidence trade-off

Native bank import tabs in the user's private workbook are now part of FD-013. Specify which source fields survive and whether original XLSX bytes are additionally archived in Drive. A converted sheet is not a byte-identical file backup. Retaining complete source documents increases evidence/recovery capability and sensitive-data exposure; financial cash records still need a ledger separate from raw imports.

Checksums are equality checks, not document backups or proof that a statement was bank-issued. Reconstructed months retain their provenance explicitly.

## FD-007: financial policy questions

- Does v1 retain the existing January-statement YtD or introduce a separately labelled calendar-year baseline?
- How are YoY comparisons chosen when observation days differ or a month is absent?
- How does a newly inserted intermediate observation interact with cash recorded only for an interval?
- Which historical corrections/backfills are supported at launch, and how is affected downstream history revalidated?
- What can the UI legitimately call performance when cash timing is unknown?

Do not change the financial policy while claiming a visual-only migration. Methods must be versioned, explained and tested with independently worked examples.

## FD-008: evaluation constraints, not a vendor shortlist

Choose technologies against the actual vertical slice: local XLSX parsing, exact-money policy, responsive real charts, auth isolation, atomic/idempotent writes, cross-device revision checks, recoverable backups, cache control and deployable security headers.

Evaluate SDK/data-upload behaviour, maintenance, licences, cost limits, data location, export/exit options and actual Mac/Android compatibility. Public code, public site access and private data are separate decisions. A free tier alone is not a security or reliability argument.

Google is now the selected service/storage direction, and GitHub the intended frontend/source platform. Do not import another project's framework, token/deployment model, dependency budget or GPL choice. Verify Pages source visibility/plan before claiming private source can be hosted there for free.

Owner direction, 2026-11-01: TypeScript is accepted as the language, including for the shared kernel that is bundled for Apps Script (FD-016). The same day the owner agreed to proceed with npm as package manager, Vitest for tests, ESLint with typescript-eslint for linting and esbuild to bundle the shared kernel into files Apps Script accepts, reusing the Playlist Tidy toolchain. Current versions and licences are verified when the project is scaffolded. On 2026-11-01 the owner agreed to Preact with Vite for the UI, judged only on FolioDash's own needs: installable PWA, data-driven views for any set of funds, accessible forms, small output and a fit with the existing TypeScript checks. React and Svelte were the close alternatives. The money, date, bank-reader and reconciliation code does not depend on the UI framework, so the choice is replaceable. The component-testing approach and PWA tooling remain open, and Vite and Preact versions and licences are verified at scaffold.

Charts, same day: the owner agreed to SVG charts rendered by Preact from three small d3 modules (`d3-scale`, `d3-shape`, `d3-array`, ISC), behind the single chart adapter the architecture requires. Alternatives measured in a scratch bundle (minified and gzipped, a typical line chart, provisional until FD-012): d3 modules about 15 KB, uPlot 24 KB, Chart.js 57 KB without its separate date adapter, Observable Plot 140 KB, ECharts 195 KB; Highcharts was excluded for its commercial licence. SVG was chosen because the plotted values stay inspectable by tests, it takes text alternatives, keyboard focus and a table fallback, and it follows design tokens, reduced-motion and forced-colours settings. The cost is writing the axes, legend and hover handling, a few hundred lines for a few charts. The adapter keeps the choice replaceable.

Scaffolded 2026-11-01 with `npm run verify` (attribution check, type check, lint, tests). Versions chosen at that point: TypeScript is held at 6.0.x because typescript-eslint declares support only below 6.1, although 7.x exists; `@types/node` 22 matches the minimum Node version used in CI. esbuild is deferred until the first bundled Apps Script entry exists, so it is not an unused dependency. The `audit:dependencies` gate fails on high severity or above. `npm audit` currently reports 11 moderate findings, all in the linting toolchain (a `minimatch` denial-of-service advisory), a development-only tool that is not shipped and reads only this repository's files. They are recorded, not fixed, pending owner review, and re-checked at each dependency update. TypeScript 7 is not adopted: per third-party reports, typescript-eslint cannot use it until the stable compiler API expected in TypeScript 7.1 ships. Revisit when 7.1 is stable and typescript-eslint declares support; no change of lint tool is planned.

## FD-013 and FD-014: selected direction versus proposed protocol

Owner direction, recorded 2026-11-01: keep the financial data in the user's Google spreadsheet, use connected Apps Script functionality and recreate the interface in FolioDash managed through GitHub, avoiding a separate database service.

The [Google-backed architecture](google-sheets-backend.md) is the detailed amendment. Its credential correction is mandatory: Actions secrets may support controlled deployment but cannot be privately delivered to a static browser frontend. No per-user bank access through GitHub jobs or published data artifacts is adopted.

The proposed runtime route uses user Google OAuth and an Apps Script API executable. Central versus user-managed deployment, common Google Cloud project configuration, authorisation, scopes and real browser behaviour are unresolved implementation details, not automatic consequences of connecting a sheet. The first feasibility milestone is an authenticated synthetic read from the actual app origin, followed by a race/idempotency-tested synthetic commit. Do not claim a CORS/auth bypass, public export or execute-as-owner shared-secret endpoint as success.

This amendment changes storage/transport assumptions in the parent ADR and web contract. It does not change financial policies, approve a live migration, broaden retention, alter the original spreadsheet or authorise publication. No Google project, OAuth credential, Apps Script deployment or GitHub secret has been created by these documents.

## FD-015: lean repository root

FD-015 records the owner's instruction to keep the root clean and lean. It does not authorise moving/deleting the existing legacy scripts or private exports. Root tooling exceptions must be justified under FD-008 rather than hidden behind extra wrappers or duplicated configuration. Enforcement is a future check, not a current passing gate.

## FD-016: GitHub-to-Apps Script source sync

Owner direction, recorded 2026-11-01: Google Sheets stores the data, so FolioDash needs little Apps Script code, but the code it does need should be kept in sync with GitHub automatically instead of being copied by hand. This records the direction only. Nothing is installed, no repository or Google project is connected, and no credential exists. The owner confirmed later the same day that clasp is the wanted mechanism and that the repository should be hosted on GitHub. The repository was created on 2026-11-01 as a private repository, `AlbiDR/FolioDash`, holding the documents only. The legacy `App Scripts/` folder stays local and ignored until the FD-011 provenance review. clasp is installed and logged in on the owner's Mac with Google's default OAuth client. On 2026-11-01 the owner's own empty Apps Script project received synthetic test code (`src/interfaces/server/`, no financial logic) by manual `clasp push`, verified by pulling the files back. Whether that project is bound to a workbook is not yet confirmed. Its `.clasp.json` is ignored. No workflow, CI credential or secret exists, and no deployment has been made.

**Owner expectation, 2026-11-01:** Apps Script holds little code, mainly normalisation and import. Everything else is proper application code. The normaliser is therefore the shared pure kernel built for both runtimes (Google-backed architecture §6), so what clasp pushes is a built artifact, not hand-written `.gs` files. This ties FD-016 to the language and bundler choice in FD-008.

**Mechanism (checked against Google's clasp guide and the clasp README on 2026-11-01).** Apps Script has no built-in GitHub sync. The usual route is `clasp`, an open-source command-line tool that uploads (`push`), downloads (`pull`), versions and deploys a script project. Google's guide documents a GitHub Actions workflow that pushes on merge to the main branch with credentials held as repository secrets. The clasp README says it is not an officially supported Google product.

**Facts that shape the design:**

- The Apps Script API must be enabled in the owner's Google settings, and `clasp login` is an interactive sign-in only the owner can do.
- The Apps Script API does not support service accounts, and the README marks clasp's service-account option as experimental and not working. A CI job would therefore hold the owner's long-lived Google login token (`.clasprc.json`) as a GitHub secret, which the README says must stay private. This is the "optional deployment credential" case in the [Google-backed architecture](google-sheets-backend.md#2-essential-correction-github-secrets-are-not-a-runtime-bridge) and needs explicit task authority.
- `clasp push` replaces the whole remote project, so sync is one-way. Edits made in the Apps Script editor are lost on the next push.
- clasp 3.x does not transpile TypeScript and needs Node 22 or later, so a bundler may be needed. This interacts with FD-008 and with the shared kernel the Apps Script runtime must run (Google-backed architecture §6).
- The repository is not yet a Git repository and has no remote.

**Dependence on FD-014.** What is synced depends on the deployment model:

- *One centrally maintained API executable:* the script project holds code only, and each person's financial data stays in their own workbook. A CI credential for it has a small blast radius if the deploying Google account is not the account that holds the portfolio. This fits the sync.
- *User-managed deployments:* each person owns a copy, so the owner's CI cannot update them. Each person would need a documented setup of their own, which conflicts with the owner's wish that others can use FolioDash easily.
- *A script bound to a workbook:* pushing it needs editor access to that workbook, so keep it out of CI.

**Proposed, not accepted:**

1. GitHub is the source of truth, one-way to Apps Script.
2. CI deploys only from the main branch after review, through a protected GitHub environment that requires a reviewer's approval, and never runs for forked pull requests.
3. Use the narrowest credential available, from an OAuth client in the owner's own Google Cloud project, held only in the CI secret store and never in frontend artifacts or logs.
4. Each deploy creates an immutable version and updates the existing deployment, so the API executable keeps its identifier.
5. Prove the pipeline first with a synthetic script that contains no financial logic.

**Proof required.** A synthetic script is pushed by CI, a redeploy updates the live API executable, the secret is absent from logs and build artifacts, and a pull request from a fork cannot reach it. All NOT RUN.

## Decision record template

When a decision is ready, append its detailed record here; split into a dedicated ADR only when its size warrants it.

```text
ID / title:
Status: proposed | accepted | superseded
Decision owner / approval date:
Context and constraints:
Options considered:
Decision and rationale:
Consequences and known limits:
Affected architecture sections and contracts:
Security/privacy and cost implications:
Migration / rollback:
Proof required and current evidence:
Revisit trigger / superseding decision:
```

## Reference adaptation record

The user supplied these design precedents; they are background references, not dependencies or instructions to operate those projects:

- **Clash-Manager, `CleanStack Architecture.md`:** strict boundaries, framework independence, naming, visual primitives, validation, failure-class prevention and governance.
- **Playlist Tidy, `docs/architecture/cleanstack.md`:** proportionate pure kernel/use-case/adapters structure, coherent reads, ambiguous-write recovery, explicit forbidden paths and real-integration gates.
- **Playlist Tidy, `docs/operations/web-quality.md`:** deployable security claims, synthetic journeys, accessibility, artifact budgets and exact-release verification.
- **Relay, `docs/conventions.md`, `docs/design.md`, `docs/ux.md`, `docs/ux-baseline.md`, `docs/ux-acceptance.md`:** one vocabulary/token system, measurable interaction/latency targets and honest separation of automated, visual and manual evidence.

Deliberate adaptations:

1. Keep infrastructure adapters out of the pure kernel, resolving ambiguity between a pure core and SDK clients located in core.
2. Do not inherit unattended write approvals, failed-gate bypasses or automatic financial submission.
3. Do not prune historical funds as if they were inactive game/player telemetry.
4. Keep financial methodology explicit and versioned, not self-calibrated from observed portfolio outcomes.
5. Start with no offline financial write queue or forced reload through an unsaved review.
6. Do not inherit other projects' framework, language-of-UI, licences, services, dependency budgets or 100/100 performance claims.
7. Interpret atomicity at the financial command/transaction boundary, not as a claim that every UI function can commit a distributed transaction.
