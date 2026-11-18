# FolioDash architecture (CleanStack)

| | |
|---|---|
| **Status** | **Revision 2026-11-18, awaiting owner acceptance.** It replaces the draft of 2026-11-01. Section 15 states which decisions the owner has already made. Nothing here authorises provisioning, publication, real-data migration or licensing. |
| **Type** | Authoritative Design Reference (ADR): the one place that states what FolioDash is, how it is built and the standards every change must keep |
| **Scope** | The PWA, the calculation kernel, import, private persistence, synchronisation, recovery, the repository and the engineering standards |
| **Decisions** | `FD-nnn` identifiers refer to the owner's private decision register |
| **Map** | [Documentation map](../README.md) lists the subordinate documents; the [repository map](repository-map.md) shows the real folders and layer imports |

## 0. How to use this document

- **Normative words.** MUST, MUST NOT and SHOULD carry their usual force. Text without them describes the current state.
- **Rule IDs.** Every rule starts with a permanent ID such as `PRN-3` or `FIN-12`. Cite rules by ID, never by position or paraphrase. An ID is never renumbered or reused: a withdrawn rule keeps its ID and is marked **Withdrawn**. `npm run verify:docs` fails when an ID is duplicated, skipped or cited anywhere without being defined here.
- **Section numbers are stable.** Other documents cite "CleanStack section 5.2". A section is added at the end of its level, never inserted, and `npm run verify:docs` checks every such citation.
- **State words.** Decided means the owner decided it. Implemented means it is in reviewed source. Verified means a named check passed with evidence. Open means undecided or unproven. The [documentation map](../README.md) defines the same vocabulary. Nothing is called Verified without the named check.
- **Precedence.** This document outranks the subordinate documents, which outrank code comments. A conflict is a defect in the lower one and is fixed by amending upward first.
- **Amendment.** A change to a financial definition, the dependency law, a privacy boundary, write authority, retention or the engineering standards needs the owner's approval and is recorded in section 16 in the same commit as the change.

## 1. Purpose

FolioDash turns dated fund valuations and explicitly recorded cash movements into a clear personal portfolio history, with a work-expenses tracker and value-only checkpoints beside it. It is the successor to the owner's working Google Sheets application and never modifies that application.

## 2. Product boundary

- **SCO-1** The product serves one person's fund portfolio, on Mac and Android, through one responsive installable web application.
- **SCO-2** Normal use is self-contained: it MUST NOT require AI, the Apps Script editor, a code change, hidden-table maintenance, a terminal command or a manual recalculation.
- **SCO-3** History accepts multiple dated observations per month. A monthly dashboard is a projection over that history, not a one-record-per-month storage limit (FD-006, section 5).
- **SCO-4** Out of scope: bank credentials, scraping, automated bank access and trading; investment advice, forecasts, live market prices and automatic fund-switch recommendations; offline financial writes and background submission of paused imports; shared editing, multiple currencies and a generic multi-bank parser before they are needed; publishing the personal portfolio.
- **SCO-5** The exact bank statement as read leaves the device only into the person's own workbook (FD-019). Archiving original XLSX bytes in Drive is Open (FD-004).
- **SCO-6** There is no affiliation with, or endorsement by, a bank, a fund manager or a hosting provider.

## 3. Architectural principles

The principles are the owner's wording and are not edited by revisions of this document.

1. **PRN-1 KISS and YAGNI:** implement the smallest system that satisfies current invariants; no speculative services, over-engineered backend wrappers, or empty directory hierarchy.
2. **PRN-2 Single source of truth:** one canonical implementation per financial rule and calculation; one owner for each document, token, schema, and state transition.
3. **PRN-3 Pure kernel:** financial types, calculations, and parsing logic do not depend on UI frameworks, browsers, networks, storage, locale APIs, or cloud SDKs.
4. **PRN-4 Single responsibility and dependency inversion:** application use cases depend on narrow ports; external adapters and UI components implement them.
5. **PRN-5 Parse, don't validate:** raw inputs from bank exports, manual forms, and Google workbook reads are parsed at the adapter boundary into strict domain types where invalid financial states are unrepresentable.
6. **PRN-6 Fail closed:** uncertain ownership, invalid money, contradictory evidence, or ambiguous save status stops further financial writes and UI commits.
7. **PRN-7 Least astonishment:** preview and save describe the exact same reviewed information; failed charts or rendering errors cannot invalidate an already-saved statement.
8. **PRN-8 Mistake-proofing:** prevent duplicate commits, race conditions, and unsafe state transitions structurally through strict typing and state checks rather than relying on warning text.
9. **PRN-9 Idempotency and determinism:** statement imports, ledger writes, and remote sync operations are deterministic and idempotent; re-running an import or retrying an interrupted network sync produces zero duplicate mutations.
10. **PRN-10 Immutable ledger facts:** confirmed historical financial entries are append-only; adjustments and corrections are modeled as explicit compensating transactions rather than silent in-place edits.
11. **PRN-11 Explicit policy:** mathematical identities, versioned financial definitions, display tokens, and operational limits are different categories. Financial formulas do not self-calibrate against portfolio performance. Limits and visual margins are named and tested, not scattered literals.
12. **PRN-12 Offline-first and sync clarity:** as a static PWA hosted on GitHub Pages, the application maintains zero trust in ephemeral client storage - all invariants execute locally within the pure kernel before sync. Cached projections remain readable offline, while authentication expiry, stale cache timestamps, and uncommitted local drafts are surfaced explicitly so they are never mistaken for authoritative ledger commits.
13. **PRN-13 Evidence over assertion:** unit tests, simulated browser checks, and live-device checks prove different things. An unrun gate remains unrun.
14. **PRN-14 Proportionate dependencies:** every production dependency has a purpose, maintenance/security review, and licence check. Necessary parsing and chart libraries are not forbidden merely to claim zero dependencies.

Git is authoritative for code, schema, and static assets, **not a store of the user's financial records**. The committed ledger in the user's private Google workbook is authoritative for confirmed financial facts; local caches, bento dashboard tiles, and chart values are strictly projections. Bank tabs alone cannot reconstruct cash movements and opening capital.

## 4. Structural architecture

### 4.1 System and dependency law

- **ARC-1** FolioDash is a static PWA built and published from GitHub. The repository, its builds and the public demonstration contain synthetic data only. Implemented: GitHub Pages serves the artifact checked by CI.
- **ARC-2** The person's own Google spreadsheet holds the ledger. The browser signs the person in with the narrow `drive.file` permission, creates and finds that spreadsheet, and reads and writes it through the Sheets API. No FolioDash server, database provider or per-person deployment exists. Decided (FD-017) and Implemented; proof on a real Google account is Open.
- **ARC-3** The Apps Script service in `src/interfaces/server` and its deploy workflow are superseded by ARC-2. They are removed only after the live proof (FD-017) and MUST NOT be a dependency of the browser build.
- **ARC-4** There is one calculation kernel and one versioned policy. The browser and Apps Script builds MUST preserve the same kernel semantics. A formula is never duplicated in a component, a report or a chart callback.
- **ARC-5** The Google direction stores readable records in a private workbook. It does not claim FolioDash end-to-end encryption; an E2EE variant needs a superseding decision and a different validation contract (section 8).
- **ARC-6** GitHub secrets belong to CI and deployment, never to the browser runtime. A static site cannot keep a secret, and a public OAuth client ID is not a credential. See [Google-backed architecture](google-sheets-backend.md).
- **ARC-7** The stack is TypeScript, Preact, Vite, npm with one lockfile, Vitest, ESLint with typescript-eslint, `d3-scale`, `d3-shape` and `d3-array` for SVG charts, esbuild for the Apps Script bundle, Prettier for formatting, and GitHub Pages for hosting (FD-008). Changing a runtime, framework, package manager or test tool is an amendment. Pages visibility, the production origin and deployment tooling stay Open.
- **ARC-8** There is one dependency manifest and no monorepo or package catalogue until a demonstrated packaging need exists.

The layers and the imports each may make, as the repository enforces them:

```yaml
# @machine-readable: architecture-isolation
# Enforced by npm run verify:repository; runtime purity also needs review and tests.
layers:
  - id: core
    path: src/core
    allowed_imports: []
    forbidden_runtime_apis: [dom, node, network, storage, cloud-sdk, locale]
  - id: applications
    path: src/applications
    allowed_imports: [core]
    dependency_access: ports-only
  - id: adapters
    path: src/adapters
    allowed_imports: [applications, core]
    role: port-implementation
  - id: web/shared
    path: src/interfaces/web/shared
    allowed_imports: []
    role: domain-blind-ui-and-tokens
  - id: web/presentation
    path: src/interfaces/web/presentation
    allowed_imports: [applications, core, web/shared]
    role: domain-aware-display-without-infrastructure
  - id: web/features
    path: src/interfaces/web/features
    allowed_imports: [applications, core, web/shared, web/presentation]
    forbidden_imports: [adapters, server, other-web-features]
  - id: web/app
    path: src/interfaces/web/app
    allowed_imports: [applications, core, adapters, web/shared, web/presentation, web/features]
    role: composition-root
  - id: web/service-worker
    path: src/interfaces/web/service-worker
    allowed_imports: []
    role: public-asset-cache-policy-and-worker-entry
  - id: server
    path: src/interfaces/server
    allowed_imports: [applications, core, adapters]
    forbidden_imports: [web]
    role: composition-root
```

- **ARC-9** Imports follow the layers above. `npm run verify:repository` enforces this for relative, type-only, re-exported and literal dynamic imports, for cycles including type-only edges, for browser/server isolation through intermediate adapters, and for production source never importing tests or fixtures. The [repository map](repository-map.md) draws the real graph.
- **ARC-10** UI and framework imports are allowed in the web interfaces and never in the kernel. The kernel uses no DOM, Node, network, storage, cloud SDK or locale API.
- **ARC-11** A feature never imports another feature's components, stores or private state. Shared business behaviour belongs in the kernel and use cases, shared visual behaviour in the shared primitives. Only the composition root wires concrete infrastructure into use cases.
- **ARC-12** Browser identity and storage adapters live in `src/adapters/browser`. The browser build excludes server adapters and secrets, and an adapter folder is never a way around a narrower environment capability.
- **ARC-13** `shared` is domain-blind. Financial chart widgets and amount privacy presentation live in `presentation`; overview data selection and chart ranges belong to the overview feature; cross-workflow import and session contracts live in `applications`.
- **ARC-14** There are no barrel or re-export files, and no new wrapper or interface for every function.

### 4.2 State ownership

- **ARC-15** Component state owns temporary interaction details, never confirmed financial facts. Feature state owns one bounded workflow, never another feature's private state. Application state exposes the coherent portfolio revision and use-case outcomes. Infrastructure state owns connection, session, cache and update lifecycle.
- **ARC-16** The private ledger owns confirmed records. No global UI store is a second ledger.
- **ARC-17** A query never performs a hidden financial mutation. A command is explicit and returns an acknowledgement, a committed revision or a typed failure; a safe commit receipt does not break command/query separation.

### 4.3 Repository

The root is the first thing a visitor sees, so it is an entry and control surface and nothing more (FD-015).

- **REP-1** The root holds `README.md`, `AGENTS.md`, `.gitignore`, `package.json`, `package-lock.json` and the folders `.github`, `config`, `docs`, `scripts`, `src` and `tests`. `npm run verify:repository` rejects anything else. Everything else has a home in the table below.
- **REP-2** A new root entry needs a written reason that a tool-supported explicit path under `config/` cannot meet. Editor, version-manager and Git-attribute dotfiles are deliberately absent, and the policy test rejects them. A forwarding wrapper or duplicate configuration is never added to hide a file.
- **REP-3** Root material is never a TODO, plan, notes, fix or final document, an unreviewed dump, an archived version, a ZIP bundle, a copied bank export, a generated screenshot, an experiment script or a second implementation left beside the canonical source.
- **REP-4** Private financial files belong outside the repository. An ignore rule is defence in depth, not evidence that anything was audited, and a hidden folder is not a privacy boundary.
- **REP-5** Build output, dependencies, caches and reports are ignored artifacts. No folder is created empty or for a future need (PRN-1).
- **REP-6** `LICENSE` and `CHANGELOG.md` appear when licensing (FD-011, Open) and releases exist. Reusing legacy source needs a licence and provenance review.
- **REP-7** File and folder names, file length, folder size, domain grouping and vocabulary follow the [naming and structure contract](naming-contract.md), enforced by `npm run verify:structure`.

| Content | Home |
|---|---|
| Introduction and pointers | `README.md` |
| Agent working agreement | `AGENTS.md` |
| Source in the layers of section 4.1 | `src/` |
| Public passthrough assets | `src/interfaces/web/public/` |
| Unit tests | beside their subject |
| Cross-layer tests and synthetic fixtures | `tests/` |
| Executable tooling, by purpose | `scripts/verify`, `audit`, `artifacts`, `docs`, `lib` |
| Tool and deployment settings, reached by explicit path | `config/` |
| Documents | `docs/architecture`, `docs/design`, `docs/operations` |
| Repository-host metadata and workflows | `.github/` |

## 5. Financial and temporal contract

### 5.1 Identity, money and dates

- **FIN-1** Identity is the validated ISIN within a portfolio, never row position or display name. A closed fund stays in historical records, and absence from an extract is not proof of sale.
- **FIN-2** EUR money is stored as exact integer cents with checked arithmetic and explicit bounds. Stored cash is never a binary floating-point number.
- **FIN-3** A rate is a calculated ratio with an explicit denominator and a finite-result check. Unknown is not zero, and a UI dash means an unavailable result, never a persisted number.
- **FIN-4** A statement date is a date-only ISO value. Import and commit times are stored separately as instants. Import time is never used as valuation time, and a date is never shifted by a time-zone conversion.
- **FIN-5** One locale boundary parses Italian manual amounts. The bank adapter validates its own supported numeric forms. Formatting never changes a stored value.

### 5.2 Observations and movements

The model keeps funds, valuation snapshots, opening balances, cash movements, import evidence and revisions apart. Reporting reads those facts and never infers a missing contribution from a price change.

- **FIN-6** Net invested is the explicit opening net invested plus later money in, minus full money out. Euro gain is fund value minus net invested, and portfolio gain includes the retained results of closed funds.
- **FIN-7** Interval gain is the change in euro gain, with recorded cash handled through net invested.
- **FIN-8** A withdrawal records full proceeds, not only profit. A switch records both gross sides even when net cash is zero.
- **FIN-9** Bank market value and fiscal acquisition cost are not substitutes for opening net invested.
- **FIN-10** A cash movement has a known date or an explicit interval with unknown timing. A date is never invented, and an uncertain interval is never silently allocated when a new intermediate snapshot arrives.
- **FIN-11** A movement has a stable identity and is counted once. Interval provenance and allocations cannot duplicate it across reports.
- **FIN-12** A first observation does not manufacture a return for the period before it. Closing and reopening a fund keeps euro history and separates comparable holding episodes.
- **FIN-13** Several snapshots never turn an estimated cash-timing percentage into a time-weighted, internal-rate or annualised return. A new return method needs its own decision, input evidence and independent examples (FD-007).

### 5.3 Reporting policy

The accepted initial policy is `legacy-parity-v1` (FD-007): the labelled definitions of the legacy sheet are preserved for parity, and every other method stays Open.

- **FIN-14** One coherent snapshot exists per valuation date. A different observation on that date needs an explicit revision, not a second record. Intraday observations are not supported.
- **FIN-15** Monthly reporting uses the latest snapshot in each month and distinguishes an as-of month from a true month-end. Actual dates stay discoverable, and charts space points by real date.
- **FIN-16** Month-on-month compares selected monthly observations, and change since the previous snapshot is a separate metric. A month is not weighted more because it has more snapshots, and a missing comparable month stays unavailable unless a separately approved method covers it.
- **FIN-17** The baseline and denominator for year-to-date and year-on-year are versioned policy, not an incidental array search. The legacy January-snapshot year-to-date is not a 1 January calendar-year return: it is preserved and labelled, and adopting another definition needs FD-007 approval and an explicit transition. An interval estimate is never relabelled as an annual return.
- **FIN-18** The kernel's technical tests include hand-calculated cash-flow examples that are independent of migrated sheet output. A known historical mistake is not canonised because a legacy export contains it.

## 6. Import and validation boundary

### 6.1 Read, review, commit

```text
User-selected XLSX
  -> bounded local parsing
  -> validated candidate observations and provenance
  -> review of date, identities, totals, lifecycle and cash inputs
  -> explicit confirmation against a known portfolio revision
  -> checked atomic commit to the person's workbook
  -> verified commit receipt
  -> rebuildable views and synchronised devices
```

- **IMP-1** Every external value crosses validation and mapping before the kernel: files, API responses, restored backups, local caches, routes and user input. A type declaration does not validate runtime input.
- **IMP-2** The ledger rules run in the browser under the direct route (FD-017). The checked row protocol, with its checksums and predecessor marker, makes a partial write or a hand edit detectable on read and on the next write; it does not make one impossible. No client-selected owner field substitutes for Google's authentication.

### 6.2 File safety and evidence

- **IMP-3** A named, versioned Fideuram XLSX layout is supported first. Unsupported input fails clearly and is never guessed into a valid portfolio.
- **IMP-4** Measured limits bound compressed and uncompressed size, rows, sheets and parsing time. Heavy parsing moves off the main thread only when measurements justify it, and data is never uploaded merely to move computation.
- **IMP-5** Macros, formulas, external links and active content are never executed. A formula-valued financial cell is rejected unless a supported policy exists.
- **IMP-6** Fund rows are reconciled to the funds-only subtotal. Account cash and unused personal identifiers are excluded from the candidate model.
- **IMP-7** Missing, empty and numeric zero stay distinct where they carry meaning. ISIN checksums, duplicates, negative or overflowing money and subtotal mismatches are validated.
- **IMP-8** Original file bytes are hashed without rewriting the file, and a semantic fingerprint, if used, has its own versioned canonicalisation. A checksum proves equality to recorded bytes, never bank authenticity or ownership, and a recognised filename date is never proof without user review.
- **IMP-9** A save stores the month's exact bank statement as read, with the decisions made about it, in the same all-or-nothing request as the ledger (FD-019), so the ledger can be rebuilt from those records. A converted tab is not a byte-identical source backup, and a hash cannot reconstruct a lost file. The exact retained fields and any full-XLSX archive are Open (FD-004). Reconstructed historical statements stay labelled reconstructed.

### 6.3 Explicit consent

- **IMP-10** Preview never mutates. Choosing a file, recognising its name or calculating a preview does not save history.
- **IMP-11** A review ends with one clear confirmation, never a second hidden-menu save. New identities, missing funds, reopening, opening capital and movements are handled inside that workflow, and a missing financial fact is asked for, never guessed.

## 7. Writes, integrity and cross-device consistency

The ledger is a versioned, coherent set of committed facts in the person's workbook. Sheets offers no general multi-request transaction, so publication relies on a checked append protocol described in [Google-backed architecture](google-sheets-backend.md#7-commit-publication-and-concurrent-access).

- **WRI-1** Every mutating command carries a unique idempotency key and the expected portfolio revision. A retried identical command returns the same outcome without another write, and reusing a key with a different payload is rejected.
- **WRI-2** A write publishes a complete revision atomically: the statement, movements and evidence go in one request that also claims its predecessor, so a competing second device gets a stale-review outcome and never a silent last write.
- **WRI-3** After an ambiguous timeout the command outcome is read before any retry. Failure is never assumed to mean no commit, and a financial write is never blindly retried.
- **WRI-4** Success is shown only after authoritative acknowledgement or reconciliation. A failure of a chart or a refresh after a commit says **saved; view needs attention**, never **import failed; try again**.
- **WRI-5** Retries, deadlines and file sizes have named, bounded configuration, and only an operation with a known safe protocol is retried.
- **WRI-6** An unsupported edit made directly in the spreadsheet is detected, never assumed safe.
- **WRI-7** A correction supersedes a prior revision and keeps its provenance. A backfill or earlier-history correction replays and revalidates affected balances and lifecycle, and shows its impact before committing.
- **WRI-8** Deletion is not a correction. Deleting removes user-controlled active records and device caches under an approved retention policy (FD-009, Open), and a closed fund is never pruned as stale application data.

## 8. Privacy, authentication and storage

- **PRV-1** The repository, CI, builds and public demonstrations contain synthetic data only. Ignore rules do not replace content and secret scanning.
- **PRV-2** Public application code and private financial data stay separate. Frontend filtering, an obscure URL and a private repository are not access control.
- **PRV-3** The person's own Google account is the owner of the data and the only authority over it. The app sees only files it created or the person opened with it (`drive.file`). Two accounts MUST be unable to read, infer or mutate each other's records by changing an identifier. FolioDash keeps no credential store and no custom password cryptography; session ownership, revocation and recovery remain Open (FD-005).
- **PRV-4** Google access is short-lived with no refresh token. It and the account's sign-in hint stay on the device in `localStorage`, falling back to `sessionStorage` and memory, and are renewed quietly on the person's next click (FD-022). No administrative credential, encryption secret or server secret is in the browser build.
- **PRV-5** The device holds a rebuildable copy of the ledger, never financial authority, with a visible **Forget this device** control. Signing out wipes it (FD-018). The copy is not encrypted at rest, and the policy page discloses that.
- **PRV-6** There is no analytics, advertising, session replay, general CDN runtime code or third-party error payload that could contain financial data. Google's identity loader is an explicit, reviewed authentication and CSP exception, not a general allowance.
- **PRV-7** Logs and support exports are redacted: no statements, balances, file contents, filenames with account details, tokens or full request bodies.
- **PRV-8** One isolated application origin is preferred, and production, preview and demonstration boundaries are defined before deployment. A personal dataset never seeds a preview build.
- **PRV-9** Transport is encrypted and the provider's storage protections are used with their real administrative-access limits disclosed. Ordinary at-rest encryption is never described as end-to-end encryption, and user ownership or a private repository does not make compromised code harmless.
- **PRV-10** Hosting cost, limits and data location are verified before adoption, and a free tier is not a guarantee of availability, privacy or compliance. The privacy review of the Google direction remains Open (FD-003).

## 9. Offline and PWA lifecycle

- **OFF-1** Offline use is viewing only, of an account-scoped device copy. There is no offline financial write (FD-010, SCO-4). Each cached record shows its last synchronisation and revision, and a stale cache is never presented as a freshly confirmed portfolio.
- **OFF-2** Live means fresh authorised reads on defined events, not push updates and not automatic acceptance of unreviewed edits to bank tabs.
- **OFF-3** Caching sensitive records on the device is a disclosed policy, not an install side effect. Signing out or switching account clears account-owned memory and persistent caches before another account can see them, and browser storage is never the only backup.
- **OFF-4** The service worker caches versioned public app assets. It never caches authenticated responses, tokens, source documents or financial exports.
- **OFF-5** An update never discards an unsaved import, mixes incompatible schemas or forces a reload during confirmation. Cache and database upgrades are versioned, recoverable and tested, and an invalid cache is quarantined and reloaded from the authority, never silently promoted. The device-privacy implications of offline account revocation are disclosed.

## 10. Backup, restore and migration

Synchronisation, revision history and disaster-recovery backup are separate capabilities. Persistence retention and restore targets are Open (FD-009).

- **BAK-1** A complete, versioned, machine-readable export is provided with human-readable financial tables. It includes policy versions, provenance and any explicit exclusion such as locally retained originals.
- **BAK-2** A portable backup is protected appropriately. A plaintext download is never implied to be encrypted (FD-003, FD-009).
- **BAK-3** Restore validates format, integrity and financial invariants, previews its effect, and commits atomically with a recoverable prior revision. It never silently merges duplicate movements or overwrites another account.
- **BAK-4** A provider backup needs a tested recovery process and documented recovery targets before release. Enabling a backup setting is not a restore test.
- **BAK-5** Deletion documents live-data removal and finite backup retention, and promises no immediate deletion of every provider copy without evidence.
- **BAK-6** Migration from the legacy sheet is read-only against the original workbook. Dates, cash provenance, lifecycle and reporting policy are preserved, and reconstructed or unverified facts are flagged.
- **BAK-7** Migrated results are compared with independently understood cases and the established workbook, differences are reported, and approval is obtained before real data is adopted. Re-entering all statements by hand is never the default path, and no production dataset is copied into a fixture.

## 11. Interface, visual and error contracts

The acceptance home is [web quality](../operations/web-quality.md), the design system is [UI system](../design/ui-system.md), and the control inventory is [interaction coverage](../design/interaction-coverage.md).

- **UXC-1** One token system owns type, spacing, colour, radii, motion and chart styling. Components consume semantic tokens and invent no local scale.
- **UXC-2** One term names one concept ([vocabulary](naming-contract.md#vocabulary)). The default language of the interface and documents is English, and the default financial format is Italian and EUR. Locale and language are independent.
- **UXC-3** Meaning never rests on colour alone: gains and losses use signs and labels, and fund-comparison colours identify funds, not winners.
- **UXC-4** Every interactive control has perceptible hover and focus, press and release, and relevant state feedback. After a control is added or changed, the inventory is regenerated and reviewed and the rendered audit runs. A state stays OPEN until its own evidence exists, and an animation count or a matching selector is not that evidence.
- **UXC-5** Motion respects reduced motion, privacy hiding is immediate, and financial geometry is exact.
- **UXC-6** Custom icons use one accessible SVG primitive. There is no decorative emoji or icon-library dependency by default.
- **UXC-7** Charts are projections through one renderer, not a second calculation engine. A missing point stays a gap, zero is not missing, timestamps are truly spaced, and every plotted series informs the bounds. An auto-scaled axis discloses its scale, steepness is not a cross-fund return comparison, and a logarithmic display is never a global default or a way to hide a non-positive value.
- **UXC-8** Chart source values and bounds are checked independently. A DOM screenshot approximation does not prove the chart rendered.
- **UXC-9** Setup is guided and minimal. Every core operation works with keyboard and touch and exposes the next useful action.
- **UXC-10** An error is typed, complete, wrapping, selectable and safely copyable. It preserves the draft and states whether a financial save occurred, did not occur or is still being reconciled.
- **UXC-11** A substantial interface addition or redesign requires consulting the [Astryx reference](../design/astryx-reference.md) and recording the reference considered and the adaptation or the reason for departing from it. FolioDash's own design, financial, privacy and interaction contracts remain authoritative.
- **UXC-12** A transition or animation takes its duration and easing from the motion tokens, a colour comes from a colour token, and only transform and opacity animate. Zero and `linear` are the only literals allowed. `npm run verify:style` is blocking; a deliberate layout transition carries a reasoned `style-allow` waiver beside the declaration.
- **UXC-13** Under `prefers-reduced-motion` nothing transitions or animates, smooth scrolling is off, and hiding amounts is immediate. `npm run audit:reduced-motion` checks this in the real renderer on every screen.

## 12. Conventions, standards and governance

### 12.1 Conventions

- **STD-1** Source, comments, documents and commit messages are in English. File and folder names are kebab-case, types and components are PascalCase, functions and variables are camelCase, and a named policy constant is UPPER_SNAKE_CASE. A name states domain and role, never `misc`, `helpers2`, `final` or `new-version`. The [naming and structure contract](naming-contract.md) is the full rule.
- **STD-2** A unit test sits beside its subject as `<name>.test.ts(x)`, and `tests/` holds only tests that span layers with their synthetic fixtures.
- **STD-3** A workbook schema change is an ordered, reviewed migration in source with a drift check. History already applied is never rewritten, and an untracked dashboard edit is not a deployment strategy.
- **STD-4** A commit subject is `<type>: <summary>` with the types in the naming contract. Releases follow Semantic Versioning, with a changelog once releases exist. `npm run setup:hooks` installs an opt-in local check of the subject; it is not a CI gate, because an edit made directly on GitHub does not follow it.

### 12.2 Engineering standards

These standards bind every future change, and every future session MUST follow them. Each is enforced by `npm run verify` unless its entry says otherwise.

- **STD-5** A convention is real only when a machine fails the build if it is broken. A rule that cannot yet be checked is written down as Not yet enforced, with the check that will enforce it, and is never presented as a standard.
- **STD-6** A new rule arrives with a ratchet. Existing violations are recorded, a new violation fails, and a recorded violation that has been fixed MUST leave the record, so the record only shrinks. A rule becomes plainly blocking when its record is empty. A record is never regrown to make a check pass.
- **STD-7** A restructure changes behaviour in no way and proves it. A move or rename is its own commit, a format-only change is its own commit, and neither shares a commit with a logic change. The proof is the evidence [repository policy](../operations/repository-policy.md) names: the full gate, the byte oracle or a stated equivalence check, the rendered audits and the screenshots. A claim of neutrality without that evidence is not made.
- **STD-8** The root stays minimal (REP-1, REP-2), a folder holds at most 20 code files and a code file at most 400 lines, and a split follows a responsibility that already exists. A remaining exception is recorded with its reason, never hidden.
- **STD-9** Documents are checked against the files. Every link, heading anchor and backticked repository path resolves, every document is reachable from the documentation map, every section and rule citation resolves, and a generated document is never edited by hand.
- **STD-10** No speculative layer, empty folder, placeholder service or unused dependency is added. Each dependency has a recorded purpose, a licence and a review in [dependency maintenance](../operations/dependencies.md), and a formatter or generator is pinned exactly.
- **STD-11** Evidence is never overstated. A synthetic or mocked run is never called live verification, an unrun gate stays unrun, and a required check is never bypassed or weakened to pass (PRN-13).
- **STD-12** Large or structural work happens on its own branch or worktree and is merged in verified steps. A commit names its paths explicitly, carries one concern, and is verified green before it is pushed. History is never force-pushed, and another session's run is never pushed over.
- **STD-13** A rule change is made here first, with its section 16 entry, and then in the subordinate documents and the code. A decision the owner has not made is never settled silently (section 15).
- **STD-14** Required failures block integration and deployment, and a documented failure is still a failure. A defect report separates confirmed cause from hypothesis, and a fix carries prevention for its failure class and a regression test where feasible.
- **STD-15** A test asserts something. `npm run verify:tests` fails a test file that contains no assertion, because a test that can never fail proves nothing and only looks like coverage. The check is per file: it cannot see a single assertion-free test inside a file that asserts elsewhere.

### 12.3 Adoption status of the standard

The organization standard is adopted in eleven phases. Phases 1 to 10 are in place; the rest are planned and are not claimed until they land.

| Phase | Result | State |
|---|---|---|
| 1 | Pinned formatter and the byte oracle (`npm run verify:oracle`); lean root kept | Implemented |
| 2 | Repository formatted once; formatting gated | Implemented |
| 3 | Naming and structure contract with a ratchet (STD-6) | Implemented |
| 4 | Kebab-case files, concept folders, scripts by purpose, script namespaces | Implemented |
| 5 | Oversized files split; three session classes remain recorded | Implemented, with an open exception |
| 6 | Documentation check, generated repository map, this revision, rule IDs | Implemented |
| 7 | Coverage ratchet, property tests, accessibility audit in CI, kernel mutation floor, workflow-reference gate; component tests, visual baselines and a browser matrix decided against or deferred ([testing](../operations/testing.md)) | Implemented, with a mutation backlog |
| 8 | Style ratchet for motion tokens, colour tokens and cheap properties; reduced-motion audit in CI; primitives-only controls, Stylelint and a feature generator decided against for now ([testing](../operations/testing.md)) | Implemented |
| 9 | Content scan of tracked files and built output, pinned-action check, commit-subject check with opt-in local hooks. GitHub settings inspected read-only and unchanged: Dependabot version updates and required checks stay off by the owner's decision | Implemented; hooks not installed |
| 10 | Every rule whose record emptied became plainly blocking: style (ten exceptions resolved) and accessibility. Three records remain, with their reasons: the structure record (the three session classes) and the coverage and mutation floors, which are ratchets by nature | Implemented, with three recorded exceptions |
| 11 | Health scorecard, setup and doctor commands | Planned |

## 13. Proof obligations and release gates

- **GAT-1** A capability is called supported only with evidence in its category: **kernel** (independent examples and properties for exact cents, flows versus gains, lifecycle, missing data, baselines and deterministic replay); **parsing** (synthetic exports, blanks, European separators, invalid identifiers and subtotals, duplicates, unsupported and formula files, bounded hostile XLSX); **commit** (idempotency, stale previews, two-device races, timeouts, lost acknowledgements, corrections and atomic recovery); **security and privacy** (authorisation across two accounts, forbidden upload, log and build payload checks, cache isolation, session expiry, deletion); **PWA and browser** (real rendered charts and source values, install and update, local-file import, keyboard and touch, offline status); **recovery and migration** (full export and restore, damaged backup rejection, read-only parity); **deployment** (the exact verified revision, headers and caching, private denial to anonymous and wrong-account requests, real Mac and Android journeys with synthetic data).
- **GAT-2** Each gate reports PASS, FAIL or BLOCKED / NOT RUN, with revision, environment, method and evidence. A syntax check or a mocked chart cannot satisfy a renderer gate, and a tool never invents a measurement or reports an unavailable manual check as done.
- **GAT-3** `npm run verify` is the single local and CI gate. It runs the repository policy, the structure ratchet, the documentation check, the style check, the test-assertion check, the format check, the interaction inventory, the contributor and punctuation checks, type checks, lint, the unit, property and contract tests with coverage, the coverage ratchet, the script tests, the production build, the PWA check, the Apps Script bundle check and the content scan. CI runs it on Node 22, alongside workflow linting, CodeQL and dependency review ([GitHub Actions](../operations/github-actions.md)).
- **GAT-4** The rendered interaction audit, the seven synthetic journeys, the accessibility audit and the reduced-motion audit are not part of `npm run verify`. They run in the Node 22 CI job and block release assembly, and README capture runs for a release from `main`. A change to the interface runs them locally before it is pushed, including `npm run capture:readme`, and reports the result.
- **GAT-5** A scan of tracked files and built output for credentials and financial identifiers is a gate (`npm run verify:content`). It cannot read meaning, so a real figure or a name in prose is not caught, and the content review in REP-4 still applies. Live-Google proof, real-device proof and a restore drill are not yet gates. They remain Open and are never implied by a green `verify`.
- **GAT-6** Mutation testing of the kernel runs on demand (`npm run audit:mutation`). Its score MUST NOT fall below the floor recorded in `config/stryker.config.json`, and surviving mutants are a ranked backlog fixed in their own commits, never inside a restructure (STD-7). See [testing](../operations/testing.md).

## 14. Forbidden paths

1. **BAN-1** Treating a row, alias or filename as financial identity or authenticity.
2. **BAN-2** Deriving opening capital or unrecorded movements from market value.
3. **BAN-3** Double-counting interval cash flows after a more granular import.
4. **BAN-4** Treating a missing fund as sold, or pruning a closed fund's history.
5. **BAN-5** Using display formatting or rewritten workbook cells as an unstable evidence fingerprint.
6. **BAN-6** Blindly replaying an ambiguously completed save, or letting two devices silently overwrite each other.
7. **BAN-7** Calling a failed chart a failed financial commit, or inviting an already-saved month to be reimported.
8. **BAN-8** Using browser caches, chart series or editable UI state as the financial ledger.
9. **BAN-9** Accepting a client-supplied owner as authorisation, or putting a secret in the public frontend.
10. **BAN-10** Uploading original documents or identifiers, or enabling telemetry, outside the approved data policy.
11. **BAN-11** Claiming end-to-end encryption, permanent backups, instant deletion, precision or compliance without proof.
12. **BAN-12** Queuing offline financial writes, or forcing an update through an unsaved review.
13. **BAN-13** Duplicating a financial formula in a component, a report or a chart callback.
14. **BAN-14** Changing a year-to-date or year-on-year definition implicitly while migrating or redesigning.
15. **BAN-15** Treating a synthetic screenshot, a coverage percentage or a mock pass as live verification.
16. **BAN-16** Publishing or provisioning infrastructure on the strength of a design alone.
17. **BAN-17** Bypassing, weakening or deleting a required check, or regrowing a ratchet record, to make a change pass.
18. **BAN-18** Stating a convention as a standard when nothing enforces it, or editing a generated document by hand.

## 15. Decision status

States are the owner's, taken from the private register. "In the repository" is what the code and documents show today. A decision the owner has not made is not settled here.

| FD | Subject | Register state | In the repository |
|---|---|---|---|
| 001 | Product boundary and delivery | Proposed | Implemented as SCO-1 to SCO-6 |
| 002 | Dependency law | Proposed | Implemented and enforced (ARC-9) |
| 003 | Cloud privacy and encryption | Constrained by FD-013; review pending | Disclosed (PRV-5, PRV-9); review Open |
| 004 | Original-source retention | Open in detail | Exact statement stored per FD-019; archive Open |
| 005 | Authentication and sessions | Open | Google sign-in only; revocation and recovery Open |
| 006 | Snapshot granularity | Proposed | Implemented (FIN-14) |
| 007 | Reporting and migration policy | Accepted for `legacy-parity-v1`; all else Open | Implemented (FIN-17) |
| 008 | Stack, hosting, dependencies | Partly selected | Implemented (ARC-7); hosting details Open |
| 009 | Backup, restore, deletion, retention | Open | Not implemented as a gate |
| 010 | Offline and update behaviour | Proposed | Implemented (OFF-1 to OFF-5) |
| 011 | Licence, authorship, reuse | Open | No licence file (REP-6) |
| 012 | Quality targets and test environment | Proposed | Measurements Open |
| 013 | Google-backed application | Direction selected | Implemented (ARC-1, ARC-2) |
| 014 | Browser to Apps Script route | Proposed, not verified | Superseded by FD-017 for new users |
| 015 | Lean repository root | Principle selected | Implemented and enforced (REP-1, REP-2) |
| 016 | Apps Script source sync | Owner direction, not set up | Not set up; removal follows FD-017 |
| 017 | Direct browser-to-Google storage | Accepted; not verified on real Google | Implemented (ARC-2); live proof Open |
| 018 | Browser copy of the ledger | Accepted | Implemented (PRV-5) |
| 019 | Each month keeps its exact statement | Accepted; not verified on real Google | Implemented (IMP-9); live proof Open |
| 020 | Work expenses tracker | Implementation authorised | Implemented locally; live proof Open |
| 021 | Persistent access and competing saves | Owner-requested; tab-only storage superseded by FD-022 | Implemented locally; live race proof Open |
| 022 | Remembered Google connection | Owner-requested | Implemented locally; real renewal not verified |
| 026 | Value-only checkpoints | Owner-requested | Implemented locally; live behaviour Open |

Open decisions that gate work: FD-004, FD-005, FD-009 and FD-011. Real-data migration, cloud provisioning, publication changes and licensing each need the owner's explicit authority; this document is not that authority.

## 16. Amendment record

| Date | Basis | Change |
|---|---|---|
| 2026-11-01 | FD-013 | Google Sheets and Apps Script replace the provider-neutral cloud proposal; GitHub secrets are not a browser runtime bridge |
| 2026-11-01 | FD-017, FD-018, FD-019 | The browser talks to Google directly under `drive.file`; the device copy is an accelerator; each month keeps its exact statement |
| 2026-11-04 | Organization audit | Presentation ownership and the repository policy (ARC-13, REP-1) |
| 2026-11-05 | FD-021 | Short-lived access survives a reload; the write batch claims its predecessor |
| 2026-11-07 | FD-022 | The connection is remembered on the device and renewed on the next click; refresh tokens are not used |
| 2026-11-17 | Organization standard, phases 1 to 6 | Formatter, byte oracle, naming and structure contract with a ratchet, kebab-case and concept folders, oversized files split, documentation check and generated map |
| 2026-11-18 | Organization standard, phase 7 | Coverage and accessibility ratchets, property tests, kernel mutation floor, one test runner layout and a workflow-reference gate (GAT-3, GAT-4, GAT-6) |
| 2026-11-18 | Organization standard, phase 10 | The style and accessibility records are gone and both checks are blocking; layout transitions carry reasoned waivers (UXC-12) |
| 2026-11-18 | Organization standard, phase 9 | Content scan as a gate (GAT-5), pinned-action check, commit-subject check and opt-in local hooks (STD-4) |
| 2026-11-18 | Organization standard, phase 8 | Style ratchet for motion and colour tokens and cheap properties, reduced-motion audit (UXC-12, UXC-13) |
| 2026-11-18 | Owner request | Principles revised by the owner (PRN-1 to PRN-14); this document restructured into addressable rules with permanent IDs, brought up to the current state and given its engineering standards (section 12) |
