# Naming and structure contract

Status: **Implemented as a ratchet, 2026-11-17** (organization standard, phase 3). Architecture authority remains [CleanStack](cleanstack.md); this document owns names, file and folder shape, and the shared vocabulary. A rule here is real only if a check enforces it, and the table says which.

## How each rule is enforced

| Rule | Enforced by | State |
|---|---|---|
| Root holds only the approved entries | `npm run verify:repository` | Blocking |
| Layer imports follow the dependency law; no cycles | `npm run verify:repository` | Blocking |
| Code is formatted by the pinned formatter | `npm run format:check` | Blocking |
| File names, folder names, file length and folder size below | `npm run verify:structure` | Ratchet: no new violation; recorded ones tolerated |
| Symbol names, import order, error shape | Planned lint rules, a later phase | Not yet enforced |
| Commit subjects, branch and tag names | Review only | Not yet enforced |

The ratchet records today's violations in `config/structure-baseline.json`. A new violation fails the check. A recorded violation that has been fixed also fails until it is removed with `npm run verify:structure -- --shrink`, so the record can only get shorter. Limits live in `config/structure.json`. The target is an empty record, at which point the ratchet is simply a blocking rule.

## Files and folders

- **File names are kebab-case.** Lowercase letters and digits joined by single hyphens, starting with a letter: `money-format.ts`, `overview-view.tsx`. Dot-separated qualifiers follow the same rule: `money.test.ts`, `vite.config.ts`. A component or class is named by its file, not by a differently cased file name. Case-only differences are never allowed because macOS and Windows file systems treat them as the same name.
- **Folder names are kebab-case** and name a responsibility, not a process: `service-worker`, not `bughunt-ui`.
- **A code file has at most 400 lines.** Past that, split along a responsibility that already exists; do not split to evade the number.
- **A folder holds at most 20 code files directly.** Past that, group by domain concept into sub-folders; do not add a catch-all.
- **Tests sit beside the code they test** as `<name>.test.ts(x)`. Only tests that span layers, with their synthetic fixtures, live in `tests/`.
- **Scripts** are named `<verb>-<subject>.ts`. Shared script code that is not an entry point is a plain noun module.

## Commands, branches and tags

- npm scripts are `<namespace>:<action>` with namespaces `verify`, `audit`, `build`, `format`, `capture` and `docs`; a script with no namespace is a developer entry point (`dev`, `test`, `lint`). This is the target: several existing scripts (`inventory:`, `fixtures:`, `benchmark:`, `prepare:`, `preview:`) are regrouped when `scripts/` is restructured.
- Commit subjects are `<type>: <summary>`. Types in use: `feat`, `fix`, `docs`, `design`, `test`, `ci`, `chore`, plus `refactor` and `style`. A few early subjects are plain sentences; history is not rewritten.
- A tag that freezes a state before a structural change is `baseline-YYYY-MM-DD`. The tag created on 2026-11-17 is named `checkpoint-2026-11-17`, before this rule existed and before the clash described below was noticed. Renaming a published tag needs the owner's go-ahead, so it is left as it is.

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
