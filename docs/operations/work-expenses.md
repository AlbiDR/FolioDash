# Work expenses: implementation and acceptance

Date: 2026-11-05

Status: Implemented locally under the owner's explicit tracker implementation request. Automated and local production-renderer evidence is recorded below. Live expense writes to Google, physical-device and screen-reader acceptance remain separate and unverified. No legacy workbook was imported or modified.

## Product and user journey

Expenses is a peer of Portfolio, Import and Your data in the existing responsive navigation. Portfolio retains its investment narrative and calculations. Both features use the same shell, privacy choice, visual tokens and Google connection. The tracker does not require a portfolio statement.

The bento hierarchy follows record a day, review the week, understand the pattern. The five-field editor and its week context lead. The three averages, annual actual/estimate, disclosed category analysis and browsable record follow. Phone cards reflow in the same order; secondary setup guidance follows the demo rather than displacing the editor. Date selection, displayed week and reporting year have visible independent scopes.

Today, previous/next workday and a date picker support entry and backfill. Future dates and weekends can be inspected but cannot receive confirmed expense writes. No costs today fills an empty draft with five zeroes; Save remains explicit. Partially filled days can be saved with a clear Needs review state. Navigation and app updates protect dirty drafts and unresolved writes. Reload recovery is provided for uncertain submitted commands, not ordinary unsaved drafts; the browser warns before leaving an unsaved draft.

Existing-day changes require a correction preview and confirmation. Clearing every amount explicitly changes a past day to no work. Prior saved versions can be inspected and reused as a new reviewed correction; original records remain in history. Concurrent same-day versions require explicit selection, review and resolution. Privacy hides readouts and alternate representations; editing requires an intentional reveal. Reduced motion retains immediate state feedback and all functionality.

## Versioned reporting choices

`work-expenses-v1` is the canonical implementation in `src/core/WorkExpenses.ts`. These are visible initial implementation rules, not a claim that every former open policy was independently accepted by the owner. The averaging method is selectable in the UI; no private legacy formula is executed.

| Metric / state | Implemented definition |
|---|---|
| Recorded workday | All five amounts are present, including explicit zeroes |
| No work | All five amounts blank on a past weekday within tracked history; a saved all-blank correction is retained as evidence |
| Partial day | At least one amount and at least one blank; preserve known amounts and flag review |
| Tracked history | Begins at the earliest recorded date, including a retained all-blank correction; dates before coverage are labelled Before tracking |
| Average Daily | Sum on fully recorded days through Today divided by their count; zero-cost workdays count, partial days do not |
| Average Weekly: completed periods | Mean recorded total for past Monday-Friday weeks wholly within the selected year and tracked coverage; at least one fully recorded day, no partial days |
| Average Monthly: completed periods | Mean recorded total for completed calendar months wholly within tracked coverage; at least one fully recorded day, no partial days |
| Typical-week alternative | Unrounded daily ratio multiplied by five |
| Typical-month alternative | Unrounded daily ratio multiplied by the selected year's weekday count divided by twelve |
| Total Yearly | All known amounts in the selected calendar year through Today, including partial entries; missing-field coverage is shown |
| Yearly Projection | Unrounded daily ratio multiplied by the selected year's Monday-Friday count; labelled estimate, without holiday/leave adjustment |
| Missing report baseline | Dash with explanation; no invented zero or eligible period |
| Unresolved conflict | Disputed day remains separate; affected week/year totals and metrics are withheld until review |

Cross-year weeks are excluded from completed-week averages rather than assigned arbitrarily; each expense still belongs to its actual calendar year. No-work-only periods do not become recorded zero-cost weeks/months. Expense amounts are nonnegative exact EUR cents; overflow makes a result unavailable. Ratios round half-up once to cents, including scaled estimates, rather than scaling an already rounded daily figure. Date arithmetic is pure civil-date arithmetic. The app supplies Today from the device's local calendar date; a selected date and draft are not reassigned at midnight.

Exceptions with a genuinely nonapplicable field remain partial entries for review; there is no invented not-applicable-to-zero conversion. Broader categorisation, weekend expense entry, budgets and legacy import are outside this implementation.

## Google workbook and compatibility

Expense persistence uses the existing authenticated `drive.file` route and user-owned FolioDash workbook. No additional credential, scope, cloud resource or hosted service is introduced. The portfolio row format stays schema 1. Expense commands use their own version 1 checked append-only log, separate from portfolio records.

An explicit first save atomically creates a hidden expense log, typed header and ownership metadata. Name collisions preserve unowned tabs. Discovery follows the metadata when an owned tab is renamed. An anchor on the portfolio ledger detects deletion of the expense log even on a fresh device; missing or ambiguous ownership stops writing. Generic generated-view writes cannot target an expense records tab.

Each command has its own id, date, exact five amounts and expected per-day revision. Checksummed payloads retain every correction. Independent-day saves coexist. Same-day branches preserve all versions and yield a conflict token covering the current versions; a reviewed resolution must acknowledge that token. Financial reports never select an arbitrary branch. There is no claim of a Google compare-and-swap lock: another write can arrive after an acknowledgement, and later reads must surface any resulting branch.

Unknown append outcomes retain the original immutable request, including across reload. Checking an outcome reads the original command and does not append again. Setup failure before a command was submitted is distinguished from an uncertain append. A confirmed financial save and a failed readable-view rebuild have different UI messages. The readable Work expenses view contains real dates, numeric EUR values, meaningful blanks, weekly totals and canonical annual recap figures as of the supplied Today.

Existing portfolio clients do not write expense commands. Their portfolio-only device copy is not a complete expense backup. New code maintains a separate workbook-bound checked expense copy and discloses recovery coverage in Your data. A known cached correction cannot disappear from a later read without stopping writes and preserving the cache. A fresh device cannot prove that an otherwise valid tail was removed before its first observation; checksums do not prove completeness against an unobserved past.

## Export and recovery

Your data offers a versioned JSON expense backup containing every command, retained correction and unresolved branch with a checksum. File selection validates and previews coverage without writing. An explicit checkbox and Restore action publish the full history atomically into a verified empty expense store. An absent store is created with its records in one batch; an existing valid store with zero commands receives one append without clearing or recreating its header or ownership markers. Existing nonempty or damaged histories are refused, and portfolio data is preserved. This recovery does not merge histories or overwrite a working expense store.

The restore screen explains each unmet requirement: Google connection, expense-record check, confirmation, existing history or an unresolved operation. Connect and check expense records preserves the selected file and consent while establishing readiness. Failed reads show their reason and a check action instead of leaving Restore silently disabled. Concurrent background and explicit checks share one in-flight read; a connection failure does not discard the selected backup or known device history.

A lost recovery response is reconciled against the original commands, including legitimate later additions. It is never blindly resubmitted, including after reload. Backup selection cannot replace an unresolved recovery request. Old or altered backups that omit locally known corrections cannot silently replace the device copy. In-flight replies after Forget this device cannot repopulate forgotten data. Forget clears both feature copies and pending requests; the Google workbook is untouched.

Consented workbook restoration includes cached expense correction history when a missing workbook is replaced, including spending-only accounts. Portfolio figures still exclude original bank-source statements from their existing device copy, as disclosed before restoration. The two feature recoveries are separately confirmed: a failure after portfolio restoration reports that partial result rather than declaring the whole workbook restored. Unknown expense outcomes block workbook recovery until checked.

## Evidence and remaining acceptance

Verification on 2026-11-05: `npm run verify` passed with 712 tests across 55 files, type checks, strict lint, repository/contributor/punctuation policies and production/PWA/retained Apps Script builds. The final production Chrome rerun passed all 36 layout and interaction assertions. Independent calculation, storage/session and rendered-UI reviews informed fixes before this passing run; they are not live-provider acceptance.

Restore follow-up on the same date: a selected valid backup could leave Restore disabled with no reason in device-copy mode or after a failed expense read; an owned empty log was also treated as populated. The connection/check action, visible blocked reasons and verified-empty-store recovery above fix those cases. `npm run verify` passed with 721 tests. A separate production-renderer harness passed 23 assertions across fresh synthetic absent-store, initialized-empty and lost-response profiles, using the real file input, confirmation, app/session and checked storage against FakeGoogle. It exercised a 220-command backup, retained file/consent through a failed read and reconnect, preserved portfolio records, refused populated history and checked an unknown response without re-appending. This is not a live Google write test. The session probes are `/tmp/foliodash-restore-browser.mjs` and `/tmp/foliodash-restore-bootstrap.ts`, outside the repository and containing synthetic data only.

Automated evidence uses invented data only:

- Canonical numeric/date cases cover zero-only and partial-only records, all categories, cross-year/week/month boundaries, leap years, rounding and overflow.
- Storage cases cover atomic setup/recovery, lost acknowledgements, command replay, stale revisions, same/different-day concurrency, explicit branch resolution, corruption, marker/name collisions, deleted-log detection and readable values.
- Device/session cases cover workbook binding, forgotten accounts, in-flight and stale reads, pending-write/recovery reload, rollback detection, full history export, spending-only and combined portfolio/expense restoration.
- Entry-boundary cases preserve blank versus zero, Italian amount parsing and meaningful draft changes. Repository types, lint, dependency boundaries, builds, PWA and retained Apps Script checks remain required through `npm run verify`.

Local production Chrome checks exercise the real renderer with the labelled in-memory demo at 320, 390, 760 and 1440 CSS pixels in light/dark, reduced motion and 200% root text. They cover navigation targets, form/amount overflow, zero/partial saves, draft guards, correction review, previous-version recovery, privacy reveal, keyboard interaction and the four main destinations. Browser probes and screenshots live outside the repository; they are session evidence rather than a committed browser CI suite. The production demo writes only to component memory and is visibly separate from private records.

Not verified by those checks: real expense Google authorisation, provider metadata persistence/quotas/latency, actual two-device Google races, physical phone keyboard/smoothness, screen-reader wording and Firefox/WebKit support. No migration or live private-data write was performed. Those release gates retain their scope from the [preparation contract](../architecture/work-expenses-tracker.md) and [web quality contract](web-quality.md).

API references checked during implementation: Google's [batch update contract](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate), [values append](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append), and [developer metadata guide](https://developers.google.com/workspace/sheets/api/guides/metadata). These explain the protocol; the synthetic adapter tests do not substitute for real-provider acceptance.
