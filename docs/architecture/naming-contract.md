# Naming and structure contract

Status: **Implemented as a ratchet, 2026-11-17** (organization standard, phase 3). Architecture authority remains [CleanStack](cleanstack.md); this document owns names, file and folder shape, and the shared vocabulary. A rule here is real only if a check enforces it, and the table says which.

## How each rule is enforced

| Rule | Enforced by | State |
|---|---|---|
| Root holds only the approved entries | `npm run verify:repository` | Blocking |
| Layer imports follow the dependency law; no cycles | `npm run verify:repository` | Blocking |
| Code is formatted by the pinned formatter | `npm run format:check` | Blocking |
| File names, folder names, file length and folder size below | `npm run verify:structure` | Ratchet: no new violation; recorded ones tolerated |
| Motion durations, easings and colours come from tokens, and only transform and opacity animate unless a reasoned waiver says why | `npm run verify:style` | Blocking |
| Every test file contains an assertion | `npm run verify:tests` | Blocking |
| Nothing moves under reduced motion; hiding amounts is immediate | `npm run audit:reduced-motion` | Blocking in CI |
| Each area of `src/` keeps at least its recorded line and branch coverage | `npm run verify:coverage` | Ratchet: floors only rise |
| A test file lives where a runner looks; every npm script and script path a workflow names exists | `npm run verify:repository`, `npm run verify:workflows` | Blocking |
| Every Markdown link and heading anchor resolves, every backticked repository path exists, every document is linked from `docs/README.md`, rule IDs in the ADR are unique and contiguous and every cited ID and `CleanStack section N` exists, the repository map is current | `npm run verify:docs` | Blocking |
| Symbol names, import order, error shape | Planned lint rules, a later phase | Not yet enforced |
| Node release and installed packages against their pins | `npm run doctor` | Diagnosis, run before working; not a gate |
| Credentials and financial identifiers in tracked files and built output | `npm run verify:content` | Blocking |
| Every workflow action is pinned to a commit SHA | `npm run verify:workflows` | Blocking |
| Commit subjects | `scripts/verify/project/commit-message.ts`, installed as a local hook by `npm run setup:hooks` | Opt-in; not in CI, because a direct edit on GitHub does not follow it |
| Branch and tag names | Review only | Not yet enforced |

The check is plainly blocking: any violation fails `npm run verify:structure`. It began as a ratchet with a record of violations (`STD-6`); the record was emptied on 2026-11-18, when the last three oversized files were split, and was then removed. Limits live in `config/structure.json`.

## Files and folders

- **File names are kebab-case.** Lowercase letters and digits joined by single hyphens, starting with a letter: `money-format.ts`, `overview-view.tsx`. Dot-separated qualifiers follow the same rule: `money.test.ts`, `vite.config.ts`. A component or class is named by its file, not by a differently cased file name. Case-only differences are never allowed because macOS and Windows file systems treat them as the same name.
- **Folder names are kebab-case** and name a responsibility, not a process: `service-worker`, not `bughunt-ui`.
- **A code file has at most 400 lines.** Past that, split along a responsibility that already exists; do not split to evade the number.
- **How an oversized file is split.** A view keeps its exported component in its own file and gives each extracted section a sibling named for it (`expense-week-card.tsx`), its state to a `use-<subject>.ts` hook and its shared types to `<subject>-types.ts`. A stylesheet is cut only at top-level seams and imported in the same order, so the cascade is unchanged. A test file is cut along its `describe` blocks into a `<subject>-suites/` folder beside the code. Shared test builders go in `tests/fixtures/<area>/`, not next to the source, because the repository policy forbids non-test files under `src/` from importing `tests/`. A symbol that other files import stays exported from the original path; no re-export files are added.
- **A folder holds at most 20 code files directly.** Past that, group by domain concept into sub-folders; do not add a catch-all.
- **Tests sit beside the code they test** as `<name>.test.ts(x)`; a property test is `<name>.property.test.ts`, or lives in `tests/properties/` when it needs the platform. Only tests that span layers, with their synthetic fixtures, live in `tests/`.
- **Scripts are grouped by purpose:** `scripts/verify/` (gates, in `code/` for layers, structure, style, coverage, content and punctuation, `output/` for the built app, the interaction inventory and the oracle, and `project/` for workflows, attribution, commit subjects and documents), `scripts/audit/` (rendered and measured audits), `scripts/artifacts/` (what the build produces: bundle, icons, pages, fixtures), `scripts/docs/` (generated documents) `scripts/lib/` (shared helpers) and `scripts/setup/` (local setup: the Git hooks, `npm run setup` and `npm run doctor`). A folder is not named `build/`, which the repository policy reserves for generated output. Where the folder is a verb, the file is named for its subject (`verify/pwa.ts`, `audit/checkpoints.ts`); a pure policy module sits beside its entry point (`verify/repository.ts`, `verify/repository-policy.ts`).
- **Crowded folders are grouped by domain concept, not by file kind.** `src/core/` holds `values/`, `integrity/`, `statements/`, `portfolio/` and `expenses/`; `src/applications/` holds `import/`, `ledger/` and `session/`; `src/adapters/browser/` holds `connection/` and `storage/`; the web `app/` holds `session/`, `demo/` and `platform/` beside its entry files; `features/overview/` keeps its views at the top and its data logic in `model/`. A group is created when a folder passes the size limit, and a file goes where its responsibility is, which a layer's own import rules do not change.

## Commands, branches and tags

- npm scripts are `<namespace>:<action>` with namespaces `verify`, `audit`, `build`, `format`, `capture` and `docs`; a script with no namespace is a developer entry point (`dev`, `test`, `lint`, `setup`, `doctor`, `health`). Generated documents are `docs:*`, generated fixtures and artifacts are `build:*`, and the built-output oracle is `verify:oracle`.
- Commit subjects are `<type>: <summary>`. Types in use: `feat`, `fix`, `docs`, `design`, `test`, `ci`, `chore`, plus `refactor` and `style`. A few early subjects are plain sentences; history is not rewritten.
- A tag that freezes a state before a structural change is `baseline-YYYY-MM-DD`. The first one, taken on 2026-11-17 before the organization work, was first published as `checkpoint-2026-11-17`, before this rule existed and before the clash described below was noticed. It was renamed to `baseline-2026-11-17` on 2026-11-18 under the owner's delegation; the commit is the same.

## Vocabulary

One word has one meaning. Domain terms are defined by their owning document; this table only points to it.

| Term | Meaning | Defined in |
|---|---|---|
| Statement | A bank-issued, dated set of fund valuations; its date is a date-only value | [CleanStack](cleanstack.md) section 5 |
| Observation | One dated valuation of a fund, from a statement or entered by hand. Observations are kept apart from cash movements | [CleanStack](cleanstack.md) section 5.2 |
| Cash movement | Money paid in or taken out, recorded explicitly | [CleanStack](cleanstack.md) section 5.2 |
| Ledger | The private, committed record of confirmed financial facts, held in the person's own workbook | [CleanStack](cleanstack.md) section 3 |
| Workbook | The person's own Google spreadsheet that holds the ledger | [Google-backed architecture](google-sheets-backend.md) |
| Checkpoint | A product term: the total value of the portfolio's funds on a day between two statements, value only | [Checkpoints](../operations/checkpoints.md) |
| Receipt | The unsent command a screen writes to the device and reads back before sending, so a lost save can be described | [Checkpoints](../operations/checkpoints.md) |
| Synthetic | Generated data with no relation to a real person; the only data allowed in the repository | [AGENTS.md](../../AGENTS.md) |
| Baseline | A frozen state a refactor is compared against. Never called a checkpoint | This document |
| Oracle | The built-output comparison that proves a refactor changed no built byte | [Repository policy](../operations/repository-policy.md) |
| Ratchet | A check that tolerates recorded violations but never allows a new one | This document |

**Why "checkpoint" is reserved.** It is a product feature (FD-026) with its own screen, storage and recovery rules. Using it for a repository state would make "restore the checkpoint" ambiguous between a git tag and a user's financial record. Process words are baseline, oracle and ratchet.

## Limits

These checks read paths and line counts. They do not judge whether a name is good, whether a split follows a real responsibility, or whether code is correct; review does. They also do not yet cover symbol names, which is the next lint step.
