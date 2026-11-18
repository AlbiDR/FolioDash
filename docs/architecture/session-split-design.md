# Splitting the session classes: design

Status: **Proposed, for owner review. No code has been changed.** It answers the three entries left in `config/structure-baseline.json`: `session.ts` (1,512 lines), `checkpoint-session.ts` (649) and `expense-session.ts` (437), all in `src/interfaces/web/app/session/`. Rules cited are in [CleanStack](cleanstack.md): `PRN-6`, `PRN-9`, `WRI-1` to `WRI-4`, `STD-6`, `STD-7` and `GAT-6`.

## Why these three are different

Every other oversized file was split by moving code. These classes write the person's financial record, and each method reads and changes state that other methods also use, so a split is a change in how that state is owned. A mistake here is a duplicate write, a lost update or a save reported as failed when it was not (`WRI-3`, `WRI-4`). That is why the split is designed first and gated on evidence.

## What is there now

Measured on 2026-11-18 with the TypeScript compiler: the members of each class, the fields each method touches and the methods each calls.

| Class | Lines | Methods | Mutable fields | Shape |
|---|---|---|---|---|
| `Session` | 1,346 | 45 | 21 | Credentials, loading, saving, workbook tidying and device copy in one class |
| `CheckpointSession` | 562 | 21 | 6 | State, guards, then load, resolve and write |
| `ExpenseSession` | 404 | 16 | 8 | State, guards, then load, save and restore |

All three share one skeleton: a `current` state, `listeners`, a `set()` that replaces the state and notifies, and guard counters (`epoch`, `sequence`, `busy`, `refreshing`, and `generation` in `Session`) that discard the result of a stale asynchronous call. That skeleton is copied three times.

`Session` falls into four groups when its methods are clustered by the fields they use:

| Group | Fields it owns | Methods | About |
|---|---|---|---|
| Access | `token`, `renewal`, `hint`, `chooserOnNextSignIn`, `signingIn`, `lastAutoCheck` | request, validate, drop and persist a token; renewal and stored access | 150 lines |
| Sync | `generation`, `syncSequence`, `verifying`, `connecting`, `freshness` | load, connect, refresh, read back, verify history, restore from the device | 280 lines |
| Tidy | `pendingView`, `pendingTabs`, `quietTimer`, `flushing`, `organizing`, `organizationChecked`, `organizationCheck`, `organizationPending`, `tidied` | organise the workbook, queue and flush view writes | 270 lines |
| Shell | `current`, `listeners`, `deps`, `expenses`, `checkpoints` | construction, `set`, `subscribe`, `state`, `forgetDevice`, `writeRevision` and the blocked messages | 290 lines |

The groups touch each other only through three things: `current` and `generation` (read by all), `accessToken()` (called by Sync, Tidy and the shell) and `set()`.

## The design

1. **One state store, owned in one place.** A small `SessionStore` holds `current`, `generation`, the listeners and `set`, `get`, `subscribe`. The three classes' copied skeleton becomes one generic store with the guard counters, used by `Session`, `CheckpointSession` and `ExpenseSession` alike. State is no longer reachable through hidden `this` fields; each collaborator is handed the store.
2. **Collaborators own their own fields.** `AccessKeeper`, `LedgerSync` and `WorkbookTidy` each own the fields in the table, expose only the methods other groups call, and take the store and a narrow dependency interface. They do not hold another group's fields.
3. **`Session` stays the one public class.** It keeps every public method and signature, so `use-session`, the composition root and every test import exactly what they import today. It constructs the collaborators and delegates. Nothing outside `src/interfaces/web/app/session/` changes.
4. **Writes stay together and last.** `writeRevision` and the commands stay in the shell, with the unknown-outcome handling unchanged (`WRI-3`). They move only after everything around them has moved and been proven.
5. **`CheckpointSession` and `ExpenseSession`** adopt the shared store (which removes their copied skeleton) and split their commands from their load and device-copy code into sibling modules. `ExpenseSession` needs only about 40 lines removed, so the shared store alone may bring it under the limit.

Expected result: every file at or below 400 lines, with `Session` near 300.

## What must not change

- Exported names and signatures of `Session`, `CheckpointSession` and `ExpenseSession`.
- The order of `set()` calls and of listener notifications within every operation.
- The meaning of `generation`, `epoch` and `sequence`: a stale async result is still discarded. Collaborators read them from the store and never keep a copy.
- Idempotency keys, expected revisions, the stale-review outcome and the unknown-outcome path (`WRI-1` to `WRI-4`).
- Timers (`quietTimer`) and the `background` flag behaviour.

## Safety plan, before any code moves

1. **Measure the net first.** Extend the mutation audit (`config/stryker.config.json`) to `src/interfaces/web/app/session/` and record a baseline score for the session code alone. A survivor in `writeRevision` or `save` is a missing test for the write path. Those tests are written first, in their own commits, and the baseline is re-recorded.
2. **Move in order of risk, one class per commit:** `ExpenseSession`, `CheckpointSession`, then `Session` as Tidy, then Access, then Sync, with the shell last. Each commit is a move plus the store, never a logic edit.
3. **Prove each move verbatim.** The token-multiset comparison used in the earlier splits must show only signatures, imports and constructor wiring as changes.
4. **Prove behaviour.** Each commit needs the full gate with the same test count, the seven synthetic journeys and the interaction audit with the same assertion counts, the 15 README screenshots byte-identical, and the session mutation score not below its baseline (`GAT-6`).
5. **Stop on any difference.** An unexplained change in a count, a screenshot or a surviving mutant halts the work and is diagnosed before the next commit (`STD-7`).

## Decisions for the owner

1. **Approach.** Shared store with collaborators that own their fields (this design), or plain operation functions that take an explicit context object. The store reduces the copied skeleton; the functions are a smaller change but leave the three skeletons duplicated.
2. **Mutation baseline for the session code.** Recommended before any move. It costs one run of about ten minutes and may surface missing tests on the write path first.
3. **Order and pace.** One class per session of work, with your review of the first commit before the next, or the whole sequence in one pass.

Until this is decided and done, the three entries stay in the structure record with the reason above, and `npm run verify:structure` still blocks any new violation.
