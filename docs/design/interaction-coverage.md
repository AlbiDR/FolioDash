# Interaction coverage

Owner direction, 2026-11-10: every element a person can click, tap, focus, edit, select, expand, drag or dismiss receives perceptible feedback. This document owns coverage and outstanding opportunities. [Interaction history](../operations/interactions.md) records earlier additions; its animation counts do not establish coverage.

## Contract

Every semantic control inherits `shared/ui/control-feedback.css`, imported after the component styles. Actions have a visible hover/focus boundary and two-pixel lift, a three-percent press compression and brightness response, and animated release. Inline links receive the animated boundary without changing paragraph layout. Fields animate their border and focus halo; checkbox/radio glyphs scale on inspection/press and retain native checked semantics. Sliders have focus/drag and thumb feedback. Disclosure summaries respond as controls and their content transitions both ways. SVG controls respond through brightness/opacity/stroke emphasis; financial coordinates, bar lengths and allocation angles stay exact. Scrollable regions have animated inspection and focus boundaries. Disabled controls transition to their unavailable state and never receive enabled press/hover movement.

Focus outlines, accessibility state, disabled state, privacy hiding, validation and financial values update immediately. Reduced motion removes transitions and movement while preserving visible state changes. Touch feedback does not depend on sticky hover. Native browser/OS surfaces (the file chooser, date/calendar popup and select menu) retain platform behavior; their web controls receive the contract. Static labels, reading containers and programmatic-focus headings are outside this interactive inventory.

Each interaction must be inspected through rest, hover where supported, keyboard focus, press, release, selection/change, result, reversal/repeated input, disabled/pending/error where applicable, and reduced motion. A matching CSS selector is implementation coverage, not proof of perceptibility or a complete visual review.

## Discovery and maintenance

- `npm run inventory:interactions` regenerates the source table after inspecting the changes. IDs use the source file and control-template signature, with duplicate occurrences distinguished. Line moves keep identity; changed labels, attributes or handlers change identity.
- `npm run verify:interactions`, included in `npm run verify`, fails for a stale table or a custom click target without semantic control ownership. It includes conditional controls, repeated templates, SVG marks, static HTML links and scroll targets. It excludes delegated event containers and headings with only programmatic focus.
- `npm run audit:interactions` exercises the production synthetic demo in a fresh local-only Chrome session and writes a rendered-control report under ignored `dist/interaction-audit/`. It fails on an unclassified rendered control or missing animated feedback, then checks the period selector through its resulting chart update. Browser reports contain only invented demo labels, never real account data.
- Review notes in the last source-table column are retained for unchanged IDs. New or changed controls start with STATES OPEN; generation never upgrades them to verified.
- New controls must appear in the source inventory and rendered discovery when their state is visited. Source entries start without browser-state proof. Record unavailable conditional journeys explicitly; do not infer full coverage from another button of the same family.

## Findings and fixes

| Finding | Change | Evidence |
|---|---|---|
| Changing period remounted the whole chart, including the range selector, preventing a continuous pill transition and losing control focus | Keep the chart/selector mounted on Portfolio and Fund; update only plotted geometry with a short opacity cue | PASS: P1 production-browser checks |
| General tonal buttons, inline links and some native fields had only isolated state feedback; specialized transition declarations could omit properties used by their existing pressed state | A final shared semantic control contract supplies reversible hover/focus/press/release feedback across control families | PASS: B1 rendered-control sampling |
| Existing lists counted additions without discovering newly introduced controls | AST source inventory and CI staleness gate, plus semantic browser discovery | Deliberate uncovered-control and stale-inventory regression tests |

## Browser evidence and remaining work

Source discovery classifies all 165 templates in 22 files. It does not mark every conditional state visually verified. The final table column retains specific reviews and leaves unvisited states OPEN. Static discovery cannot infer arbitrary programmatic listeners or spread-only semantics; use native controls or explicit roles and extend the discovery tests before adding a new interaction mechanism.

| Evidence | Scope checked | Remaining opportunities / proof |
|---|---|---|
| P1: period-to-chart journey | Stable selector/chart identity and focus on Portfolio and Fund; sliding pill; selection and one tab stop; exact paths during chart fade; active-period reselect; arrows, Home/End, Enter/Space; rapid changes; RTL direction and pill alignment; reduced motion and still press; hidden-amount range cue and immediate privacy cancellation | Physical touch/keyboard and other engines; subjective owner review of timing |
| B1: shared control states | Desktop and phone rendered discovery; family classification; animated property changes for hover/focus or chart touch press; press feedback for action/choice/mark families; release back to original state; disabled controls retain an unavailable state | Every conditional pending/error/result sequence still needs its own owner-journey evidence; a family sample is not full per-template acceptance |
| Portfolio and Months | Typical and twelve-fund variants, search, open analysis and chart tools, chart marks, allocation links, month picker, scroll regions, phone touch inspection | Additional portfolio data shapes, screen readers and physical devices |
| Import | Native file control, generated synthetic XLSX history selection review, manual fields, remove/undo notice, JSON disclosure | Later cash-answer phases, Google save, uncertain outcome and restore sequences remain OPEN |
| Expenses | Demo entry, week/record controls, expanded tools and correction review without confirming a save | Real pending saves, conflicting versions, backup/restore and provider errors remain OPEN |
| Your data and Privacy | Signed-out connection/client-ID controls; all eight public privacy links | Signed-in sync/verification/maintenance/forget/restore outcomes remain OPEN |

The audit is available as `npm run audit:interactions` after a production build, and runs in the Node 22 CI job before release artifact assembly. It uses a fresh profile, bypasses service workers and blocks nonlocal page requests. It generates only synthetic onboarding files. The ignored report is `dist/interaction-audit/report.json`. CSS pseudo-state sampling checks that the changed visual properties have nonzero transitions and that release settles back to the original state; the period keys/clicks and phone chart touch use actual browser input. It does not replace visual taste, real Google or physical-device verification.

Local evidence, 2026-11-10: Chrome production renderer, signed-out synthetic data, 1440px desktop and 390px phone, normal/reduced motion. `npm run audit:interactions` passed 39 journey assertions and 563 rendered-control samples across 18 visited states, with no unclassified rendered controls, missing property transitions or stuck release states. These are repeated control samples across screens, not 563 unique controls. All eight families are represented: action, period-option, field, choice, slider, chart-mark, chart-inspection and scroll-region. Physical-device, other-engine, screen-reader and provider acceptance remain separate.

## Source inventory

One row is a source template; a fund-link template can render many controls. All rows must receive the relevant shared contract. Each row's pending, selected, error and dismissal states remain part of its owner journey even when not present in the initial DOM.

<!-- interaction-inventory:start -->

| ID | Source | Element / family | Control or context | State review |
|---|---|---|---|---|
| 86bb83f78abe-1 | [App.tsx:226](../../src/interfaces/web/app/App.tsx#L226) | a / action | Skip to content | SOURCE CLASSIFIED; STATES OPEN |
| 3bfe6fff2b29-1 | [App.tsx:235](../../src/interfaces/web/app/App.tsx#L235) | a / action | nav-link | SOURCE CLASSIFIED; STATES OPEN |
| da009fee0732-1 | [App.tsx:248](../../src/interfaces/web/app/App.tsx#L248) | button / action | icon-button sidebar-toggle | SOURCE CLASSIFIED; STATES OPEN |
| 6575b250d5c3-1 | [App.tsx:262](../../src/interfaces/web/app/App.tsx#L262) | a / action | Back to Portfolio | SOURCE CLASSIFIED; STATES OPEN |
| a10fd3f7a2ba-1 | [App.tsx:271](../../src/interfaces/web/app/App.tsx#L271) | button / action | {source.label} | SOURCE CLASSIFIED; STATES OPEN |
| 4fadac329f30-1 | [App.tsx:276](../../src/interfaces/web/app/App.tsx#L276) | a / action | {source.label} | SOURCE CLASSIFIED; STATES OPEN |
| e9f1737c87e0-1 | [App.tsx:292](../../src/interfaces/web/app/App.tsx#L292) | button / action | Reload to update | SOURCE CLASSIFIED; STATES OPEN |
| cc8374a68917-1 | [App.tsx:304](../../src/interfaces/web/app/App.tsx#L304) | a / action | See what to do | SOURCE CLASSIFIED; STATES OPEN |
| 0ae4a332d365-1 | [App.tsx:311](../../src/interfaces/web/app/App.tsx#L311) | a / action | Your data | SOURCE CLASSIFIED; STATES OPEN |
| 7830fcf45616-1 | [App.tsx:314](../../src/interfaces/web/app/App.tsx#L314) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| d1b5caf7a0bd-1 | [App.tsx:366](../../src/interfaces/web/app/App.tsx#L366) | summary / action | Explore demo portfolios | SOURCE CLASSIFIED; STATES OPEN |
| ff1efa7f6ad1-1 | [App.tsx:372](../../src/interfaces/web/app/App.tsx#L372) | a / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 4b205198dc1e-1 | [App.tsx:399](../../src/interfaces/web/app/App.tsx#L399) | summary / action | Import an existing FolioDash JSON history file | SOURCE CLASSIFIED; STATES OPEN |
| a84d603e0083-1 | [AccountView.tsx:127](../../src/interfaces/web/features/account/AccountView.tsx#L127) | button / action | primary | SOURCE CLASSIFIED; STATES OPEN |
| d2c1f7c2e15c-1 | [AccountView.tsx:142](../../src/interfaces/web/features/account/AccountView.tsx#L142) | a / action | Open in Google Sheets | SOURCE CLASSIFIED; STATES OPEN |
| 340a47c93acd-1 | [AccountView.tsx:167](../../src/interfaces/web/features/account/AccountView.tsx#L167) | button / action | primary | SOURCE CLASSIFIED; STATES OPEN |
| f9f02dcf602a-1 | [AccountView.tsx:174](../../src/interfaces/web/features/account/AccountView.tsx#L174) | button / action | Reconnect with Google | SOURCE CLASSIFIED; STATES OPEN |
| 001918fc3d37-1 | [AccountView.tsx:175](../../src/interfaces/web/features/account/AccountView.tsx#L175) | button / action | Use a different Google account | SOURCE CLASSIFIED; STATES OPEN |
| fc05a936c8c9-1 | [AccountView.tsx:184](../../src/interfaces/web/features/account/AccountView.tsx#L184) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 383c3dfd904e-1 | [AccountView.tsx:197](../../src/interfaces/web/features/account/AccountView.tsx#L197) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 1cb2b8595051-1 | [AccountView.tsx:215](../../src/interfaces/web/features/account/AccountView.tsx#L215) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 63597cc1fbdf-1 | [AccountView.tsx:225](../../src/interfaces/web/features/account/AccountView.tsx#L225) | button / action | primary | SOURCE CLASSIFIED; STATES OPEN |
| 3cf4f25191b0-1 | [AccountView.tsx:252](../../src/interfaces/web/features/account/AccountView.tsx#L252) | button / action | Yes, forget this device | SOURCE CLASSIFIED; STATES OPEN |
| 161f99a4773d-1 | [AccountView.tsx:264](../../src/interfaces/web/features/account/AccountView.tsx#L264) | button / action | Keep it | SOURCE CLASSIFIED; STATES OPEN |
| 60e960948fc2-1 | [AccountView.tsx:277](../../src/interfaces/web/features/account/AccountView.tsx#L277) | button / action | Forget this device | SOURCE CLASSIFIED; STATES OPEN |
| 89aba6e5ab63-1 | [AccountView.tsx:291](../../src/interfaces/web/features/account/AccountView.tsx#L291) | summary / action | How staying connected works | SOURCE CLASSIFIED; STATES OPEN |
| 40b02da8f303-1 | [AccountView.tsx:291](../../src/interfaces/web/features/account/AccountView.tsx#L291) | a / action | Privacy policy | SOURCE CLASSIFIED; STATES OPEN |
| 82a0cea1caa2-1 | [AccountView.tsx:296](../../src/interfaces/web/features/account/AccountView.tsx#L296) | summary / action | Advanced: Google client ID | SOURCE CLASSIFIED; STATES OPEN |
| b17867e45ea1-1 | [AccountView.tsx:303](../../src/interfaces/web/features/account/AccountView.tsx#L303) | input / field | client-id | SOURCE CLASSIFIED; STATES OPEN |
| e9abdd4e5d5a-1 | [AccountView.tsx:319](../../src/interfaces/web/features/account/AccountView.tsx#L319) | button / action | Save client ID | SOURCE CLASSIFIED; STATES OPEN |
| 0a73764b8ca3-1 | [GetStarted.tsx:32](../../src/interfaces/web/features/account/GetStarted.tsx#L32) | button / action | primary | SOURCE CLASSIFIED; STATES OPEN |
| 52ec4b541dc0-1 | [GetStarted.tsx:39](../../src/interfaces/web/features/account/GetStarted.tsx#L39) | summary / action | How setup works | SOURCE CLASSIFIED; STATES OPEN |
| 851794683e90-1 | [GetStarted.tsx:48](../../src/interfaces/web/features/account/GetStarted.tsx#L48) | a / action | Privacy policy | SOURCE CLASSIFIED; STATES OPEN |
| 193bcc8c5185-1 | [ExpenseDataTools.tsx:84](../../src/interfaces/web/features/expenses/ExpenseDataTools.tsx#L84) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| fe9391cd1caf-1 | [ExpenseDataTools.tsx:86](../../src/interfaces/web/features/expenses/ExpenseDataTools.tsx#L86) | button / action | Download expense backup | SOURCE CLASSIFIED; STATES OPEN |
| 4dc4fbc5afa8-1 | [ExpenseDataTools.tsx:87](../../src/interfaces/web/features/expenses/ExpenseDataTools.tsx#L87) | summary / action | Restore an expense backup | SOURCE CLASSIFIED; STATES OPEN |
| 50d4f1e89372-1 | [ExpenseDataTools.tsx:89](../../src/interfaces/web/features/expenses/ExpenseDataTools.tsx#L89) | input / field | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 551f27ed6d52-1 | [ExpenseDataTools.tsx:91](../../src/interfaces/web/features/expenses/ExpenseDataTools.tsx#L91) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 79cd0ba18dc5-1 | [ExpenseDataTools.tsx:94](../../src/interfaces/web/features/expenses/ExpenseDataTools.tsx#L94) | button / action | Restore expense history | SOURCE CLASSIFIED; STATES OPEN |
| 3e71dbdd97e2-1 | [ExpenseDataTools.tsx:96](../../src/interfaces/web/features/expenses/ExpenseDataTools.tsx#L96) | button / action | Check original recovery or save | SOURCE CLASSIFIED; STATES OPEN |
| 343bb5eff8dc-1 | [ExpensesView.tsx:244](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L244) | input / field | {'expense-${String(index)}'} | SOURCE CLASSIFIED; STATES OPEN |
| e7cc62953d01-1 | [ExpensesView.tsx:263](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L263) | button / action | Continue with Google | SOURCE CLASSIFIED; STATES OPEN |
| 5de2e65388d7-1 | [ExpensesView.tsx:264](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L264) | button / action | Check records | SOURCE CLASSIFIED; STATES OPEN |
| b7732dcd0e6a-1 | [ExpensesView.tsx:264](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L264) | button / action | Reconnect with Google | SOURCE CLASSIFIED; STATES OPEN |
| d4e0ebe403ac-1 | [ExpensesView.tsx:265](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L265) | button / action | Check original save | SOURCE CLASSIFIED; STATES OPEN |
| b16e9fb038d2-1 | [ExpensesView.tsx:271](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L271) | button / action | {stepName("Previous", previousDay)} | SOURCE CLASSIFIED; STATES OPEN |
| 3cd593088545-1 | [ExpensesView.tsx:272](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L272) | button / action | Today | SOURCE CLASSIFIED; STATES OPEN |
| f0e7212a91d3-1 | [ExpensesView.tsx:273](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L273) | button / action | {stepName("Next", nextDay)} | SOURCE CLASSIFIED; STATES OPEN |
| 2da83eaad072-1 | [ExpensesView.tsx:274](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L274) | input / field | Jump to date | SOURCE CLASSIFIED; STATES OPEN |
| b8a5a80f74b5-1 | [ExpensesView.tsx:276](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L276) | button / action | {'Previous workday, ${workdayLabel(previousWorkday)}'} | SOURCE CLASSIFIED; STATES OPEN |
| 01fe7eb447cc-1 | [ExpensesView.tsx:276](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L276) | button / action | {'Next workday, ${workdayLabel(nextWorkday)}'} | SOURCE CLASSIFIED; STATES OPEN |
| 3c0c445d1658-1 | [ExpensesView.tsx:288](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L288) | button / action | primary expense-save-button | SOURCE CLASSIFIED; STATES OPEN |
| 2542739d993c-1 | [ExpensesView.tsx:288](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L288) | button / action | Show amounts to edit | SOURCE CLASSIFIED; STATES OPEN |
| ffc8cca69bee-1 | [ExpensesView.tsx:288](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L288) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 1bbe7a2f4dbb-1 | [ExpensesView.tsx:288](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L288) | button / action | Discard draft | SOURCE CLASSIFIED; STATES OPEN |
| 854dce7db306-1 | [ExpensesView.tsx:289](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L289) | button / action | Confirm correction | SOURCE CLASSIFIED; STATES OPEN |
| e8e7319ba47e-1 | [ExpensesView.tsx:289](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L289) | button / action | Keep editing | SOURCE CLASSIFIED; STATES OPEN |
| 86611794a4c4-1 | [ExpensesView.tsx:290](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L290) | button / action | Keep editing | SOURCE CLASSIFIED; STATES OPEN |
| 1dbfb1fe79af-1 | [ExpensesView.tsx:290](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L290) | button / action | Save this day | SOURCE CLASSIFIED; STATES OPEN |
| 93458b64c576-1 | [ExpensesView.tsx:290](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L290) | button / action | Discard and open day | SOURCE CLASSIFIED; STATES OPEN |
| f6daa9cf291f-1 | [ExpensesView.tsx:291](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L291) | button / action | Check save outcome | SOURCE CLASSIFIED; STATES OPEN |
| 0bf508803f1d-1 | [ExpensesView.tsx:292](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L292) | summary / action | Previous saved versions | SOURCE CLASSIFIED; STATES OPEN |
| 6e0b766cbc3d-1 | [ExpensesView.tsx:292](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L292) | summary / action | Earlier version | SOURCE CLASSIFIED; STATES OPEN |
| af19dc5408ed-1 | [ExpensesView.tsx:292](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L292) | button / action | Use these amounts | SOURCE CLASSIFIED; STATES OPEN |
| d7389867d9f5-1 | [ExpensesView.tsx:295](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L295) | button / action | Previous week | SOURCE CLASSIFIED; STATES OPEN |
| 734a41752601-1 | [ExpensesView.tsx:295](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L295) | button / action | Next week | SOURCE CLASSIFIED; STATES OPEN |
| a437b72a73b3-1 | [ExpensesView.tsx:296](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L296) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 165de371be4d-1 | [ExpensesView.tsx:298](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L298) | a / action | Review incomplete or conflicting days | SOURCE CLASSIFIED; STATES OPEN |
| bb71a8efe800-1 | [ExpensesView.tsx:304](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L304) | select / field | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 68aee71952ec-1 | [ExpensesView.tsx:318](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L318) | summary / action | Where it goes | SOURCE CLASSIFIED; STATES OPEN |
| fdfd9d3224ae-1 | [ExpensesView.tsx:319](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L319) | summary / action | How these summaries work | SOURCE CLASSIFIED; STATES OPEN |
| 302b84d1de9a-1 | [ExpensesView.tsx:319](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L319) | select / field | expense-policy | SOURCE CLASSIFIED; STATES OPEN |
| a364d2a84f80-1 | [ExpensesView.tsx:322](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L322) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| f63df59a2251-1 | [ExpensesView.tsx:322](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L322) | select / field | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 685250da7bf6-1 | [ExpensesView.tsx:322](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L322) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 0bafa83c7063-1 | [ExpensesView.tsx:323](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L323) | summary / action | Version | SOURCE CLASSIFIED; STATES OPEN |
| d66912dcba75-1 | [ExpensesView.tsx:323](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L323) | button / action | Review this version | SOURCE CLASSIFIED; STATES OPEN |
| b3a5a41c37f1-1 | [ExpensesView.tsx:325](../../src/interfaces/web/features/expenses/ExpensesView.tsx#L325) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 69c450a03734-1 | [HistoryView.tsx:200](../../src/interfaces/web/features/history/HistoryView.tsx#L200) | input / field | history-file | SOURCE CLASSIFIED; STATES OPEN |
| 499b0198d43e-1 | [HistoryView.tsx:238](../../src/interfaces/web/features/history/HistoryView.tsx#L238) | button / action | primary | SOURCE CLASSIFIED; STATES OPEN |
| a5a93b862651-1 | [HistoryView.tsx:274](../../src/interfaces/web/features/history/HistoryView.tsx#L274) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| ceab431b5293-1 | [HistoryView.tsx:289](../../src/interfaces/web/features/history/HistoryView.tsx#L289) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 3dfd94c94301-1 | [CashQuestions.tsx:110](../../src/interfaces/web/features/import/CashQuestions.tsx#L110) | input / field | {props.id} | SOURCE CLASSIFIED; STATES OPEN |
| 162651b70a59-1 | [CashQuestions.tsx:287](../../src/interfaces/web/features/import/CashQuestions.tsx#L287) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| c978e4f9d3fb-1 | [CashQuestions.tsx:290](../../src/interfaces/web/features/import/CashQuestions.tsx#L290) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| c32117f4d096-1 | [CashQuestions.tsx:330](../../src/interfaces/web/features/import/CashQuestions.tsx#L330) | input / field | {id("name")} | SOURCE CLASSIFIED; STATES OPEN |
| 035afa5903bf-1 | [CashQuestions.tsx:338](../../src/interfaces/web/features/import/CashQuestions.tsx#L338) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| a6b6e9bd19f5-1 | [CashQuestions.tsx:341](../../src/interfaces/web/features/import/CashQuestions.tsx#L341) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 928e212328d9-1 | [CashQuestions.tsx:352](../../src/interfaces/web/features/import/CashQuestions.tsx#L352) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 581103870bcd-1 | [CashQuestions.tsx:355](../../src/interfaces/web/features/import/CashQuestions.tsx#L355) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| fc5aa7fbc428-1 | [CashQuestions.tsx:364](../../src/interfaces/web/features/import/CashQuestions.tsx#L364) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| b95e2f3c4474-1 | [CashQuestions.tsx:422](../../src/interfaces/web/features/import/CashQuestions.tsx#L422) | button / action | primary | SOURCE CLASSIFIED; STATES OPEN |
| 9309626b5533-1 | [CashQuestions.tsx:454](../../src/interfaces/web/features/import/CashQuestions.tsx#L454) | button / action | Check what happened | SOURCE CLASSIFIED; STATES OPEN |
| f648a1ac4d45-1 | [CashQuestions.tsx:462](../../src/interfaces/web/features/import/CashQuestions.tsx#L462) | button / action | Check what happened | SOURCE CLASSIFIED; STATES OPEN |
| f20fb9349b3d-1 | [ExcelHistoryView.tsx:167](../../src/interfaces/web/features/import/ExcelHistoryView.tsx#L167) | button / action | Exclude statements from months already recorded or earlier | SOURCE CLASSIFIED; STATES OPEN |
| a7985c3279f3-1 | [ExcelHistoryView.tsx:176](../../src/interfaces/web/features/import/ExcelHistoryView.tsx#L176) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| c175e768fc98-1 | [ExcelHistoryView.tsx:177](../../src/interfaces/web/features/import/ExcelHistoryView.tsx#L177) | input / field | {'batch-date-${entry.id}'} | SOURCE CLASSIFIED; STATES OPEN |
| ef38e5e8bde8-1 | [ExcelHistoryView.tsx:182](../../src/interfaces/web/features/import/ExcelHistoryView.tsx#L182) | button / action | Review selected statements in date order | SOURCE CLASSIFIED; STATES OPEN |
| f3eb338cffb2-1 | [ExcelHistoryView.tsx:186](../../src/interfaces/web/features/import/ExcelHistoryView.tsx#L186) | summary / action | Checked readings from this sheet | SOURCE CLASSIFIED; STATES OPEN |
| 91bfb511f7ef-1 | [ExcelHistoryView.tsx:202](../../src/interfaces/web/features/import/ExcelHistoryView.tsx#L202) | button / action | Confirm and save statements | SOURCE CLASSIFIED; STATES OPEN |
| 9ae6ad466075-1 | [ExcelHistoryView.tsx:213](../../src/interfaces/web/features/import/ExcelHistoryView.tsx#L213) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 20c0fa75f6b2-1 | [ExcelHistoryView.tsx:214](../../src/interfaces/web/features/import/ExcelHistoryView.tsx#L214) | button / action | Resume remaining statements | SOURCE CLASSIFIED; STATES OPEN |
| 5f01b4cb9bd2-1 | [ExcelHistoryView.tsx:216](../../src/interfaces/web/features/import/ExcelHistoryView.tsx#L216) | a / action | View your portfolio | SOURCE CLASSIFIED; STATES OPEN |
| 8409cc5c50b2-1 | [ExcelHistoryView.tsx:218](../../src/interfaces/web/features/import/ExcelHistoryView.tsx#L218) | button / action | Previous statement (keep answers) | SOURCE CLASSIFIED; STATES OPEN |
| 1b70e1f77040-1 | [ExcelHistoryView.tsx:219](../../src/interfaces/web/features/import/ExcelHistoryView.tsx#L219) | button / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 69152a5dd9c5-1 | [ImportView.tsx:178](../../src/interfaces/web/features/import/ImportView.tsx#L178) | input / field | statement-date | SOURCE CLASSIFIED; STATES OPEN |
| ae498c8dad4d-1 | [ImportView.tsx:204](../../src/interfaces/web/features/import/ImportView.tsx#L204) | select / field | sheet-choice | SOURCE CLASSIFIED; STATES OPEN |
| 2237d7e73393-1 | [ImportView.tsx:358](../../src/interfaces/web/features/import/ImportView.tsx#L358) | button / action | Import Excel | SOURCE CLASSIFIED; STATES OPEN |
| 2f10630fb5c6-1 | [ImportView.tsx:359](../../src/interfaces/web/features/import/ImportView.tsx#L359) | button / action | Enter manually | SOURCE CLASSIFIED; STATES OPEN |
| 1672104f17d7-1 | [ImportView.tsx:367](../../src/interfaces/web/features/import/ImportView.tsx#L367) | input / field | statement-file | SOURCE CLASSIFIED; STATES OPEN |
| 0d2ce4a9518f-1 | [ManualEntry.tsx:77](../../src/interfaces/web/features/import/ManualEntry.tsx#L77) | input / field | manual-date | SOURCE CLASSIFIED; STATES OPEN |
| 01bdb3165526-1 | [ManualEntry.tsx:86](../../src/interfaces/web/features/import/ManualEntry.tsx#L86) | input / field | {'${row.id}-name'} | SOURCE CLASSIFIED; STATES OPEN |
| ef899d0d6276-1 | [ManualEntry.tsx:87](../../src/interfaces/web/features/import/ManualEntry.tsx#L87) | input / field | {'${row.id}-isin'} | SOURCE CLASSIFIED; STATES OPEN |
| 1728f5b7ae61-1 | [ManualEntry.tsx:90](../../src/interfaces/web/features/import/ManualEntry.tsx#L90) | input / field | {'${row.id}-value'} | SOURCE CLASSIFIED; STATES OPEN |
| cd97f3e376ce-1 | [ManualEntry.tsx:94](../../src/interfaces/web/features/import/ManualEntry.tsx#L94) | button / action | Not held on this date | SOURCE CLASSIFIED; STATES OPEN |
| 69f8cac586d2-1 | [ManualEntry.tsx:98](../../src/interfaces/web/features/import/ManualEntry.tsx#L98) | button / action | Undo removal | SOURCE CLASSIFIED; STATES OPEN |
| 2d2d6df863fd-1 | [ManualEntry.tsx:100](../../src/interfaces/web/features/import/ManualEntry.tsx#L100) | button / action | Add another fund | SOURCE CLASSIFIED; STATES OPEN |
| d332a8c35403-1 | [ManualEntry.tsx:101](../../src/interfaces/web/features/import/ManualEntry.tsx#L101) | input / choice | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 63e49c40fe24-1 | [ManualEntry.tsx:106](../../src/interfaces/web/features/import/ManualEntry.tsx#L106) | button / action | Continue to movements and review | SOURCE CLASSIFIED; STATES OPEN |
| 7aa13e49b859-1 | [ManualEntry.tsx:111](../../src/interfaces/web/features/import/ManualEntry.tsx#L111) | button / action | Back to values | SOURCE CLASSIFIED; STATES OPEN |
| cbc079dfb4c6-1 | [FundView.tsx:55](../../src/interfaces/web/features/overview/FundView.tsx#L55) | button / action | hero-action | SOURCE CLASSIFIED; STATES OPEN |
| 4880f829e8f5-1 | [MonthsView.tsx:26](../../src/interfaces/web/features/overview/MonthsView.tsx#L26) | select / field | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| e44a2558bb28-1 | [MonthsView.tsx:31](../../src/interfaces/web/features/overview/MonthsView.tsx#L31) | button / action | Previous | SOURCE CLASSIFIED; STATES OPEN |
| d09ffa79803b-1 | [MonthsView.tsx:32](../../src/interfaces/web/features/overview/MonthsView.tsx#L32) | button / action | Next | SOURCE CLASSIFIED; STATES OPEN |
| 001cc06d600a-1 | [MonthsView.tsx:33](../../src/interfaces/web/features/overview/MonthsView.tsx#L33) | button / action | Latest | SOURCE CLASSIFIED; STATES OPEN |
| c34889ea07d3-1 | [MonthsView.tsx:48](../../src/interfaces/web/features/overview/MonthsView.tsx#L48) | a / action | row-link | SOURCE CLASSIFIED; STATES OPEN |
| 380401f314fb-1 | [MonthsView.tsx:59](../../src/interfaces/web/features/overview/MonthsView.tsx#L59) | summary / action | Compare all months in tables | SOURCE CLASSIFIED; STATES OPEN |
| 4c3e5c77b65b-1 | [MonthsView.tsx:60](../../src/interfaces/web/features/overview/MonthsView.tsx#L60) | div / scroll-region | Fund history by month | SOURCE CLASSIFIED; STATES OPEN |
| f73a11b9e69e-1 | [MonthsView.tsx:91](../../src/interfaces/web/features/overview/MonthsView.tsx#L91) | div / scroll-region | Portfolio totals by month | SOURCE CLASSIFIED; STATES OPEN |
| 51654294e7ec-1 | [OverviewView.tsx:100](../../src/interfaces/web/features/overview/OverviewView.tsx#L100) | a / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| 3a42ecb00d5f-1 | [OverviewView.tsx:142](../../src/interfaces/web/features/overview/OverviewView.tsx#L142) | a / action | Add your first statement | SOURCE CLASSIFIED; STATES OPEN |
| 76c9a563859d-1 | [OverviewView.tsx:161](../../src/interfaces/web/features/overview/OverviewView.tsx#L161) | a / action | Add statement | SOURCE CLASSIFIED; STATES OPEN |
| a3b42fb80947-1 | [OverviewView.tsx:215](../../src/interfaces/web/features/overview/OverviewView.tsx#L215) | input / field | fund-search | SOURCE CLASSIFIED; STATES OPEN |
| 8ab71703e9f5-1 | [OverviewView.tsx:222](../../src/interfaces/web/features/overview/OverviewView.tsx#L222) | button / action | Clear search | SOURCE CLASSIFIED; STATES OPEN |
| 5dbd3fbc50da-1 | [OverviewView.tsx:230](../../src/interfaces/web/features/overview/OverviewView.tsx#L230) | a / action | holding | SOURCE CLASSIFIED; STATES OPEN |
| ad056c5c8f28-1 | [OverviewView.tsx:251](../../src/interfaces/web/features/overview/OverviewView.tsx#L251) | div / scroll-region | Fund holdings | SOURCE CLASSIFIED; STATES OPEN |
| 8d0da27501ab-1 | [OverviewView.tsx:266](../../src/interfaces/web/features/overview/OverviewView.tsx#L266) | a / action | stretched | SOURCE CLASSIFIED; STATES OPEN |
| 66067b67828f-1 | [OverviewView.tsx:285](../../src/interfaces/web/features/overview/OverviewView.tsx#L285) | summary / action | Dynamic label; inspect owning component | SOURCE CLASSIFIED; STATES OPEN |
| f4734e648b87-1 | [OverviewView.tsx:346](../../src/interfaces/web/features/overview/OverviewView.tsx#L346) | a / action | row-link plain | SOURCE CLASSIFIED; STATES OPEN |
| 47bc7d2ce3b3-1 | [OverviewView.tsx:356](../../src/interfaces/web/features/overview/OverviewView.tsx#L356) | summary / action | What the numbers mean | SOURCE CLASSIFIED; STATES OPEN |
| ba730a52b26d-1 | [Donut.tsx:45](../../src/interfaces/web/presentation/charts/Donut.tsx#L45) | a / chart-mark | {slice.data.description ?? slice.data.label} | SOURCE CLASSIFIED; STATES OPEN |
| e3ffcd3f4bfd-1 | [LineChart.tsx:163](../../src/interfaces/web/presentation/charts/LineChart.tsx#L163) | button / action | {'Highlight ${entry.label}'} | SOURCE CLASSIFIED; STATES OPEN |
| 2a0fe4571f5f-1 | [LineChart.tsx:222](../../src/interfaces/web/presentation/charts/LineChart.tsx#L222) | svg / chart-inspection | chart-svg | SOURCE CLASSIFIED; STATES OPEN |
| 02f463cd71a2-1 | [LineChart.tsx:289](../../src/interfaces/web/presentation/charts/LineChart.tsx#L289) | input / slider | {'${props.title}: observation date'} | SOURCE CLASSIFIED; STATES OPEN |
| 37279bf88696-1 | [LineChart.tsx:306](../../src/interfaces/web/presentation/charts/LineChart.tsx#L306) | summary / action | Chart tools and values | SOURCE CLASSIFIED; STATES OPEN |
| ab1b1472a492-1 | [LineChart.tsx:310](../../src/interfaces/web/presentation/charts/LineChart.tsx#L310) | button / action | Reset chart inspection | SOURCE CLASSIFIED; STATES OPEN |
| 0c0b79d0eeb9-1 | [LineChart.tsx:320](../../src/interfaces/web/presentation/charts/LineChart.tsx#L320) | div / scroll-region | {'${props.title}: values table'} | SOURCE CLASSIFIED; STATES OPEN |
| 518445af5aff-1 | [MonthlyBars.tsx:87](../../src/interfaces/web/presentation/charts/MonthlyBars.tsx#L87) | g / chart-mark | {'${bar.label}: ${value === null ? "Unavailable" : show(value)}'} | SOURCE CLASSIFIED; STATES OPEN |
| 55f607d432ea-1 | [MonthlyBars.tsx:136](../../src/interfaces/web/presentation/charts/MonthlyBars.tsx#L136) | input / slider | {'${props.title}: month'} | SOURCE CLASSIFIED; STATES OPEN |
| 044cda0e76bf-1 | [MonthlyBars.tsx:153](../../src/interfaces/web/presentation/charts/MonthlyBars.tsx#L153) | button / action | Show latest month | SOURCE CLASSIFIED; STATES OPEN |
| a16d9513965d-1 | [MonthlyBars.tsx:157](../../src/interfaces/web/presentation/charts/MonthlyBars.tsx#L157) | summary / action | Show the values as a table | SOURCE CLASSIFIED; STATES OPEN |
| 4bd7053f46a0-1 | [MonthlyBars.tsx:158](../../src/interfaces/web/presentation/charts/MonthlyBars.tsx#L158) | div / scroll-region | {'${props.title}: monthly values table'} | SOURCE CLASSIFIED; STATES OPEN |
| 85c1087eb287-1 | [PerformanceBars.tsx:26](../../src/interfaces/web/presentation/charts/PerformanceBars.tsx#L26) | a / action | {'perf-row${row.dim === true ? " dim" : ""}'} | SOURCE CLASSIFIED; STATES OPEN |
| fc10b8bdab47-1 | [privacy.tsx:39](../../src/interfaces/web/presentation/privacy/privacy.tsx#L39) | button / action | privacy-toggle | SOURCE CLASSIFIED; STATES OPEN |
| f217f265fce6-1 | [index.html:71](../../src/interfaces/web/public/privacy/index.html#L71) | a / action | Contact email | SOURCE CLASSIFIED; STATES OPEN |
| 0c4e99920444-1 | [index.html:107](../../src/interfaces/web/public/privacy/index.html#L107) | a / action | Google's privacy policy | SOURCE CLASSIFIED; STATES OPEN |
| 75fe79f6b648-1 | [index.html:111](../../src/interfaces/web/public/privacy/index.html#L111) | a / action | GitHub's privacy statement | SOURCE CLASSIFIED; STATES OPEN |
| 1eae7f540e98-1 | [index.html:118](../../src/interfaces/web/public/privacy/index.html#L118) | a / action | Google API Services User Data Policy | SOURCE CLASSIFIED; STATES OPEN |
| 8a9a885a03b4-1 | [index.html:132](../../src/interfaces/web/public/privacy/index.html#L132) | a / action | myaccount.google.com/permissions | SOURCE CLASSIFIED; STATES OPEN |
| ed2d1530e46f-1 | [index.html:141](../../src/interfaces/web/public/privacy/index.html#L141) | a / action | github.com/AlbiDR/FolioDash | SOURCE CLASSIFIED; STATES OPEN |
| f217f265fce6-2 | [index.html:145](../../src/interfaces/web/public/privacy/index.html#L145) | a / action | Contact email | SOURCE CLASSIFIED; STATES OPEN |
| 145a635bff48-1 | [index.html:147](../../src/interfaces/web/public/privacy/index.html#L147) | a / action | Back to FolioDash | SOURCE CLASSIFIED; STATES OPEN |
| 42ad8058294c-1 | [DeferredView.tsx:12](../../src/interfaces/web/shared/ui/DeferredView.tsx#L12) | button / action | Reload view | SOURCE CLASSIFIED; STATES OPEN |
| 18b15b9fbea7-1 | [PageNav.tsx:14](../../src/interfaces/web/shared/ui/PageNav.tsx#L14) | button / action | page-nav-item | SOURCE CLASSIFIED; STATES OPEN |
| c024e169481d-1 | [RangeSelector.tsx:29](../../src/interfaces/web/shared/ui/RangeSelector.tsx#L29) | button / period-option | Dynamic label; inspect owning component | P1: Chrome states and chart journey PASS; devices/other engines OPEN |

<!-- interaction-inventory:end -->

Final deterministic checks on 2026-11-10: `npm run verify` PASS, 68 Vitest files / 862 tests, including six inventory regression cases. TypeScript, ESLint, repository/contributor/punctuation policies, interaction inventory, Pages composition, production build, PWA/icon integrity and Apps Script bundle checks passed. `npm run verify:workflows` passed actionlint. All five `npm run capture:readme` synthetic production captures regenerated successfully using the shared local browser runner. Static captures establish settled layout, not animated-state quality; the separate rendered audit provides the motion assertions above.
