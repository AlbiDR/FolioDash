# FolioDash: CleanStack Architecture

Status: **Draft for owner review - not yet accepted**  
Decision type: Authoritative Design Reference (ADR)  
Created: 2026-11-01  
Scope: PWA, calculation kernel, import pipeline, private persistence, synchronisation and recovery

**2026-11-01 amendment - FD-013:** the owner selected GitHub-managed frontend delivery, a user-owned private Google workbook and Apps Script as the service/backend. [Google-backed architecture](google-sheets-backend.md) defines that direction and the still-unverified FD-014 runtime route. No separate database provider is required; GitHub secrets are not the browser's data connection. Remaining proposed rules below must be read with this amendment, not as a claim that any service is deployed.

## 1. Purpose and authority

FolioDash turns dated fund valuations and explicitly recorded cash movements into a clear personal portfolio history. It is a proposed successor to the working Google Sheets application, not a destructive rewrite of that application.

This document is the canonical architecture proposal. The decision register records what is approved, proposed or unresolved; the web quality contract defines how user-visible requirements are proven. Normative words below describe the required implementation **if this draft is accepted**, not controls that already exist.

Changes to financial definitions, dependency direction, privacy boundaries, write authority or retention require an explicit amendment before implementation. Styling changes do not get to change accounting.

## 2. Product boundary

The first product targets one user's fund portfolio with a guided Excel import, portfolio overview, fund comparison, individual-fund history, corrections and complete backup/restore. The same account is intended to work on Mac and Android through one responsive, installable web application.

Normal use must be self-contained: no AI, Apps Script editor, code changes, hidden-table maintenance, terminal command or manual recalculation is required.

The candidate history model accepts multiple **dated** observations per month. A monthly dashboard is a projection over that history, not a one-record-per-month storage limitation. Exact rules are in section 5 and decision FD-006.

Out of initial scope:

- Bank credentials, scraping, automated bank access and trading.
- Investment advice, forecasts, live market prices and automatic fund-switch recommendations.
- Offline financial writes or automatic background submission of paused imports.
- Shared portfolio editing, multiple currencies and a generic multi-bank parser before needed.
- Automatically uploading original statements or publishing the personal portfolio.

There is no affiliation with or endorsement by a bank, fund manager or hosting provider.

## 3. Architectural principles

1. **KISS and YAGNI:** implement the smallest system that satisfies current invariants; no speculative services or empty directory hierarchy.
2. **Single source of truth:** one canonical implementation per financial rule; one owner for each document, token, schema and state transition.
3. **Pure kernel:** financial types and calculations do not depend on UI frameworks, browsers, networks, storage, locale APIs or cloud SDKs.
4. **Single responsibility and dependency inversion:** application use cases depend on narrow ports; external adapters implement them.
5. **Least astonishment:** preview and save describe the same reviewed information; failed charts cannot invalidate an already-saved statement.
6. **Fail closed:** uncertain ownership, invalid money, contradictory evidence or ambiguous save status stops further financial writes.
7. **Evidence over assertion:** unit tests, simulated browser checks and live-device checks prove different things. An unrun gate remains unrun.
8. **Mistake-proofing:** prevent duplicate commits and unsafe state transitions structurally rather than rely on warning text.
9. **Proportionate dependencies:** every production dependency has a purpose, maintenance/security review and licence check. Necessary parsing/chart libraries are not forbidden merely to claim zero dependencies.
10. **Explicit policy:** mathematical identities, versioned financial definitions, display tokens and operational limits are different categories. Financial formulas do not self-calibrate against portfolio performance. Limits and visual margins are named and tested, not scattered literals.

Git is authoritative for code and schema, **not a store of the user's financial records**. The committed ledger in the user's private Google workbook is authoritative for confirmed financial facts; caches, charts and dashboard values are projections. Bank tabs alone cannot reconstruct cash movements and opening capital.

## 4. Structural architecture

This is a target map, not an instruction to create empty folders now:

```text
src/
  core/                    Pure domain values, lifecycle and calculation policies
  applications/            Use cases, ports and typed outcomes
  adapters/                XLSX, persistence, auth, cache, clocks and cryptography
  interfaces/
    web/
      app/                 Routes, shell and composition root
      features/            Import, overview, funds, history and recovery interfaces
      shared/              Domain-blind UI primitives and design tokens
      presentation/        Financial display, charts and privacy presentation
    server/                Apps Script API handlers and server composition root
tests/                     Contract, integration and end-to-end tests
scripts/                   Build and verification tooling only
config/                    Tool/deployment configuration when explicit paths are supported
migrations/                Versioned Google workbook schema/policy migrations
public/                    Public application assets only
docs/                      Design authority, decisions and verification contracts
```

Use one dependency manifest and one lockfile initially. A monorepo/package catalogue requires a demonstrated packaging need; it is not created to imitate another project. Google-backed storage/service is selected; framework, authenticated deployment route, build tooling and package-manager choices remain open.

### 4.1 Dependency law

```yaml
# @machine-readable: architecture-isolation
# Import directions enforced by npm run verify:repository; runtime purity also needs review and tests.
layers:
  - id: core
    allowed_imports: []
    forbidden_runtime_apis: [dom, node, network, storage, cloud-sdk, locale]
  - id: applications
    allowed_imports: [core]
    dependency_access: ports-only
  - id: adapters
    allowed_imports: [applications, core]
    role: port-implementation
  - id: interfaces/web/shared
    allowed_imports: []
    role: domain-blind-ui-and-tokens
  - id: interfaces/web/presentation
    allowed_imports: [applications, core, interfaces/web/shared]
    role: domain-aware-display-without-infrastructure
  - id: interfaces/web/features
    allowed_imports: [applications, core, interfaces/web/shared, interfaces/web/presentation]
    forbidden_imports: [adapters, interfaces/server, other-web-features]
  - id: interfaces/web/app
    allowed_imports: [applications, core, adapters, interfaces/web/shared, interfaces/web/presentation, interfaces/web/features]
    role: composition-root
  - id: interfaces/server
    allowed_imports: [applications, core, adapters]
    forbidden_imports: [interfaces/web]
    role: composition-root
```

An eventual TypeScript/framework import checker must translate these semantic rules into real path checks, including relative imports and barrel re-exports. UI/framework imports are allowed in web interfaces, not in the kernel. The dedicated web service-worker area imports only within itself. The app must not import server code or Apps Script adapters. Adapter directories may not become a way to bypass narrower environment capabilities; the browser build must exclude server adapters and secrets.

Features never import another feature's components, stores or private state. Shared business behavior belongs in the kernel/use cases; shared visual behavior belongs in the UI primitives. Only the composition root wires concrete infrastructure into feature use cases.

2026-11-04 organization amendment: existing financial chart widgets and amount privacy presentation live in `interfaces/web/presentation`, because they consume domain values and formatting. `shared` remains domain-blind. Overview-specific data selection and chart ranges belong to the overview feature; account age text belongs to account. Cross-workflow import and session contracts live in `applications`. This changes dependency ownership, not accounting, privacy policy or write authority. The implementation and enforcement limits are recorded in [Repository policy](../operations/repository-policy.md). Concrete browser identity and storage adapters live in `adapters/browser`, with browser compiler capabilities; they do not belong in the app composition root or the pure-runtime compilation. Transitive browser/server isolation is checked through intermediate adapters as well as direct imports.

There is one calculation kernel and one versioned policy, not separate web/server formula implementations. The Google-backed direction uses readable private workbook records and Apps Script financial validation; it does not claim FolioDash E2EE. Cross-runtime browser/Apps Script builds must preserve the same kernel semantics. An E2EE variant would require a new decision and a different validation contract.

### 4.2 State ownership

- Component state owns temporary interaction details, not confirmed financial facts.
- Feature state owns a bounded workflow, never another feature's private state.
- Application state exposes the coherent account/portfolio revision and use-case outcomes.
- Infrastructure state owns connection, session, cache and update lifecycle.
- The private ledger owns confirmed records. No global UI store is a second ledger.

Queries do not perform hidden financial mutations. Commands are explicit and may return an acknowledgement, committed revision or typed failure; command/query separation does not forbid a safe commit receipt.

### 4.3 Lean root contract

The repository root is the project's entry/control surface, not a general storage directory. A file does not belong there merely because it affects the whole application. The owner's root-minimality direction is recorded in FD-015; the concrete allowlist below is a proposed implementation contract.

**Present foundation:** `README.md`, `AGENTS.md`, `.gitignore` and `docs/`. Create other paths only when they contain a current, justified responsibility.

| Content | Canonical home | Root rule |
|---|---|---|
| Project introduction and contribution/architecture pointers | `README.md` | Keep short; do not duplicate architecture documents |
| Agent working agreement | `AGENTS.md` | Root discovery entry; point to canonical policy |
| Repository ignore policy | `.gitignore` | Root discovery entry; not a security guarantee |
| Product, architecture, decisions and operations documents | `docs/` | No additional root-level planning/audit/design Markdown files |
| Financial/application/UI/server source | `src/` layers | No loose `.ts`, `.js`, `.gs` or parallel legacy source trees at root |
| Cross-layer tests and synthetic fixtures | `tests/` | Unit tests remain adjacent to their subject under the naming contract |
| Executable development/build/verification utilities | `scripts/` | No ad hoc root shell/Node/Python scripts |
| Tool/deployment settings | `config/` | Prefer explicit config paths when supported without breaking tooling |
| Workbook schema/policy migrations | `migrations/` | No root migration dumps or one-time fix scripts |
| Public passthrough assets | `public/` | No loose icons, logos, screenshots or manifest copies at root |
| Repository-host-required metadata | `.github/` | Only when actually needed; no duplicated policy documents |

**Justified root exceptions, only after the relevant tool/policy is selected:**

- One dependency manifest and the chosen package manager's single lockfile.
- A conventional HTML entry point, compiler configuration or build-tool configuration when root discovery is required or a root location is materially simpler/more reliable than an override.
- `LICENSE` after licensing is chosen; `CHANGELOG.md` once actual releases need it.
- A non-secret environment example only where the chosen setup genuinely needs it. Actual local environment files remain ignored and are not project source.

Record each tooling exception, owner and reason in the eventual tool configuration decision (FD-008). A necessary `index.html` or `tsconfig.json` is not architectural clutter. Do not add forwarding wrappers, duplicate configuration, extra build steps or broken default discovery merely to move a file out of sight. Prefer tool-supported explicit paths; keep an unavoidable root configuration narrow.

Forbidden root material includes TODO/PLAN/NOTES/FIX/FINAL documents, unreviewed dumps, archived versions, ZIP bundles, copied bank exports, generated screenshots, experiment scripts and a second implementation left beside the canonical source. Private financial files belong outside the repository regardless of visibility or ignore status. A hidden folder is not a privacy boundary.

Build output (`dist/`, `build/`), dependencies, caches and test reports may be generated locally under the chosen tool contract, but are ignored artifacts, not tracked architecture directories. Their existence does not justify committing output or creating empty placeholder folders.

**Current user-supplied material:** `App Scripts/` and `.Montly Exports/` were present when this policy was drafted. They are preserved, not adopted as canonical source and not silently moved, deleted or published. A separately authorised inventory must classify the legacy scripts before porting/archive placement; private exports should be relocated outside the repository only with the owner's approval. Existing ignore guards remain defence in depth, not evidence that sensitive contents were audited.

Before source implementation, add a root-policy check that inspects tracked paths and rejects new unapproved root entries or committed generated/private artifacts. Test the check with both a deliberate violation and legitimate tooling exceptions. Inspect ignored/untracked local material separately before publication; a passing tracked-file check cannot certify its confidentiality. Implemented 2026-11-04 as `npm run verify:repository`, including deliberate violation tests; see [Repository policy](../operations/repository-policy.md).

## 5. Financial and temporal contract

### 5.1 Identity, money and dates

- Identity is the validated ISIN within an account/portfolio, never row position or display name.
- A closed fund remains in historical records. Absence from an extract is not proof of sale.
- Persist EUR money as exact integer cents, with checked arithmetic and explicit bounds. Do not use binary floating-point for stored cash amounts.
- Rates are calculated ratios with explicit denominator validity and finite-result checks. Unknown is not zero. A UI dash represents an unavailable result, not a persisted number.
- Preserve actual statement dates as date-only ISO values. Store import/commit timestamps separately as instants. Do not silently use import time as valuation time or shift dates through time-zone conversion.
- One canonical locale boundary parses Italian manual amounts. The bank adapter validates its own supported numeric representations. Formatting never changes stored values.

### 5.2 Separate observations from movements

The proposed model distinguishes funds, valuation snapshots, opening balances, cash movements, import evidence and revisions. Reporting reads those facts; it does not infer missing contributions from price changes.

- Net invested = explicit opening net invested + subsequent money in - full money out.
- Euro gain = fund value - net invested; portfolio gain includes retained results from closed funds.
- Interval gain = change in euro gain, with recorded cash handled separately through net invested.
- Withdrawals record full proceeds, not merely profit. Switches record both gross sides even when net cash is zero.
- Bank market value and fiscal acquisition cost are not substitutes for opening net invested.
- Cash movements have either a known actual date or an explicit interval with unknown exact timing. Do not invent dates or silently allocate an uncertain interval when a new intermediate snapshot is added.
- A movement has stable identity and can be counted only once. Interval provenance and allocations cannot cause duplication across reports.
- A first observation does not manufacture a return for the period before it. Closure/reopening retains euro history and explicitly separates comparable holding episodes.

Multiple snapshots do not turn estimated cash-timing percentages into TWR, IRR or annualised returns. Any new return methodology needs its own decision, required input evidence and independent examples.

### 5.3 Reporting policy

The candidate policy is one coherent snapshot per valuation date; a different observation on that date requires an explicit revision, not an automatic second record. Intraday observations are not initially supported.

Monthly reporting chooses the latest recorded snapshot in each month. It must distinguish an in-progress/as-of month from a true month-end valuation. Actual dates remain discoverable. Charts use real date spacing, not equally spaced categorical labels that imply equal elapsed time.

MoM compares selected monthly observations; change since previous snapshot is a separate metric. Monthly averages do not weight a month more heavily because it has more snapshots. Missing comparable months stay unavailable unless a separately approved method supports them.

YtD/YoY baseline selection and the percentage denominator are versioned policies, not incidental array searches. The Sheets project's January-snapshot YtD is **not** a 1 January calendar-year return. Preserve and label that baseline during parity work; adopting conventional calendar-year or nearest-date policies requires FD-007 approval and an explicit transition. Never silently relabel an interval estimate as an annual return.

The opening technical test set must include hand-calculated cash-flow examples independently of migrated Sheets outputs. Known historical mistakes are not canonised merely because a legacy export contains them.

## 6. Import and validation boundary

### 6.1 Read, review, commit

The proposed path is:

```text
User-selected XLSX
  -> bounded local parsing
  -> validated candidate observations and provenance
  -> review date, identities, totals, lifecycle and cash inputs
  -> explicit confirmation against a known portfolio revision
  -> authorised atomic commit
  -> verified commit receipt
  -> rebuildable views and synchronised devices
```

Client validation provides usable feedback; it is not an authorisation boundary. Apps Script validates shape, caller/workbook authorisation, expected revision and financial semantics before publishing a commit. No browser secret or client-selected owner field substitutes for that boundary.

Every external value crosses validation and mapping before the kernel: files, API responses, restored backups, local caches, routes and user input. Type declarations alone do not validate runtime input.

### 6.2 File safety and evidence

- Support a named, versioned Fideuram XLSX layout first. Unsupported input fails clearly rather than being guessed into a valid portfolio.
- Set measured limits for compressed/uncompressed file size, rows, sheets and parsing time. Parse heavy files outside the main UI thread when measurements justify it; do not upload more data solely to move computation off-device.
- Do not execute macros, spreadsheet formulas, external links or active content. Formula-valued financial cells need an explicit supported policy; otherwise reject them.
- Reconcile fund rows to the funds-only subtotal. Account cash and unused personal identifiers are excluded from the candidate model.
- Preserve missing, empty and numeric zero as distinct states where they carry financial meaning. Validate ISIN checksums, duplicates, negative/overflow money and subtotal mismatches.
- Hash original file bytes without rewriting the file. If a semantic fingerprint is also used, version its canonicalisation independently of display formats and source-file hashing.
- A checksum proves equality to recorded bytes/values, not bank authenticity or ownership. Never treat a filename's recognised date as proof without user review.
- Google-native bank import tabs are part of the selected storage direction. FD-004 still decides precisely which source fields are retained and whether full original XLSX bytes are archived in Drive; a converted tab is not a byte-identical source backup. A hash cannot reconstruct a lost source file.
- Retain only the approved extracted evidence and provenance. Reconstructed historical statements remain labelled reconstructed; they do not become bank-issued originals.

### 6.3 Explicit consent

Preview is non-mutating. Choosing a file, recognising its name or calculating a preview does not save financial history. A coherent review ends with one clear confirmation; it should not require a second hidden-menu save.

New identities, missing funds, reopening, opening capital and movements must be handled inside that same understandable workflow. Do not guess missing financial facts to avoid asking a necessary question.

## 7. Transactional integrity and cross-device consistency

The ledger is a versioned, coherent set of committed facts in the user's Google workbook. Sheets does not provide a general multi-request database transaction: the Apps Script protocol must prove atomic publication of complete revisions, partial-write handling, lock scope and command reconciliation. [Google-backed commit protocol](google-sheets-backend.md#7-commit-publication-and-concurrent-access) owns this implementation contract.

Every mutating command carries a unique idempotency key and expected portfolio revision. Owner identity comes from the authenticated Google execution context, not a trusted client-provided owner field. The service checks ownership/revision, stages the complete statement/movements/evidence payload, and publishes only a verifiably complete financial revision. Unsupported external workbook edits are not covered by script locks and must be detected rather than assumed safe.

- An identical retried command returns the same outcome without another financial write.
- Reusing a key with a different payload is rejected.
- Duplicate file and same-date checks are account/portfolio-scoped and race-safe, not browser-only checks.
- A conflicting second device gets an actionable stale-review outcome; no silent last-write-wins.
- After an ambiguous timeout, query the command outcome before any retry. Do not assume failure means no commit.
- Show success only after authoritative acknowledgement/reconciliation. A chart or synchronisation failure after commit says **saved; view needs attention**, not **import failed; try again**.
- Retries, deadlines and file sizes have named, bounded configuration. Retry only an operation with a known safe protocol.

Corrections supersede a prior revision and preserve its provenance. An earlier-history correction or backfill must replay/revalidate affected balances and lifecycle transitions and show the impact before committing. Do not claim arbitrary backfill support until that path passes its own release gate.

An account/portfolio deletion is different from a correction. Deletion removes user-controlled active records and device caches according to an approved retention policy; backup expiry and non-financial operational records are disclosed. A closed fund is never automatically pruned as stale application data.

## 8. Privacy, authentication and storage

FD-013 selects user-owned Google Sheets and Apps Script. FD-003 records the privacy consequences: the workbook is readable to authorised Google/application execution, not FolioDash E2EE. FD-005/FD-014 still block real-data integration until caller identity, scopes, deployment ownership and browser connectivity are proven. No independent database provider is introduced by this amendment.

In this model:

- The repository, CI, builds and public demonstrations contain synthetic data only. Ignore rules do not replace secret/content scanning.
- Public application code and private financial data remain separate. Frontend filtering, an obscure URL and a private repository are not access control.
- Every financial read/write enforces authenticated ownership at the trusted server/database boundary. Two accounts must be unable to read, infer or mutate each other's records by changing IDs.
- Administrative credentials and encryption secrets are never embedded in the browser build. Authentication/session ownership, revocation, expiry and recovery must be explicitly designed in FD-005; no custom password cryptography.
- Use encrypted transport and selected-provider storage protections, with their real administrative-access limits disclosed. Standard at-rest encryption is not described as end-to-end encryption.
- No analytics, advertising, session replay, general CDN runtime code or third-party error payloads containing financial data by default. A Google-hosted identity loader, if required, is an explicit reviewed auth/CSP exception, not a general third-party-script allowance.
- Redact logs and support exports. Do not log statements, balances, file contents, filenames containing account details, tokens or full request bodies.
- Prefer one isolated application origin; define production, preview and synthetic-demo boundaries before deployment. A personal dataset must never be used to seed preview builds.
- Verify hosting cost/limits and data location before adoption; a free tier is not a permanent availability, privacy or compliance guarantee.

An E2EE variant requires a superseding storage/validation decision plus documented key creation, device enrolment, recovery, rotation, lost-device revocation and encrypted migrations. The current Sheets direction does not provide it. Authorised Apps Script/frontend code still processes user data; user ownership and a private repository do not make compromised code harmless.

## 9. Offline and PWA lifecycle

The proposal allows offline **viewing** of an explicitly downloaded account-scoped cache, not offline financial writes. The user's committed Google workbook ledger is authoritative. Cached records show last synchronisation and revision; no stale cache is presented as a freshly confirmed portfolio. Live means fresh authorised revision reads on defined events, not guaranteed push updates or automatic acceptance of unreviewed bank-tab edits.

Device caching of sensitive records is a disclosed policy, not an install side effect. Signing out/account switching clears account-owned memory and persistent caches before another account can see them. Browser storage can be removed and is never the only backup.

The service worker caches versioned public app assets. It must not indiscriminately cache authenticated API responses, tokens, source documents or financial exports. A compatible explicit data-cache adapter owns approved offline records.

An available update must not discard an unsaved import, mix incompatible schemas or force a reload during confirmation. Cache/database upgrades are versioned, recoverable and tested; invalid cache is quarantined/reloaded from authority, not silently promoted. Offline account revocation cannot be guaranteed instantaneous; the device privacy implications must be disclosed.

## 10. Backup, restore and migration

Synchronisation, revision history and disaster-recovery backups are separate capabilities.

- Provide a complete, versioned machine-readable export plus human-readable financial tables. Include policy versions, provenance and explicit exclusions such as locally retained original documents.
- Protect portable financial backups appropriately; FD-003/FD-009 decide encryption, key recovery and provider retention. Never imply that a plaintext download is encrypted.
- Restore validates format, integrity and financial invariants, previews its effect and commits atomically with a recoverable prior revision. It never silently merges duplicate movements or overwrites another account.
- Provider backups require a tested recovery process and documented recovery-point/recovery-time targets before release. Merely enabling a backup setting is not a restore test.
- Account deletion documents live-data deletion and finite backup-retention behaviour; do not promise immediate deletion of every provider copy without evidence.
- Sheets migration is read-only against the original workbook. Preserve dates, cash provenance, lifecycle and reporting policy; explicitly flag reconstructed/unverified facts.
- Compare migrated results to independently understood cases and the established workbook, report differences and get approval before adopting the new system. No manual re-entry of all historical statements as the default migration path.

No production dataset is copied into repository fixtures to simplify migration testing.

## 11. Interface, visual and error contracts

The detailed acceptance home is `../operations/web-quality.md`.

- One token system owns type, spacing, colour, radii, motion and chart styling. Components consume semantic tokens; they do not invent local visual scales.
- One term per concept. Default UI and documentation are English; default financial formatting is Italian/EUR. Locale and language are independent. Do not inherit Relay's Italian-only copy rule.
- Keep the navy/blue direction and neutral capital/value styling. Performance meaning uses signs and labels, not colour alone. Fund-comparison colours identify funds, not winners/losers.
- A consistent responsive outer inset replaces the spreadsheet's literal 25px grid buffer; do not reproduce cell mechanics in a web layout.
- Custom icons use one accessible SVG primitive. No decorative emoji or icon-library dependency by default. Apply non-scaling stroke where relevant to stroked paths, not as a substitute for accessible names.
- Charts are projections through one renderer adapter, not a second calculation engine. Missing points remain gaps; zero is not missing; timestamps are genuinely spaced; all plotted series inform bounds.
- Auto-scaled axes disclose their scale. Chart line steepness is not a cross-fund return comparison. Logarithmic display is not a global default and cannot hide non-positive financial values.
- Chart-source values and bounds must be checked independently. A DOM screenshot approximation does not prove the live chart rendered.
- Initial setup is guided and minimal; no giant maintenance menu. Every core operation works with keyboard and touch and exposes the next useful action.
- Errors are typed, complete, wrapping, selectable and safely copyable. They preserve the draft and state whether a financial save occurred, did not occur or is still being reconciled.

## 12. Conventions and governance

Use English source, comments, docs and commit messages. Directories and Markdown documents use `kebab-case`; `README.md`, `AGENTS.md` and established ecosystem filenames are explicit exceptions. Domain/UI type files use `PascalCase` when a typed-language stack is adopted; functions and variables use `camelCase`; named constants use `UPPER_SNAKE_CASE`; SQL objects, if used, follow one documented `snake_case` policy. Name by domain and role, not `misc`, `helpers2`, `final` or `new-version`.

Tests use one documented adjacent `<Subject>.test.*` convention for module tests and `tests/` for cross-layer contracts. Feature public APIs are explicit; private imports and re-export bypasses are forbidden. Avoid barrel cycles and a new wrapper/interface for every function.

Schema changes are ordered reviewed migrations in source, with reproducible application and drift checks. Untracked dashboard edits are not a schema deployment strategy. Do not rewrite applied migration history.

Choose the runtime, package manager and test tools through FD-008 before scaffolding. Centralise versions, keep one lockfile, remove unused dependencies and build only the required environment surfaces. A framework-specific rule is not smuggled into the pure kernel.

Adopt Conventional Commits, Semantic Versioning for releases and a curated changelog once implementation starts. Licensing and source headers require FD-011; no licence is inherited by copying another project's header. Reusing legacy source requires a licence/provenance review.

A defect report distinguishes confirmed root cause from hypothesis. A fix includes prevention for the failure class and a regression test when feasible. Never waive a failed release gate or weaken validation to ship a cosmetic repair. Import and root-policy enforcement is executable and tested with deliberate violations; this does not prove every architecture or runtime invariant.

## 13. Proof obligations and release gates

Required categories before the corresponding capability is called supported:

1. **Kernel:** independent examples/properties for exact cents, flows versus gains, lifecycle, missing data, temporal baselines, monthly selection, arithmetic bounds and deterministic replay.
2. **Parsing:** synthetic supported exports, optional blanks, date/text differences, European separators, invalid identifiers/subtotals, duplicate rows, unsupported/formula files and bounded hostile XLSX inputs.
3. **Commit:** idempotency, stale previews, two-device races, commit timeouts, lost acknowledgements, corrections, failed-before/after-commit stages and atomic recovery.
4. **Security/privacy:** real authorisation policy tests across two accounts; forbidden upload/log/build payload checks; logout/cache isolation; session-expiry, deletion and recovery tests.
5. **PWA/browser:** real rendered charts and source values, install/update lifecycle, local-file import, responsive keyboard/touch flows, offline status and no offline mutation in supported engines.
6. **Recovery/migration:** full export/restore, damaged backup rejection, declared evidence omissions and read-only Sheets parity with explicit exception reporting.
7. **Deployment:** exact verified build revision, headers/caching boundaries, private API denial from unauthenticated and wrong-account requests, and real Mac/Android journeys with synthetic financial data.

Each gate reports PASS, FAIL or BLOCKED/NOT RUN, with revision, environment, method and evidence. Syntax checks and mocked charts cannot satisfy actual renderer gates. Tools must not invent measurements or report unavailable manual checks as successful.

The first implementation supplies reproducible dependency installation, type checks if applicable, lint, dependency-boundary tests, unit/contract tests, production build, privacy/artifact scanning and browser journeys. `npm run verify` now covers repository boundaries, types, lint, unit/contract tests and production/PWA/Apps Script builds. Content/privacy scanning and full browser/live acceptance remain separate incomplete gates. Required failures block integration/deployment; a documented failure is still a failure.

## 14. Forbidden paths

1. Treating a row, alias or filename as financial identity or authenticity.
2. Deriving opening capital or unrecorded movements from market value.
3. Double-counting interval cash flows after a more granular import.
4. Treating a missing fund as sold, or pruning a closed fund's history.
5. Using display formatting or rewritten workbook cells as an unstable evidence fingerprint.
6. Blindly replaying an ambiguously completed save or letting two devices silently overwrite each other.
7. Calling a failed chart a failed financial commit or inviting an already-saved month to be reimported.
8. Using browser caches, chart series or editable UI state as the financial ledger.
9. Accepting client owner IDs as authorisation or using a public frontend secret.
10. Uploading original documents/identifiers or enabling telemetry outside the approved data policy.
11. Claiming end-to-end encryption, permanent backups, instant deletion, precision or compliance without proof.
12. Queuing offline financial writes or forcing an update through an unsaved review.
13. Duplicating financial formulas in components, SQL reports or chart callbacks.
14. Implicitly changing YtD/YoY definitions while migrating or redesigning.
15. Treating a synthetic screenshot, a coverage percentage or a mock API pass as live production verification.
16. Publishing or provisioning infrastructure on the strength of a draft design alone.

## 15. Initial sequence and alternatives

1. Review the Google-backed amendment and settle source-retention/auth/deployment details (FD-004, FD-005, FD-008, FD-014), plus FD-007 accounting policy, before security-dependent implementation. Prove the actual Google browser route with a synthetic workbook first.
2. Establish minimal repository controls and executable boundary/privacy gates, without copying personal data.
3. Specify and test the pure financial model and versioned reporting policies with independent synthetic examples.
4. Define the import/review/commit protocol and implement a fully bounded synthetic XLSX vertical slice.
5. Add approved private persistence, authenticated ownership and tested revision/idempotency semantics.
6. Deliver the three views and real chart tests; then add account-scoped offline viewing and install/update tests.
7. Prove backup/restore and a read-only migration; validate Mac-to-Android synchronisation on a deployed synthetic account.
8. Only after explicit approval, migrate real data privately while preserving the working spreadsheet and a tested rollback path.

Alternatives not selected by this proposal: continuing to expand Apps Script UI workarounds; separate native Mac/Android implementations; browser-only storage as the sole cross-device ledger; public static JSON as portfolio storage; blanket offline write queues; and a large service/monorepo platform before a working vertical slice.

FD-013 replaces the earlier provider-neutral cloud proposal with Google-backed storage/service. E2EE would require an explicit different design; the exact runtime connection remains proposed under FD-014. The document is not a deployment authorisation.
