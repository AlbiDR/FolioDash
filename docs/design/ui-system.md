# UI system

Status: **Implemented 2026-11-08 and checked in an emulated browser. Physical-device, deployed-origin, other-engine and screen-reader checks are not done.**
Date: 2026-11-08
Owner request: "The UI is currently very messy ... confusion, crammed sections, unclear hierarchies, unorganized UX, questionable user journey ... many layers of UI/UX polish and plenty of hierarchical organization that is thought out and put together strategically."

This is the design system the screens are now built from. It follows the [structural redesign](structural-ui-redesign.md), which fixed the order of each screen and the container policy. That pass moved blocks around; this one made the pieces they are made of consistent, so that a screen is assembled from a few parts instead of styled one block at a time. It is a presentation change. Financial calculations, parsers, persistence, Google access, save and recovery semantics, consent flows, routes and destinations are untouched. Every figure still comes from the canonical models, and every screenshot and measurement uses invented data.

## What was wrong

Measured on the build that already contained the structural redesign, with the scratch harness described below:

- Portfolio used 13 distinct font sizes and 5 weights on one screen, Work expenses 11 sizes and 4 weights. Many were one-off values chosen per block.
- Buttons had unrelated looks: rectangular 8px buttons throughout Expenses next to pills in notices and elsewhere.
- One idea had several implementations: key and value lists (`.facts`, `.kpis`, `.definitions`, per-screen variants), disclosures (a bordered card, a plain row, a summary with a hairline), progress steps, and responsive tables.
- Static content reacted to hover: stat blocks lifted, every card cast a hover shadow, and plain data rows had a rounded highlight. Nothing there can be pressed, so the feedback promised an action that did not exist.
- Several screens opened with a block that did not help the task: a duplicated heading, a three-line instruction, two stacked status notices, a sample banner at the foot of the page, an entry form that could not be used.
- Overrides fought each other: `!important` to win against earlier rules, and the same rules (tables, fieldsets) defined twice.

## The system

### Type

Every piece of text is one of these roles. A component picks a role and does not invent a size. They are tokens in `shared/tokens.css`.

| Role | Token | Size | Used for |
|---|---|---|---|
| Caption | `--text-caption` | 12px | Chips, units, step names |
| Small | `--text-small` | 14px | Labels, hints, footnotes, secondary rows |
| Body | `--text-body` | 16px | Reading text, buttons, field text |
| Lead | `--text-lead` | 18px | Section and card titles |
| Title | `--text-title` | 22px | Screen sections, the selected day, an average |
| Figure | `--text-figure` | 28px | A primary figure inside a card |
| Display | `--text-display` | 32px to 48px, fluid | The headline value only |

Weights are 400, 600 and 700 (`--weight-regular`, `--weight-semibold`, `--weight-bold`). Line heights are `--leading-tight` (1.2) for headings and figures and `--leading-body` (1.5) for text. Spacing is a 4px scale; `--section-gap` is the one distance between sections.

### Shape and controls

- Buttons, chips and segmented controls are pills. Fields are 12px. Cards are 16px. Nothing else invents a radius.
- One button system, defined once with zero specificity so a component only overrides what it needs: tonal by default, `.primary` filled for the one main action of a group, `.quiet` text-only for a minor action. Targets stay 48px.
- A field is a labelled input with its own surface, never a box around one. A group of related fields sits in one tinted `fieldset`; its legend is the group's heading inside the box. An amount field shows its euro sign inside the input, not as a second label.

### Content parts

- **Key and value list**: `.facts` is a grid of label-over-value pairs; `.facts.stacked` is the single label-left, value-right list with hairlines. Account facts, month summary rows, review totals and per-fund results all use it.
- **Disclosure group**: `.more` holds reference material as plain rows with a chevron, a hairline between rows and nothing around the group. Frequent figures and actions are never inside one. Used for analysis and glossary, month matrices, where it goes and how summaries work, how staying connected works, the JSON import, restoring an expense backup and the Google client ID.
- **Jump to**: quiet outlined chips with a "Jump to" label, on screens long enough to need them. They move focus to a section heading and never change the route.
- **Notices**: one family (`.notice`, `.review-adjustments`, `.review-problem`, tones info, success, warning, error). Text first, then its action on its own row. A notice with two actions lets them flow side by side. Status notices at the top of Expenses and Import are one notice, not a stack.
- **Progress**: import steps are three equal columns, a number above its name, the current step filled.
- **Tables**: a name on the left, figures on the right, a hairline between rows. A fund's ISIN sits under its name, so a statement table is two columns and never scrolls sideways on a phone. A result that needs four figures per fund is a list of `.facts`, not a five-column table.
- **Banner**: the sample banner (`.get-started`) is the same part on Portfolio and Expenses: a heading, one sentence, one button. On a wide screen the button shares the row.

### Interaction coverage amendment, 2026-11-10

Every interactive control inherits the [interaction coverage contract](interaction-coverage.md), including general tonal buttons, inline links, native fields, chart targets and scrollable regions. Hover/focus, press and release must be perceptible in normal motion; reduced motion keeps immediate state feedback. The source inventory and rendered audit identify missing control/state coverage. Animation counts do not satisfy this requirement. Static reading containers remain outside pointer feedback.

### Containers

A card is allowed for the one primary group of a screen, a chart, a list scanned row by row, and an outcome panel. Rows, hairlines and spacing do everything else. Cards, charts and stat blocks have no hover, focus or press feedback of their own; the links and buttons inside carry it. Hover applies only to things that can be pressed, and only under `(hover: hover) and (pointer: fine)`.

### Wide screens

Reading screens (Import, Your data) keep a 52rem line length. Dashboards use the twelve-column grid with source order unchanged.

## What changed on each screen

- **Portfolio**: the hero is one block (as-of date and "Add statement" in its header, the total, the gain, net invested and funds held). The chart is titled "Performance" with one note and no repeated date. Holdings are rows with a headline value and a two-column label-over-value detail; the fund search appears from seven funds. Analysis and glossary are one disclosure group. The demo shows the sample banner first.
- **Fund**: ISIN with a copy action in the hero; Value and Gain; one chart; four latest figures that the hero does not already show.
- **Month by month**: one section heading, the statement picker, one summary list; matrices in the disclosure group.
- **Work expenses**: the sample banner moved from the foot of the page to the top. One status notice replaces two. Fields are label-left, amount-right rows (three columns once the card is wide). The day total shares a row with how complete the day is, the one primary action has its own row, and secondary actions share the row under it. A weekend or future day with nothing recorded shows why and the nearest workdays, not a form that cannot be used (this supersedes the structural redesign's "input present and disabled"; a day that does hold amounts still shows them). The week list says "Recorded" where the day heading says "Recorded workday". Reference disclosures join the shared group.
- **Import**: a title-size heading, one-row progress, one sentence of instruction with the privacy statement as a footnote, results as notices (reading, ready, problems), tables that fit, per-fund questions in tidy boxes, results per fund as a list.
- **Your data**: one anatomy for every section (title, one sentence, optional note, one action). "How your data is kept" is now "Where your data lives" and the long explanation of staying connected is a disclosure. The expense history asks to connect with a warning notice, not an error.
- **Update and sign-in notices** (`A new version is ready`, `Continue with Google to save your statements`) put their action on its own row like every other notice.

## Evidence

Scratch measuring harness kept outside the repository: headless Google Chrome over the DevTools Protocol, fresh profile each run (no service worker), reduced motion emulated, the built-in synthetic demo and a synthetic device copy seeded into browser storage, bank files from the generated synthetic onboarding fixtures. Widths 320, 375, 430, 768 and 1440, light and dark.

Before and after, 375px wide, demo data:

| Screen | Page height | Font sizes | Font weights |
|---|---|---|---|
| Portfolio | 3031 to 2733 | 13 to 9 | 5 to 3 |
| Work expenses | 3646 to 2860 | 11 to 6 | 4 to 2 |
| Month by month | 1396 to 1439 | 5 to 3 | 4 to 2 |
| Your data | 1348 to 1337 | 5 to 3 | 4 to 3 |
| Import | 942 to 949 | 6 to 5 | 4 to 3 |
| Import history | 872 to 879 | 5 to 5 | 4 to 3 |

Card counts, cards inside cards (zero everywhere) and page-level horizontal overflow (none at 320, 375, 430, 768 and 1440) did not change. Month by month and the import screens grew slightly where a heading, a notice or a banner replaced a bare line; nothing was hidden to make a number smaller.

Also checked:

- No console errors or uncaught exceptions on any route at 390px.
- No horizontal overflow at a 195px viewport (the width a 390px phone has at 200% browser zoom) on Expenses, Import, Import history, Your data, Month by month and Fund. Portfolio overflows there by the chart period control alone, which is four 48px targets. This is below the 320px reflow requirement and is left as is.
- Import review, batch and validation states exercised with the synthetic onboarding files, phone and wide.
- README captures regenerated locally (`npm run capture:readme`) and inspected. Their hooks (`.privacy-toggle`, `.expense-entry`, `.expense-state`, `.expense-date-controls button`, `.expense-fields input` x5, `.hero`, `.portfolio-trend`, `.expense-week`, `.dash`) all still resolve.
- `npm run verify`: typecheck, lint, 65 test files with 823 tests, Pages, build, PWA and Apps Script checks pass.

## Not verified

- A physical phone, a different browser engine, VoiceOver, TalkBack or a keyboard-only pass beyond the unchanged DOM and tab order.
- The deployed origin, and the screens connected to a real Google account. A synthetic device copy stands in for a connected account.
- The monthly bars on Portfolio are chart marks smaller than 48px (the audit counts eight at 375px); they were already so, and the same figures are in the chart tables.
- Expenses states that need a Google connection (saving, correction review, conflicts) were exercised only in the demo; their copy and logic are unchanged.

## Rules for the next change

1. Pick a type role and a shape; do not add a size or a radius.
2. Reach for an existing part before writing one: key and value list, disclosure group, notice, banner, table or `.facts` list, `fieldset`.
3. A static element gets no hover. A card is not a button.
4. Put the action of a notice on its own row.
5. Do not use `!important` to win an order fight; fix the specificity or the order.
6. Re-run the README capture after any markup change, because the main verification does not cover it.
