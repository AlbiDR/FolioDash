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
| `src/interfaces/web/service-worker/` | Public-asset cache policy and worker entry |
| `src/interfaces/web/public/` | Public passthrough assets beside the configured Vite web entry |
| `tests/` | Synthetic fixtures and checks spanning layers; unit tests stay adjacent to their subject |
| `scripts/`, `config/`, `docs/`, `.github/` | Tooling, explicitly addressed settings, documentation and GitHub discovery metadata |

There are no empty directories for future migrations or services. The retained Apps Script implementation has an explicit FD-017 removal condition; it is not an accidental second implementation to delete during cleanup. Local user-supplied legacy/private folders are not production dependencies and are outside this audit's migration authority.

## Reproducible checks

`npm run verify:repository` checks tracked files plus new non-ignored files. Deleted working-tree files are omitted, so a move can be verified before staging. CI sees the committed checkout. It enforces the current root entry allowlist, known generated/private artifact paths and extensions, source-layer ownership, import direction and production dependency cycles.

The TypeScript syntax walker checks relative imports, type-only imports, re-exports, literal dynamic imports, import type expressions and CommonJS import syntax. Nonliteral module loads, unresolved aliases and unapproved external packages fail closed. Production source cannot import tests or fixtures. Adjacent tests may cross layers and use test dependencies; they are excluded from the production dependency graph. CSS is resolved as a web style dependency, not parsed as TypeScript. The checker does not analyze CSS dependency direction. Transitive source dependencies are also traversed to prevent browser roots from reaching server/Apps Script implementations, or server roots from reaching browser implementations, through intermediate adapters.

The UI external-package allowlist covers the selected Preact and d3 modules. Core and applications cannot import runtime packages. The worker imports only within its area. The browser app cannot import server entry points or Apps Script adapters. Import cycles include type-only edges, keeping contracts independent of the implementations that consume them.

`tests/scripts/repository-policy.test.ts` exercises approved entry points and deliberate violations: private/generated paths, forbidden layer directions, cross-feature imports, barrels, dynamic imports, unresolved dependencies and cycles. `npm run verify` runs the checker before types, lint, tests and builds. Existing CI invokes that command, so no duplicate verification policy is needed.

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

## Tooling floor and lean root, 2026-11-17

Phase 1 of the organization standard added a pinned formatter and a built-output oracle. It changes no source behavior, layer, financial rule or write path, and it adds nothing to the repository root.

The root is the first thing a visitor sees, so it holds only the documentation entry points, the package manifest and lockfile, the ignore file and six folders. Editor, version-manager and Git-attribute dotfiles (`.editorconfig`, `.gitattributes`, `.nvmrc`, `.vscode/`, `.prettierrc`, `.git-blame-ignore-revs`) are deliberately not adopted: the formatter configuration lives in `config/prettier.json` and is passed explicitly by the `format` scripts, `engines` in `package.json` states the Node minimum, and CI pins the Node release. The policy test rejects those dotfiles, so a later change cannot reintroduce them without a documented decision. The cost is that editors do not auto-apply the formatter on save, and GitHub's blame view does not skip the format commit automatically; use `git blame --ignore-rev fcff873` locally.

`npm run format` applies the formatter and `npm run format:check` verifies it. The first repository-wide format, commit `fcff873`, is a separate mechanical commit; `verify` runs the check from the commit after it.

## Structure ratchet, 2026-11-17

`npm run verify:structure` enforces the [naming and structure contract](../architecture/naming-contract.md): kebab-case file and folder names, at most 400 lines per code file and at most 20 code files directly in a folder. Limits are in `config/structure.json`. The violations that exist today are recorded in `config/structure-baseline.json`; the check fails on a new violation and on a recorded one that has been fixed but not removed (`--shrink`), so the record only shrinks. It reads tracked and new non-ignored paths and line counts, runs inside `verify` right after the repository policy, and does not judge whether a name or a split is a good one.

## Health, setup and doctor, 2026-11-18

`npm run health` measures the repository from its tracked files alone: no test run, no network, the same answer twice. `npm run health -- --compare <directory>` sets it beside another checkout. `npm run doctor` reports the Node release against `engines`, the installed packages against their pins (a pinned version must match exactly, which would have caught the test runner that moved to a new release during the test-layer work), Chrome for the audits, and whether the Git hooks are installed. `npm run setup` checks Node, runs `npm ci --ignore-scripts` and shows the next commands; it changes no setting and installs no hook.

Measured on 2026-11-18 against the tag `checkpoint-2026-11-17`, taken before the organization work:

| Measure | Checkpoint | Now |
|---|---|---|
| Root entries | 11 | 11 |
| Files over 400 lines | 19 | 3 |
| Folders over 20 code files | 6 | 0 |
| Most code files in one folder | 35 | 20 |
| Largest code file (lines) | 1,773 | 1,512 |
| 95th percentile file (lines) | 434 | 342 |
| Test files | 93 | 127 |
| Addressable rules (IDs) | 0 | 155 |
| Steps in `npm run verify` | 11 | 18 |
| Production dependencies | 4 | 4 |
| Development dependencies | 11 | 17 |

Raw line totals are not compared: Prettier expanded the code and stylesheets, and about 150 files were added, mostly tests and policy modules. The checkpoint figure of 19 files over the limit was counted before formatting; with the formatter applied the same files would have numbered 35, so the real reduction is larger than the table shows. The three remaining files are the session classes in [Session split design](../architecture/session-split-design.md).

## Content check, pinned actions and commit subjects, 2026-11-18

`npm run verify:content` ends `verify`, where the build output exists. It scans every tracked text file and the built `dist/web` and `dist/apps-script` for private keys, Google client secrets, API keys and access or refresh tokens, GitHub tokens, IBANs whose ISO 13616 check digit is right, and Italian fiscal codes. It reports the file and line and never the matched text. GitHub's own secret scanning and push protection stay on; this adds the financial identifiers they do not know and the files that ship to a visitor. It cannot read meaning: a real amount or a name written in prose is not caught, and a public OAuth client ID is deliberately not flagged because it is public by design.

`npm run verify:workflows` also fails when any `uses:` in a workflow is not a full commit SHA or a local path, so a bad edit fails before GitHub's runtime setting would reject it.

`scripts/verify/project/commit-message.ts` checks a subject against `<type>: <summary>` (STD-4). `npm run setup:hooks` installs it as a `commit-msg` hook, with a `pre-commit` hook that runs the fast static checks, into `.git/hooks`: untracked, shared by every worktree of the clone, and never overwriting a hook that is not its own. It is opt-in and not a CI gate, because a commit made on GitHub's web editor does not follow it; `node scripts/verify/project/commit-message.ts --range origin/main..HEAD` checks a range on demand.

## Style ratchet, 2026-11-18

`npm run verify:style` runs inside `verify`, after the documentation check. It reads every stylesheet under `src/` (one declaration per line, as Prettier writes it) and fails on any breach of `UXC-12`: a `transition` or `animation` duration, delay or easing written out instead of taken from `src/interfaces/web/shared/tokens.css`; a colour written as hex, `rgb()` or `hsl()` outside that file; or a layout property (width, height, margin, padding, `grid-template-rows` and similar, or `all`) in a transition or in `@keyframes`. Zero and `linear` are allowed, because zero is how reduced motion switches a rule off and `linear` is a constant rotation. A deliberate layout transition is allowed with a waiver inside its block, directly above the declaration: `/* style-allow layout-motion: the reason */`. It covers that one declaration, needs a reason of real length, and fails as `unused-waiver` when nothing needed it; a colour, duration or easing cannot be waived and becomes a token. The check began with ten recorded exceptions and has none, so it keeps no record (STD-6). It checks that a value comes from a token, not that the value is a good one.

## Documentation check, 2026-11-18

`npm run verify:docs` runs inside `verify`, after the structure check. It reads every Markdown file in `docs/`, `.github/` and the root and fails when an inline link or its heading anchor does not resolve, when a backticked repository path (`src/...`, `scripts/...`, `config/...`, `docs/...`, `tests/...`, `.github/...`) names something that no longer exists, when a document under `docs/` is not linked from [the index](../README.md), or when a rule ID in [CleanStack](../architecture/cleanstack.md) is duplicated or skipped, or an ID or a `CleanStack section N` citation names something it does not define, or when the generated [repository map](../architecture/repository-map.md) differs from what `npm run docs:map` would write. Globs and placeholders such as `src/**` or `<layer>` are skipped, and fenced code blocks are examples, not references. It checks that a reference points at something real, not that the prose around it is still true.

Front matter with a status and a review date on every document was considered and not adopted: the index already carries each document's status, and a review date goes stale silently, while git records when a file last changed.

## Oversized files, 2026-11-18

`config/structure-baseline.json` now records three files above 400 lines: `session.ts` (1,512 lines), `checkpoint-session.ts` (649) and `expense-session.ts` (437) in `src/interfaces/web/app/session/`. Each is one class whose methods share private state (the token, the generation counter and the current ledger), so getting under the limit means introducing collaborator classes or passing a context object, which is a design change and not a mechanical move. [Session split design](../architecture/session-split-design.md) measures them, proposes the split and sets the safety plan that comes before any code moves. They stay recorded, with the reason, until that design is done and verified. Their tests were split like the others.

The phase 5 splits were validated by evidence, not by the byte oracle: the built CSS of every asset is identical to the pre-split build; the full gate passes with the same 1,114 tests; the rendered interaction audit reports the same 128 assertions and 915 control samples across 27 states, and the seven synthetic journeys the same assertion counts; the README screenshots are byte-identical image by image (15 of 15); the interaction inventory lists the same 220 controls; and the Apps Script bundle holds the same 161 top-level declarations, emitted in a different module order. JavaScript chunks for the split views differ in layout, which is expected when modules move.

## Built-output oracle

A reorganization must not change a built byte. `npm run verify:oracle -- write <file>` builds the web app and the Apps Script bundle with a pinned stamp and records the SHA-256 of every built file except source maps. `npm run verify:oracle -- check <file>` builds the same way and fails on any added, removed or changed file. The snapshot holds hashes only.

The normal web build stamps the git revision, a `-dirty` flag and the current minute into the bundle. Content-hashed filenames cascade from that stamp, so any uncommitted change or minute boundary renames every output file. `FOLIODASH_BUILD_STAMP` pins the whole label; the oracle sets it and normal builds do not.

To regenerate the baseline, check out the tag `checkpoint-2026-11-17`, apply only the `FOLIODASH_BUILD_STAMP` handling in `config/vite.config.ts`, and run the `write` command. Verified 2026-11-17: the phase 1 branch produced 32 built files byte-identical to the checkpoint build. The oracle proves identical output on one machine and Node version; it does not prove identical output across operating systems or Node releases, and it cannot detect a change that leaves built bytes the same but alters tests or documentation. The format commit `fcff873` is the one deliberate exception: formatting changes the unminified Apps Script bundle and splits some minified JSX text children, which was shown equivalent but not byte-identical. Structural phases after it compare against a baseline recorded at `fcff873`, built the same way. Renaming a source file is the second exception: chunk file names derive from source file names, so a rename changes built file names and cascades content hashes while leaving the code unchanged. The kebab-case and folder-grouping commits were therefore validated by comparing the pre-change and post-change builds with hashed names normalised (every web asset, the service worker precache list and the Apps Script bundle without its module-path comments), together with the full gate and the rendered interaction audit. The exact byte check remains the proof for any change that does not rename or move files.
