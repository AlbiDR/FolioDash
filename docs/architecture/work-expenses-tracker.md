# Work expenses tracker: preparation contract

Date: 2026-11-04

Decision: FD-020 in the [decision register](decision-register.md)

Status: Legacy feature parity and preparation authorised; tracker not implemented. Workbook layout and reporting choices below remain proposals unless explicitly identified as confirmed.

## 1. Purpose and scope

The first tracker milestone replaces the owner's simple work-expenses spreadsheet. It is not a general personal-finance expansion. Compatibility and usability take priority: the owner must be able to stop using the old spreadsheet after the replacement passes its acceptance gates.

Confirmed requirements:

- Monday-Friday working-week workflow, with a date and five expense fields: Outbound Commute, Lunch, Inbound Commute, Dinner and Other Expenses.
- Daily and weekly totals including all five fields.
- Average Daily, Average Weekly, Average Monthly, Total Yearly and Yearly Projection.
- A simple Today entry view, previous/next date navigation, and viewing, backfilling and correcting past entries.
- Preserve the difference between an explicit zero cost and an unentered amount. Working does not imply paying for either transport or food.
- Design the daily journey, readable summaries and purposeful microanimations together; interaction feedback is part of the feature requirements.
- Keep the existing portfolio and the working legacy spreadsheet safe.

Custom categories, labels, advanced filters, budgets, bank connections, weekend expense tracking and broader spending analysis are deferred. No new navigation item or empty tracker screen belongs in this preparation change.

The workbook was inspected privately, read-only. No private amounts, rows, original file, screenshots or identifying information are included in this contract or test fixtures. Inspection is not authority to import or modify it.

## 2. Facts and reporting decisions

The five expense fields are the initial fixed categories. A future model should store date-only dates and exact EUR cents through the existing canonical date/money primitives. Spending must not become portfolio cash movements or alter performance calculations. A recorded day can contain confirmed zeroes, amounts and unentered fields without turning unknowns into zeroes.

### Confirmed day interpretation (owner agreement, 2026-11-04)

| Entry state | Meaning and required presentation |
|---|---|
| Past Monday-Friday date with all five fields blank | No work that day; exclude it from workday averages |
| All five fields have amounts, including explicit zeroes | A fully recorded workday; a day with five zeroes counts in workday averages |
| Some fields filled and some blank | Ambiguous entry needing review: possible omission or exception; retain the entered amounts and blanks without guessing |

An empty current or future date is not evidence of a non-working day. Do not automatically fill missing amounts with zero or add a separate completion action as a settled requirement. The meaning and resolution of exceptions, and how unresolved partial days participate in summaries, remain open.

These remaining decisions must be agreed before implementing the tracker calculations:

| Question | What must be explicit |
|---|---|
| Partial day / exception | How the person reviews and resolves omissions or exceptions; participation of unresolved partial days in reports |
| No work / not applicable | Whether exceptions need an explicit status beyond the agreed interpretation of entirely blank past weekdays |
| Average Daily | Exact denominator and treatment of unresolved partial days; fully recorded zero-cost workdays count and blank past weekdays do not |
| Average Weekly | Inclusion of partial weeks, weeks without entries and confirmed zero-cost weeks |
| Average Monthly | Inclusion and weighting of partial months and months without records |
| Total Yearly | Calendar-year boundaries and inclusion of incomplete daily records |
| Yearly Projection | Calendar-day extrapolation versus expected workdays; treatment of partial history, holidays and missing entries; insufficient-data behaviour |
| Week boundaries | Monday-based grouping, weeks crossing month/year boundaries and which year owns each dated expense |
| Numerical display | Rounding of averages/projections while retaining exact recorded cents |

Legacy observations, not formulas to copy blindly: daily totals exclude Other Expenses in some blocks; some weekly totals are text and therefore excluded from numeric recap aggregates. The exported monthly formula contains a Google Sheets-specific function wrapper. The legacy yearly projection scales spending between the first and last recorded daily totals to 365 calendar days. These findings require independent expected examples, not preservation of accidental errors.

Suggested UX, still to design: the familiar five inputs on Today, date navigation and a return-to-today control, a clear Save action and saved/unsaved state. Navigating never creates expenses. Copying previous amounts, if later included, creates an editable draft rather than confirmed spending. Preserve a draft on failed saves or navigation; confirm corrections and retain the recovery path. Do not queue financial writes offline.

### Journey, data clarity and interaction requirements

The owner requires the user journey and clear data visualisation to guide every tracker decision. Design entry, date navigation, review of incomplete days, correction and summary inspection as connected journeys. The person must always understand which date they are editing, what needs attention, whether changes are saved and what each summary includes.

Distinguish no work, a recorded zero-cost workday and a partial day through text and consistent visual treatment, not colour alone. Show review needs where the person enters data and where affected summaries appear. Summaries must expose their period and inclusion rules, with access to the underlying days. Missing data must not appear as a zero in tables or charts.

Every new or changed tracker journey must include purposeful interactions and microanimations using the existing shared tokens and [interaction system](../operations/interactions.md). Examples to evaluate in design are date-change transitions, input focus/press feedback, partial-day review cues, save progress and confirmed-save feedback, and summary selection or disclosure. These are design requirements, not implemented controls. Keep amount text and financial values immediate and stable; motion must not imply a successful save before confirmation, delay entry or shift an active input. All feedback must work with touch and keyboard; reduced motion keeps state changes and meaning immediately visible without animation. The [web quality contract](../operations/web-quality.md) remains the acceptance authority.

## 3. Workbook compatibility proposal

Recommend one user-owned FolioDash spreadsheet file, with separate spending records and readable spending views. The owner leans toward one file; this is a recommendation, not authorisation to provision, migrate or upgrade a live workbook.

The current portfolio ledger remains schema 1 with its existing records and checksums. Its reader rejects unknown committed record types. Do not insert expenses into that log or relax validation to accept them. The spending format, exact tab names and whether it uses a separate checked log or an explicitly versioned shared format remain open. Separate feature records in one file are the preferred direction because they avoid rewriting portfolio history for every daily expense.

Before enabling tracker writes, define and review:

1. Workbook capabilities and version detection, including a legacy portfolio-only workbook and a spending-only workbook. No investment import may be required to start tracking work expenses.
2. A versioned, repeatable upgrade that preserves existing portfolio data and unrelated tabs. Damaged or unsupported records must stop the upgrade; absence is not authority to reset.
3. Behaviour of older clients. They must not silently erase or restore over spending they cannot understand. Existing clients cannot be retroactively made aware of a future format; release/update compatibility must be resolved before enabling it.
4. Per-feature command identity, corrections and revision semantics. Avoid conflicts between independent portfolio and expense saves without losing same-day changes from two devices.
5. Complete export, cache coverage, health checks and consented recovery. The current device copy and restore path cover portfolio figures only, not future spending. A spending-only workbook is not empty. A portfolio-only copy cannot claim to restore an entire future workbook.
6. A read-only legacy import preview with explicit confirmation and reconciliation, if migration is included in the replacement milestone. Preserve zero versus blank and dates; do not execute legacy formulas or overwrite the original spreadsheet. Migration implementation and real-data migration require separate scope/consent.

Readable tabs are projections from confirmed records. Calculations belong in the pure domain model, not independent Google formulas. Formatting/summary failure after a successful financial save means saved records with a view needing repair. Rebuilding a view must preserve meaningful blank and zero states and maintain typed dates, amounts and readable totals.

## 4. Safeguards implemented during preparation

These changes protect the current workbook and do not add tracker persistence:

- New workbooks contain the portfolio ledger header in the spreadsheet creation request itself, followed by a header read-back. There is no separate header-initialisation write to interrupt. A lost creation response remains a failed/unknown call; a later connection searches for the existing file before creating another. This does not guarantee single creation across simultaneous clients or delayed Drive discovery.
- An older incomplete or unrecognised ledger is refused by the normal read path. It is not silently repaired, cleared or adopted from its name.
- Generated views use sheet-scoped developer metadata: key `foliodash.view`, value equal to the stable view role (currently the requested canonical title). Visible names may change; markers identify the target. New view creation, marking, formatting and filling are sent together in one batch.
- An unmarked tab, including one generated by an older FolioDash build, is preserved. A new marked view gets the requested name or the next free numbered suffix, such as `FolioDash (2)`. Subsequent writes reuse that marked view. Unmarked older views can become stale and are not described as current.
- Duplicate/ambiguous role markers, duplicate requested roles and attempts to target the portfolio ledger are refused before the write batch. Ownership markers are accident prevention, not an authorisation or tamper-proof security boundary.
- Generated tabs still contain the existing explicit warning that they are rebuilt. Their contents are not a second financial authority. Existing semantics allowing an owned view to be rebuilt after manual edits remain unchanged.

References: Google documents [spreadsheet creation with a Spreadsheet request body](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/create), [Sheet grid data and developer metadata](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/sheets) and [metadata creation in batchUpdate](https://developers.google.com/workspace/sheets/api/guides/metadata). These describe API contracts; local tests do not prove live account behaviour.

The direct Google write path still has a race after its final stale-state check and before append. A single batch or append request does not provide compare-and-swap across clients. This preparation does not solve that race or claim safe simultaneous financial editing. A defined, tested conflict protocol is a tracker release gate.

## 5. Acceptance and evidence

| Gate | Required proof | Current status |
|---|---|---|
| Preparation safeguards | Synthetic creation interruptions, header checks, unrecognised-ledger preservation, name collisions, renamed views, ambiguous markers and lost view responses | Implemented with automated tests; full verification reported with the change |
| Tracker calculations | Independently calculated examples for all five categories and metrics, zero/missing, partial periods, boundaries and arithmetic bounds | NOT RUN; reporting policy open |
| Tracker workflow | Today/date navigation, drafts, correction/backfill, clear day states and summary inclusion rules, keyboard/touch, microanimation feedback and reduced-motion behaviour | NOT RUN; not implemented |
| Upgrade compatibility | Legacy portfolio preserved, unrelated tabs preserved, repeated/interrupted upgrade and incompatible clients | NOT RUN; future format not selected |
| Financial writes | Idempotent save, read-back, lost acknowledgements, token expiry, quota failure and simultaneous-device conflicts | NOT RUN for spending; not implemented |
| Recovery | Complete round-trip, spending-only data, damaged records, partial-copy refusal and confirmed recovery without overwriting other history | NOT RUN for spending; not implemented |
| Real Google | Synthetic workbook creation, metadata persistence/discovery, typed values, rendering and authorised save/read-back from supported devices | NOT RUN for these preparation changes |
| Legacy replacement | Approved read-only reconciliation of legacy entries and independently defined summaries, followed by owner acceptance | NOT RUN; no migration authorised |

No tracker tabs, expense services, schema migrations, production dependencies, live Google operations or legacy data imports are created by this preparation. The next feature work begins from this contract and the open decisions, rather than extending a placeholder implementation.
