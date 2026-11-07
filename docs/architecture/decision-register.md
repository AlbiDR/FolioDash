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
| FD-007 | Financial reporting and migration policy | **Accepted 2026-11-01 for `legacy-parity-v1` as the initial policy; every other method stays open** | Preserve labelled legacy definitions for parity; approve granular/monthly baselines explicitly | Any new method, baseline or return definition |
| FD-008 | Stack, hosting and dependencies | Partially selected by FD-013; language chosen by owner | GitHub frontend and Google service/storage; TypeScript, npm, Vitest, ESLint with typescript-eslint and esbuild (owner-agreed 2026-11-01, versions and licences to be verified at scaffold); Preact with Vite for the UI and SVG charts drawn with `d3-scale`, `d3-shape` and `d3-array` (both owner-agreed 2026-11-01); PWA tooling, Pages visibility/plan, origin and deployment tooling still open | UI scaffolding and publication |
| FD-009 | Backup, restore, deletion and retention | **Open** | Complete portable backup, tested restore, explicit retention/expiry and recovery targets | Production persistence/deletion release |
| FD-010 | Offline and update behaviour | Proposed | Offline viewing only; online confirmation/corrections; account-scoped caches and non-disruptive updates | PWA cache/service-worker implementation |
| FD-011 | Licence, authorship and reuse | **Open** | Choose deliberately; review legacy-source provenance before porting | Source reuse and public distribution |
| FD-012 | Quality targets and test environment | Proposed / measurements open | Adopt web contract; choose supported device/browser versions and measured budgets before release | Support/performance claims |
| FD-013 | Google-backed application | **Direction selected by owner** | GitHub holds code/frontend; private user-owned Sheets holds imports plus ledger; Apps Script provides the service; no separate database provider | Defined in [Google-backed architecture](google-sheets-backend.md); not a deployment approval |
| FD-014 | Authenticated browser-to-Google route | **Proposed; NOT VERIFIED** | User Google OAuth to Apps Script API executable; deployment ownership/scopes and real-browser setup to prove first; no browser GitHub secret | Connection implementation and all real-data access |
| FD-015 | Lean repository root | **Principle selected by owner; detailed policy proposed** | Root holds essential entry/discovery files only; canonical content homes and justified tool exceptions are in CleanStack section 4.3 | Source scaffolding/root-policy enforcement |
| FD-016 | Apps Script source sync | **Owner direction; NOT SET UP; details proposed** | GitHub is the source of truth; reviewed merges push the Apps Script code with clasp from CI, one-way, so editor edits are overwritten | FD-014 deployment model, any CI credential, repository creation |
| FD-017 | Direct browser-to-Google storage (supersedes the Apps Script service for new users) | **Accepted by owner 2026-11-01; NOT yet verified on real Google** | The browser signs the person in once with the narrow `drive.file` permission, creates their spreadsheet itself, finds it again on any device, and reads and writes the ledger through the Sheets API. No script is deployed per person. The checked row protocol and the ledger rules are unchanged; they run in the browser. Replaces FD-014's route and amends FD-013 and FD-016 | Live proof on a real Google account; the Apps Script service and its deploy workflow are removed only after that proof |
| FD-018 | Browser copy of the ledger | **Accepted by owner 2026-11-01** | The Google spreadsheet is the durable record and the browser copy is a rebuildable accelerator, never financial authority. It is kept as a plain copy on the device with a visible "Forget this device" control; signing out wipes it. Encryption at rest and a passcode were offered and not chosen | Revisit if the threat model changes (shared devices) |
| FD-019 | Each month keeps its exact bank statement | **Accepted by owner 2026-11-01; not yet verified on real Google** | A save stores the month's bank statement, as read, and the decisions made about it, in the same all-or-nothing request as the ledger, with checksums; a readable tab per month (`Bank YYYY-MM-DD`) is written from it afterwards. The ledger can then be rebuilt from nothing but these, and a "Check my history" control replays every month and compares it with the saved figures. The holder name and contract numbers are kept in the sheet and never on the device copy | Live proof on a real Google account; months saved before this, or restored from a device copy, have no statement and are reported as such |
| FD-020 | Work expenses tracker | **Implementation authorised 2026-11-05; implemented locally, live expense proof pending** | Five-field workday tracker in the shared bento UI, separate checked expense log in the existing workbook, visible reporting choices and full correction history | See [implementation and acceptance](../operations/work-expenses.md) for current semantics, recovery and evidence; live/provider/device gates remain separate |
| FD-021 | Persistent tab access, freshness and competing saves | **Owner-requested 2026-11-05; implemented locally; live race proof pending. Tab-only storage superseded by FD-022** | Bounded Google access, automatic checked reads and an atomic predecessor guard for updated portfolio writers | Real Google race/regrant and physical two-device acceptance; indefinite login remains separate |
| FD-022 | Remembered Google connection | **Owner-requested 2026-11-07 (top priority); implemented locally; real Google renewal NOT verified** | Keep the connection on the device until Forget this device: durable access, remembered account, quiet renewal on the next click, guarded saves, cross-window coordination and visible recovery. No refresh token, server or new scope | Real Google sign-in/renewal on Mac and Android, installed-app behavior and the consent-screen publishing status |

## FD-020: work expenses tracker preparation (owner direction, 2026-11-04)

Reporting amendment, 2026-11-05: the owner clarified that the tracker measures costs of working onsite in the city rather than at home, to understand earnings left after those costs. The owner explicitly chose Dinner and Other Expenses as optional. `work-expenses-v2` therefore requires only both commutes and Lunch for an eligible workday, retaining optional blanks without review flags or stored-value rewrites. Entered optional costs still count. This supersedes the original five-required-fields interpretation; all-blank past weekdays still represent no tracked onsite work. Income and leftover-pay calculations are not inferred from portfolio values. The current [implementation record](../operations/work-expenses.md) owns the detailed semantics.

Implementation amendment, 2026-11-05: the owner explicitly requested refinement followed by tracker implementation and a coherent whole-app UX review. The [implementation record](../operations/work-expenses.md) supersedes preparation-only status: it documents the separate versioned expense log, shared navigation/visuals, explicit save/correction/recovery journeys and selectable reporting methods. This adds no auth scope or cloud service, leaves portfolio schema 1 unchanged, and does not authorise real-data migration or publication. Pending reporting preferences are represented as visible implementation choices with definitions, not labelled as accepted owner policy.

The owner selected feature parity with the legacy Monday-Friday work-expenses spreadsheet as the first tracker milestone, then authorised preparation only: define the contract and workbook compatibility proposal and harden current workbook setup and generated-tab handling. This extends the future product boundary without implementing a tracker. No live workbook modification or legacy migration is authorised.

[Work expenses tracker preparation](work-expenses-tracker.md) owns the five expense fields, required summaries, open financial/UX decisions, same-file recommendation, implemented safeguards and future proof gates. The owner leans toward one spreadsheet file; exact spending storage and upgrade protocol remain proposed. Portfolio schema 1 and its financial rules are unchanged. No generic expense platform, new auth scopes, cloud resources or licence decision is implied.

Owner follow-up, 2026-11-04: the preparation contract now records the agreed interpretation of blank past weekdays, fully recorded zero-cost workdays and ambiguous partial entries. Remaining reporting rules stay open. The owner also requires clear user journeys, readable data and purposeful microanimations/interactions throughout future work, under the existing web quality and interaction contracts. This remains preparation authority only.

The owner subsequently requested iterative refinement, audit and consolidation of the whole-product experience down to individual interactions. The [experience plan](../design/work-expenses-experience.md) records the resulting proposed UI integration, layout study and implementation order. Navigation, partial-save behaviour and other new design recommendations remain proposals; they do not settle financial policy or authorise implementation, live writes or migration.

Closing-day amendment, 2026-11-05: the owner requested that optional work costs be sufficient to close a day. `work-expenses-v3` treats any entered Dinner or Other Expenses amount, including explicit zero, as sufficient for a recorded workday even when routine fields are blank. Otherwise all three routine fields still need an amount or zero. This supersedes v2's optional-only partial-day interpretation. Stored blanks and command/backup bytes are preserved; affected historical days now participate in averages and projections under the new reporting policy. No automatic writes or migration are authorized by this reporting change.

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

### Implemented state, 2026-11-01

The overview now computes its figures with `computeMetrics` in `src/core/Metrics.ts`, under the policy named `legacy-parity-v1`. It is the definitions of the existing Sheets project, kept and labelled so results can be compared with it, following this register's recommended direction. The owner approved it on 2026-11-01 as the initial policy (record below). The questions above stay open for any other method:

- Net invested is cumulative cash in minus cash out; a sold fund keeps its result in the totals.
- Gain is value minus net invested; a percentage needs a positive denominator and is otherwise shown as a dash, never zero.
- Month on month needs the previous statement in the immediately preceding calendar month; its percentage uses the previous total plus the period's net cash as denominator (cash assumed to move before the return).
- Year to date is the change in gain since the January statement of the same year, not a return since 1 January. Year on year is the change in gain against the same calendar month one year earlier.
- Nothing is annualised, time-weighted or money-weighted, and the interface says percentages that depend on cash timing are estimates.

Not yet implemented: the average monthly figures, per-fund chained cumulative returns and the comparison view. The unit tests use figures worked out by hand from stated inputs, independent of any spreadsheet. Parity evidence, run locally on 2026-11-01 and not reproducible in CI because the data is private: the owner's 17 recorded statements were read from the existing ledger and passed every FolioDash ledger invariant with no issue. The totals, gain, month on month, year to date, year on year (amounts and percentages) and each fund's value and net invested were then compared with the existing Monthly Recap: 289 figures, 0 mismatches, amounts to the cent. This shows the metrics code reproduces the Sheets results for the same recorded cash data. It does not approve the policy, does not test whether the recorded cash movements are right, and leaves out the average monthly figures, which are not implemented. The owner signed off parity on 2026-11-01.

```text
ID / title: FD-007 / Initial reporting policy legacy-parity-v1
Status: accepted for this scope only
Decision owner / approval date: owner, 2026-11-01
Context and constraints: the existing Sheets project defines the figures the owner relies on; FolioDash must not change a financial definition while presenting itself as a visual rebuild.
Options considered: keep the legacy definitions labelled (chosen); adopt calendar-year or nearest-date baselines now; hold all reporting until every question above is settled.
Decision and rationale: ship the legacy definitions exactly, named and labelled, so results can be compared with the spreadsheet and nothing is silently redefined.
Consequences and known limits: year to date is measured from the January statement, not 1 January; month on month needs consecutive calendar months; percentages that depend on cash timing are estimates; nothing is annualised. Average monthly figures, per-fund chained returns and the comparison view are not implemented.
Affected architecture sections and contracts: CleanStack 5.3 reporting policy; the overview's displayed definitions in src/interfaces/web/app/overviewFromLedger.ts.
Security/privacy and cost implications: none.
Migration / rollback: the policy is a named, versioned function; a new method is added under a new name and a separate decision, not by editing this one.
Proof required and current evidence: hand-worked unit tests in CI; local parity run of 289 figures with 0 mismatches (private data, not reproducible in CI).
Revisit trigger / superseding decision: any change to a baseline, denominator or definition, or a proposal to add a calendar-year, time-weighted or money-weighted measure.
```

## FD-008: evaluation constraints, not a vendor shortlist

Choose technologies against the actual vertical slice: local XLSX parsing, exact-money policy, responsive real charts, auth isolation, atomic/idempotent writes, cross-device revision checks, recoverable backups, cache control and deployable security headers.

Evaluate SDK/data-upload behaviour, maintenance, licences, cost limits, data location, export/exit options and actual Mac/Android compatibility. Public code, public site access and private data are separate decisions. A free tier alone is not a security or reliability argument.

Google is now the selected service/storage direction, and GitHub the intended frontend/source platform. Do not import another project's framework, token/deployment model, dependency budget or GPL choice. Verify Pages source visibility/plan before claiming private source can be hosted there for free.

Owner direction, 2026-11-01: TypeScript is accepted as the language, including for the shared kernel that is bundled for Apps Script (FD-016). The same day the owner agreed to proceed with npm as package manager, Vitest for tests, ESLint with typescript-eslint for linting and esbuild to bundle the shared kernel into files Apps Script accepts, reusing the Playlist Tidy toolchain. Current versions and licences are verified when the project is scaffolded. On 2026-11-01 the owner agreed to Preact with Vite for the UI, judged only on FolioDash's own needs: installable PWA, data-driven views for any set of funds, accessible forms, small output and a fit with the existing TypeScript checks. React and Svelte were the close alternatives. The money, date, bank-reader and reconciliation code does not depend on the UI framework, so the choice is replaceable. The component-testing approach and PWA tooling remain open, and Vite and Preact versions and licences are verified at scaffold.

Charts, same day: the owner agreed to SVG charts rendered by Preact from three small d3 modules (`d3-scale`, `d3-shape`, `d3-array`, ISC), behind the single chart adapter the architecture requires. Alternatives measured in a scratch bundle (minified and gzipped, a typical line chart, provisional until FD-012): d3 modules about 15 KB, uPlot 24 KB, Chart.js 57 KB without its separate date adapter, Observable Plot 140 KB, ECharts 195 KB; Highcharts was excluded for its commercial licence. SVG was chosen because the plotted values stay inspectable by tests, it takes text alternatives, keyboard focus and a table fallback, and it follows design tokens, reduced-motion and forced-colours settings. The cost is writing the axes, legend and hover handling, a few hundred lines for a few charts. The adapter keeps the choice replaceable.

Scaffolded 2026-11-01 with `npm run verify` (attribution check, type check, lint, tests). Versions chosen at that point: TypeScript is held at 6.0.x because typescript-eslint declares support only below 6.1, although 7.x exists; `@types/node` 22 matches the minimum Node version used in CI. esbuild is deferred until the first bundled Apps Script entry exists, so it is not an unused dependency. The `audit:dependencies` gate fails on high severity or above. `npm audit` currently reports 11 moderate findings, all in the linting toolchain (a `minimatch` denial-of-service advisory), a development-only tool that is not shipped and reads only this repository's files. They are recorded, not fixed, pending owner review, and re-checked at each dependency update. TypeScript 7 is not adopted: per third-party reports, typescript-eslint cannot use it until the stable compiler API expected in TypeScript 7.1 ships. Revisit when 7.1 is stable and typescript-eslint declares support; no change of lint tool is planned.

### FD-008 / FD-015 implementation record, 2026-11-04

The root tool exceptions are `package.json` (npm package and script discovery) and `package-lock.json` (npm reproducible installation). npm owns both entry points; all explicitly addressable tool configuration stays in `config/`. No additional root exception is introduced. `src/interfaces/web/index.html` and its adjacent `public/` directory are the configured Vite web entry and passthrough assets; they implement the public-asset responsibility without a duplicate root directory.

Repository organization enforcement now runs in `npm run verify`. The CleanStack 4.1 amendment locates current domain-aware presentation separately from domain-blind primitives; feature contracts point inward to applications. This is an organization change under the owner's repository audit request, with no change to financial policy or the approval state of open product/integration decisions. Historical scaffold and deployment records above and below retain their original dates; consult current package scripts and the linked operation documents for present verification commands.

## FD-013 and FD-014: selected direction versus proposed protocol

Owner direction, recorded 2026-11-01: keep the financial data in the user's Google spreadsheet, use connected Apps Script functionality and recreate the interface in FolioDash managed through GitHub, avoiding a separate database service.

The [Google-backed architecture](google-sheets-backend.md) is the detailed amendment. Its credential correction is mandatory: Actions secrets may support controlled deployment but cannot be privately delivered to a static browser frontend. No per-user bank access through GitHub jobs or published data artifacts is adopted.

The proposed runtime route uses user Google OAuth and an Apps Script API executable. Central versus user-managed deployment, common Google Cloud project configuration, authorisation, scopes and real browser behaviour are unresolved implementation details, not automatic consequences of connecting a sheet. A click-by-click setup guide for the owner's synthetic proof, assuming the owner's own script and project and no shared deployment, is in [Google setup](../operations/google-setup.md); none of it has been performed. The first feasibility milestone is an authenticated synthetic read from the actual app origin, followed by a race/idempotency-tested synthetic commit. Do not claim a CORS/auth bypass, public export or execute-as-owner shared-secret endpoint as success.

This amendment changes storage/transport assumptions in the parent ADR and web contract. It does not change financial policies, approve a live migration, broaden retention, alter the original spreadsheet or authorise publication. No Google project, OAuth credential, Apps Script deployment or GitHub secret has been created by these documents.

## FD-015: lean repository root

FD-015 records the owner's instruction to keep the root clean and lean. It does not authorise moving/deleting the existing legacy scripts or private exports. Root tooling exceptions must be justified under FD-008 rather than hidden behind extra wrappers or duplicated configuration. Enforcement was implemented on 2026-11-04 as `npm run verify:repository`, with deliberate violation tests. See [Repository policy](../operations/repository-policy.md).

## FD-016: GitHub-to-Apps Script source sync

Owner direction, recorded 2026-11-01: Google Sheets stores the data, so FolioDash needs little Apps Script code, but the code it does need should be kept in sync with GitHub automatically instead of being copied by hand. This records the direction only. Nothing is installed, no repository or Google project is connected, and no credential exists. The owner confirmed later the same day that clasp is the wanted mechanism and that the repository should be hosted on GitHub. The repository was created on 2026-11-01 as a private repository, `AlbiDR/FolioDash`, holding the documents only. The legacy `App Scripts/` folder stays local and ignored until the FD-011 provenance review. clasp is installed and logged in on the owner's Mac with Google's default OAuth client. On 2026-11-01 the owner's own empty Apps Script project received synthetic test code (`src/interfaces/server/`, no financial logic) by manual `clasp push`, verified by pulling the files back. Whether that project is bound to a workbook is not yet confirmed. Later the same day the real service bundle (`npm run build:apps-script`, output `dist/apps-script/`) replaced that test code by a manual `clasp push` and was verified by pulling it back, byte-identical. Apps Script's file parser rejected BigInt literals (`10n`), although its runtime has BigInt, so shared code builds BigInt constants with `BigInt()` and the bundle check fails on any literal. clasp refuses a `rootDir` outside the folder holding `.clasp.json`, so the ignored link file lives in `dist/apps-script/`. The pushed code has no deployment and no API executable, so nobody can call it. Its `.clasp.json` is ignored. No workflow, CI credential or secret exists, and no deployment has been made.

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

## FD-017 and FD-018: direct Google storage and the device copy (owner decisions, 2026-11-01)

The owner chose, from the options offered, "direct to Google, no script" for new users, and "a plain copy in the browser plus a Forget this device button" for caching. In the owner's words the sheet is "maintained enough to complete the needed loop": it is the durable record, and the browser copy is only an accelerator.

What this decides:

- **Sign-in:** one Google sign-in with the `drive.file` permission, which Google lists as non-sensitive and recommended. It covers only files this app creates or the person opens with it. It needs no unverified-app warning, no per-person Cloud project and no script deployment.
- **The sheet:** the app creates the spreadsheet on first sign-in, tags it so it can be found again, keeps a hidden `ledger` tab in the checked row format already built, and keeps a readable tab up to date so the sheet is useful on its own.
- **The loop closes both ways:** a lost browser copy is rebuilt from the sheet; a lost or trashed sheet can be re-created from the device copy, only after the person confirms; a health check reports the sheet's integrity.
- **What stays the same:** the ledger rules, the append-only checksummed rows, the idempotent command ids, the stale-review check and fail-closed damaged-ledger handling.
- **What changes:** with no server lock, two simultaneous saves are guarded by a check immediately before the write, not by a lock. A save is sent as one request, so it is all or nothing; a lost response is resolved by reading the sheet, never by retrying blindly.

Not verified on real Google: that `drive.file` alone lets the Sheets API read and write a spreadsheet the app created (Google's scope list says so; no live test yet), that a file can be found again by its tag across devices, and that text written raw stays text. Each has a fallback or a fail-closed check, and the live proof is the gate for removing the Apps Script service.

Still open under FD-011 and the public-release gate: the licence, the history rewrite, and the decision to make the repository public and publish through GitHub Pages.

## FD-019: each month keeps its exact bank statement (owner decision, 2026-11-01)

The owner pointed out that the ledger holds only a distilled summary (each fund's value, net invested and the decisions), not enough to rebuild everything, and proposed storing the monthly bank export in the sheet. Quantity, price, exchange rate, average cost, the risk figure, the account line and the category subtotals were read and then discarded, so nothing could be re-derived, audited or extended for months already imported.

What this decides:

- **What is kept per month:** the bank sheet exactly as read (every cell, with the file's own number text and format), the sheet's name, the statement date, the command id and the decisions made (money in, money out, opening balances, comments). The cash decisions are not in the bank file, so they must be kept beside it.
- **Where, and how:** as `SOURCE` records in the existing checked row log, in the same single request as the month's ledger rows and its commit record, so a month is saved with its statement or not at all. A statement is split into pieces that each stay inside one cell and each carries a checksum; the revision's commit record covers them. Pieces from a save that never committed are ignored.
- **The owner's choice of a tab per month:** a readable tab named `Bank YYYY-MM-DD` is written from the stored statement right after a save. It is a view, rewritten freely, and its failure never affects the saved records. The exact copy is the checked record, not the tab, because a tab cannot be committed together with the ledger.
- **Proof:** a "Check my history" control replays each month with today's reader and rules and compares the result with the saved figures. It reads only. Months saved before statements were kept, or restored from a device copy, are counted as having no statement rather than called wrong.
- **Identifiers:** the statement is stored exactly as the bank wrote it, including the holder name and the contract and account numbers. They live only in the owner's private sheet and are never put in the device copy.

- **Months saved before this:** the owner's first live import saved 17 months with figures and decisions only. A history import from a file that carries the statements now attaches them to months already saved, in one new revision. The saved figures do not change: each statement must replay, with today's rules and the decisions given, to exactly the month already saved, or the whole request is refused. A month that already has its statement is refused too.
- **Quiet writes:** the readable summary and the monthly tabs are written once after a quiet moment, with the monthly tabs in one batch however many there are, so a run of saves stays under Google's write limit. What Google refuses waits for the next chance. The ledger tab is hidden after creation as well, because Google does not always honour "hidden" when a tab is created.

Verified in tests with a stand-in for Google, and on the owner's 17 real months locally: the ledger rebuilt from only the 17 stored statements and decisions is identical to the replayed ledger. Not verified on real Google.

### FD-019 follow-up: how the tabs in the person's sheet are laid out (owner request, 2026-11-01)

- **Typed alike, every month.** A `Bank YYYY-MM-DD` tab keeps the bank's positions but shows each column in one type and format whatever the month's file stored: dates as real dates (`dd/mm/yyyy`), quantities, prices (with their currency), rates, risk and euro amounts as numbers. Where the statement as a whole was read successfully, quantity, price and rate are the values that reading settled on, so a month whose file stored a quantity as a time still shows the real quantity. A cell with no single reading stays as the file wrote it. The exact statement stays in the ledger; these tabs are views.
- **One row and one column of margin, nothing beyond.** Every written tab is cut to its data plus one empty row and column on each side, with narrow margin columns; surplus rows and columns are deleted, as the earlier workbook's views did. The summary tab follows the same rule.
- **One batch.** All tabs are written in one `batchUpdate` (add, fit, reset, values, formats, widths), applied whole or not at all.
- **The ledger tab is the exception.** It is read from A1 by its stored format, so it has no top or left margin; only its unused columns are deleted. Its rows are never deleted by the app, because another device may be appending at that moment and a delete could take committed rows. New ledger tabs start with two rows and grow as rows are appended.
- **Rewriting existing tabs.** Your data has a "Tidy my sheet" action that rewrites the summary and every kept month from the ledger.
- **Not yet verified on real Google:** the format and resize requests are tested only against the stand-in.

## FD-021: reload persistence, freshness and competing saves (owner request, 2026-11-05)

Authority: the owner requested a more persistent Google connection, fresh Google-backed data and safer editing from two devices. This amends the memory-only token behavior in FD-017/FD-018 and the direct-writer concurrency limitation. It does not authorize cloud provisioning, a new scope, real-data migration or an indefinite login service.

Implementation contract:

- A short-lived access token may survive reload, bound to OAuth client, scope and workbook. It expires no later than Google's expiry minus the existing safety margin, capped at one hour. Invalid, expired, rejected and forgotten sessions are removed. Blocked storage falls back to memory. No refresh token or background consent popup is introduced. Forget this device removes it. **FD-022 (2026-11-07) supersedes where it is kept:** tab-scoped `sessionStorage` is now only the second choice after `localStorage`, so a new tab, a restart or the installed app still finds it.
- On startup, foreground, network reconnection and a bounded visible-page interval, reuse valid access to read the connected workbook. Never open OAuth from a timer, create workbooks in the background or submit drafts automatically. Pause automatic refresh while import/expense drafts are locked. Refresh portfolio and expenses, retain checked copies on failure, and expose checking, reconnect and offline states.
- Portfolio writes atomically create a deterministic named-range ID for the predecessor rows and append typed ledger rows in the same Sheets batch. Google documents duplicate named-range IDs as errors and atomic batch application. The marker is a single-use predecessor guard, not a client-side lock. A losing request is reconciled by reading, never blindly resubmitted. Existing checksum, stale-review and idempotency checks remain canonical.
- Markers refer to the ledger header and contain only a hash; they are not deleted by view maintenance. One marker is retained per attempted committed predecessor. Removing markers, unsupported manual edits or an old client that bypasses the guard defeats its coordination. Both devices must update. Read-back still validates the ledger; uncertain responses remain uncertain until the original command is found.
- Expense history already retains concurrent sibling corrections as explicit conflicts; refreshing must preserve pending outcomes and edited drafts. No automatic last-writer-wins merge is added.

Proof required: synthetic reload/expiry/storage denial and cross-client rejection tests; foreground/reconnect scheduling and cleanup; two writers stopped after the same final read; atomic batch rollback and lost-response reconciliation; existing financial and expense conflict tests; real Google synthetic race/read-back and supported-device acceptance. Local simulation does not prove Google's concurrency behavior. The marker mechanism is inferred from the documented [named-range ID uniqueness](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#addnamedrangerequest) and [atomic batch semantics](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate). Live proof remains required.

## FD-022: remembered Google connection (owner request, 2026-11-07)

```text
ID / title: FD-022 / Remembered Google connection
Status: accepted by owner request as the top priority; implemented locally; real Google renewal NOT verified
Decision owner / approval date: owner, 2026-11-07
Context and constraints: the owner reported that the Google connection never stays on and asks for sign-in every time. The requirement is that, unless the app's data is wiped, the person stays connected to their account.
Options considered: (1) keep tab-only access and ask again (the previous behavior); (2) the authorization code flow with refresh tokens, which needs a server-side exchange holding a client secret, so cloud provisioning and secret custody that this task does not authorise; (3) keep one-hour access on the device and renew it quietly, with the remembered account, on the person's next click (chosen).
Decision and rationale: Google gives a browser-only app a one-hour access token and no refresh token, and opens its sign-in window only from a user gesture (its token model guide). Nothing can renew access on a timer. FolioDash therefore renews on the next click, naming the remembered account so Google skips its chooser, and treats everything else as a recoverable, visible state.
Consequences and known limits: a quiet renewal still opens Google's window briefly on the first click after the hour. If Google no longer holds the person's session or grant, the person must sign in; that is Google's decision, not the app's. It is not silent background access.
Affected architecture sections and contracts: FD-021 token storage; Session and its sign-in port; Google identity adapter; app shell connection control.
Security/privacy and cost implications: the access token (at most one hour, drive.file only) and the account's email address (a sign-in hint) now persist in localStorage, readable by any script on this origin, as the device copy of the ledger already is. Forget this device removes both and revokes the token. No refresh token, secret, server, scope or cost is added. Google's identity script now also loads at startup when a connection is remembered; it is still never loaded for the signed-out demo.
Migration / rollback: the same storage keys are reused, so an existing tab session is read as before. Reverting restores tab-only storage; nothing needs migrating.
Proof required and current evidence: see "FD-022 evidence" in Google setup. Unit and synthetic checks pass; a real-browser check with Google's real script confirmed the sign-in window opens inside the click carrying the account hint. A completed real sign-in, silent auto-close, Android and installed-app behavior and multi-hour persistence are NOT RUN.
Revisit trigger / superseding decision: real-device evidence that renewal does not work; or authority to provision a token exchange (authorization code flow), which would remove the click-time window and supersede this.
```

The mechanism has five layers, each with its own tests:

1. **Remembered connection (primary).** Access and the account's email address are kept on the device (`localStorage`, then `sessionStorage`, then memory). A remembered connection loads Google's script and builds its token client at startup, so the first request starts inside the click with no network wait. The next click, when access is missing or has under ten minutes left, renews it quietly with `prompt: ""` and the remembered account. It never creates a workbook, never writes and never runs on a timer.
2. **Operation-aware freshness (pipeline).** A save reads, appends and reads back, so it needs eight minutes of access left. A shorter token is replaced first; if that fails the save is refused, never started. A token still valid keeps serving reads. A rejected token is discarded only if it is still the stored one.
3. **Cross-window coordination (pipeline).** A tab and the installed app share the stored access. A short-lived claim stops two windows opening competing Google windows; a window adopts newer access another stored; forgetting the device in one window is announced so none writes a credential back. A claim holds back only automatic renewals, never something the person chose.
4. **Renewal ladder (fallback).** A quiet attempt names the account. After two failures, or at once if the browser blocked the window or the person declined, quiet renewal stops and the person is asked. A requested attempt after a failure drops the possibly stale hint and shows Google's chooser. A failure that was only the network is forgiven when it returns.
5. **Always-reachable recovery (fallback).** When access is missing the status chip on every screen becomes a button whose own click is the gesture Google needs. Your data adds Use a different Google account. Storage degrades from `localStorage` to `sessionStorage` to memory instead of failing.

## FD-023: brand mark, the cut ring (owner direction, 2026-11-07)

```text
ID / title: FD-023 / Brand mark: the cut ring
Status: accepted by the owner after reviewing the rendered icon and banner; implemented; real-device appearance and similar-mark clearance NOT verified
Decision owner / approval date: owner, 2026-11-07
Context and constraints: the first icon, a rising line on a dark tile, was judged generic and homemade. The owner wants a mark with character that works both as an app icon and as a logo, and liked two of the drawn ideas: a ring and a dashboard grid. A letter monogram (an F) was drawn and rejected. The mark must keep its shape from 16 to 512 pixels, on light and dark backgrounds, and inside Android's maskable safe circle. The generator draws every file with no image library.
Options considered: (1) the rising trend line (the previous icon); (2) an F monogram (rejected by the owner); (3) six letter-free ideas drawn side by side: allocation ring, bento grid, exploded pie, stacked folios, ramp and gauge; (4) developed versions of the two the owner liked, plus a gradient sliced into tiles, which lost its shape once the tile was removed and was dropped; (5) a ring cut by a grid (chosen), shown with sharp corners and with corner radii of 8, 14 and 22 before settling on 10.
Decision and rationale: a portfolio ring, whose pieces are shares, cut by the straight gaps of a dashboard grid. The cross sits off-centre, so the four pieces differ in size and tone (white at full, 62% and 36% opacity), and the smallest is one amber spark. The ring says what the app is about, the grid says it is a dashboard, and the off-centre cut and the single spark give it a silhouette that survives without a background. Corners share one small radius so the mark matches the rounded tile. One set of numbers in scripts/generate-icons.ts draws the SVG, every PNG and the banner logo.
Consequences and known limits: the amber is the only warm colour in FolioDash's imagery and is not a UI token; it is not a warning state. The tonal steps need a single-ink variant for one-colour printing, which has not been drawn. No wordmark or lockup was designed; the interface typography is unchanged. No Android themed (monochrome) icon is provided. No trademark or similar-mark search was made, so the mark is not cleared for any use beyond this project.
Affected architecture sections and contracts: scripts/generate-icons.ts and its --check in verify:pwa; src/interfaces/web/public/icons/*; the social banner (its logo is embedded from icon.svg and its PNG regenerated); the README header and the app header image, which read icon.svg. The manifest and its colours are unchanged.
Security/privacy and cost implications: none. Static assets only, no external fonts, services or cost.
Migration / rollback: regenerate with the previous geometry from git history. An installed Android app updates its launcher icon on Chrome's own schedule, so a refreshed page does not prove the installed icon changed.
Proof required and current evidence: generate-icons --check passes in verify:pwa. In headless Chrome the SVG matched the 512 pixel PNG (mean difference 0.4 of 255 per channel, with larger differences only along antialiased edges). A circle mask of 80% of the canvas keeps the whole ring. The 48, 180, 192 and 512 pixel outputs were inspected. NOT RUN: a physical Android launcher, iOS home screen, installed-icon update, and any trademark search.
Revisit trigger / superseding decision: a similar-mark finding, a legibility defect on a real device, or the owner's direction. The aim is that the mark is not changed again.
```

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
