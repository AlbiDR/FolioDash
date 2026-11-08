# Structural UI and UX redesign

Status: **Implemented 2026-11-08 and checked in an emulated browser. Physical-device, deployed-origin, other-engine and screen-reader checks are not done. The brief below was written before implementation; the final section records what was built and measured.**
Date: 2026-11-08
Amended 2026-11-08 by the [UI system](ui-system.md) pass, which keeps this document's screen order and container policy and changes the details marked "amended" below.
Owner request: "The UI is still pretty much a mess, especially on mobile. The hierarchy and organisation are not thought out. There are a lot of containers that hinder navigation and reaching the main section."

This is a presentation and structure change. Financial calculations, parsers, persistence, Google access, save and recovery semantics, consent flows, routes and destinations are untouched. All figures still come from the existing canonical models. Every screenshot and measurement uses invented data.

## What this supersedes

The earlier design passes recorded overflow, type size, touch-target and card-hierarchy fixes as passing. They did not ask how far the main task was from the top of the screen, how many containers sat between a person and it, or whether reading order matched visual order. "Implemented" in those records is not evidence the experience works. Their findings and validation records stay as history. This brief replaces their layout guidance in the scopes below.

| Document | Superseded by this brief | Still valid |
|---|---|---|
| [Mobile dashboard layout](mobile-dashboard.md) | The phone card sequence, "larger number of vertical cards is a deliberate tradeoff", the period-results-as-cards composition, the floating header card and the 48px-row-per-metric holdings layout | Reflow rules for narrow containers, wrapping amounts, 48px targets, safe-area handling, the verification matrix |
| [Dashboard coherence](dashboard-coherence.md) | The sticky glass header owning page identity plus a second intro block, separate eyebrow and heading per screen, the bordered analysis disclosure, per-metric stat cards | The product narrative (value, change, composition, analysis), disclosed analysis, glass kept to navigation and header, solid numerical surfaces, every later amendment's financial and chart rules |
| [Work expenses experience plan](work-expenses-experience.md) | The 2026-11-06 phone and desktop composition that places report cards before the editor in the DOM and reorders them with CSS, the reporting-year control in the page intro, boxed per-field containers | Day-meaning and persistence-state vocabulary, privacy behaviour, correction and recovery rules, the policy gates, the product narrative "record a day, review the week, understand the pattern" |

## Method and baseline

Re-measured on the production build (`npm run build`, served by `vite preview`), before any change. The measuring harness is scratch tooling kept outside the repository (headless Google Chrome 157.0.8103.39 on macOS over the DevTools Protocol, fresh profile, network limited to the preview origin, service worker bypassed, reduced motion emulated for steady measurements). It is not a project dependency or a CI suite.

- Viewport: 375 x 812 CSS pixels unless stated; mobile emulation with touch for widths of 768 and below. Also 320, 390, 430, 768 and 1440 wide, light and dark, and a browser default font size of 32px (200% text) at 320, 375 and 768.
- Data: the built-in synthetic demo (`?demo=typical`, 2 funds), the twelve-fund demo, an empty demo, and a synthetic device copy seeded into browser storage (4 invented funds over 24 months, and an empty ledger). The device copy stands in for a connected account. It is simulated; no Google access is involved.
- State: privacy default (amounts hidden) and amounts shown; all disclosures closed; the real clock on 2026-11-08, which is a Sunday, and a fixed clock on Wednesday 2026-11-04 for Expenses.
- Containers: counted from computed style, not class names. A container is a rendered element with element children and a visible surface (non-matching background, a box of three or more bordered sides, or a shadow). Buttons, links, inputs, table cells, labels, chips, and groups made only of buttons or links are excluded. `.card` counts are given separately because that is how the owner measured. A card-in-card is a `.card` inside a `.card`.
- Primary position: the top of the headline figure on Portfolio and Fund (`.hero-value`), the first entry input on Expenses (`#expense-0`), the file picker on Import and Import history, the connection summary on Your data.

### Baseline at 375 x 812, demo data, amounts hidden, disclosures closed

| Destination | Page height | Cards (`.card`) | Card in card | Computed surfaces in main | Max nesting | `<details>` | Top chrome (bottom edge of header) | Primary position | First viewport |
|---|---|---|---|---|---|---|---|---|---|
| Portfolio | 4,303 (5.3 screens) | 12 | 3 | 14 | 3 | 8 | 131.6 | headline value at 399.6 | visible |
| Fund | 1,929 (2.4) | 2 | 0 | 3 | 1 | 2 | 131.6 | headline value at 554.4 | visible |
| Month by month | 1,772 (2.2) | 6 | 0 | 6 | 1 | 1 | 131.6 | summary at 624.8 | below the fold |
| Expenses (Sunday) | 5,508 (6.8) | 8 | 0 | 20 | 2 | 2 | 131.6 | first entry input at 775.6, disabled | **below the fold, behind navigation** |
| Expenses (Wednesday) | 5,398 (6.6) | 8 | 0 | 20 | 2 | 2 | 131.6 | first entry input at 702.4 | **below the fold** |
| Import | 1,153 (1.4) | 0 | 0 | 2 | 1 | 0 | 131.6 | file picker at 870.9 | **below the fold** |
| Import history | 1,083 (1.3) | 0 | 0 | 2 | 1 | 0 | 131.6 | file picker at 800.9 | **below the fold** |
| Your data (device copy) | 3,026 (3.7) | 5 | 0 | 6 | 2 | 0 | 131.6 | connection summary at 307.4 | visible, buttons below |

Fixed bottom navigation: 72.8px, leaving 607.6px of an 812px viewport between the header and the navigation. The twelve-fund Portfolio is 7,521px (9.3 screens). Expenses with amounts shown is the same height as with them hidden; the Sunday and Wednesday figures differ by the weekend notice.

Where the Portfolio's 4,303px go: intro block 187, summary hero 356, chart block 704, period results 450, Holdings 1,228, Allocation 406, analysis disclosure 114, glossary 80, plus the demo setup card. Where Expenses' 5,508px go: intro 196, entry card 1,474, week 825, annual 403, averages 731, record 1,179, other 700.

### Observed problems

1. **Two headers before content.** A 115.6px floating glass card (title, status chip on its own line, privacy button) is followed by an eyebrow, a second heading, the chart-period control and a full-width action. The first figure starts at y=346 to 400 of 812. Several screens repeat their own H1 in an H2 ("Month by month", "Update your portfolio").
2. **Primary task out of the first screen.** Expenses puts a reporting-year select, a heading, a paragraph, three date buttons, a date input and a notice before the first input. Import and Import history put the file picker below the fold.
3. **Cards for everything.** Portfolio has three cards inside the period-results card, an analysis disclosure that is itself bordered and contains cards, and fund-level cards on Month by month. Expenses wraps every entry field in its own bordered box inside the entry card.
4. **Reading order differs from visual order.** On phones Expenses places the annual and averages cards after the entry and week cards using CSS `order`; the DOM and keyboard order is the reverse (four blocks out of place).
5. **Single-word labels break.** "Previous" wraps to "Previo / us" at 375px and across three lines at 320px, "Next" wraps at 320px, because icon-plus-label buttons share a three-column grid.
6. **Dense rows.** Each holding takes about 250px on a phone for four labelled figures. The twelve-fund Portfolio therefore needs nine screens.
7. **Status competes with the title.** Connected states produce a status chip of up to 50 characters ("Saved on this device · tap to sync · 5 minutes ago") that forces a second line in the header.
8. **Smaller findings.** Positive percentage chips measure 4.3:1 against their tinted background, under the AA threshold of 4.5:1 for 13px text. On Portfolio the chart's pointer hit areas for individual months are 27 to 33px wide. At 200% text, long headings and buttons wrap inside words on Portfolio, Fund, Month by month, Expenses, Import and Your data at 320 and 375px.

Assumptions, not observations: that people use Expenses daily and Portfolio monthly, that status matters most when it is unusual, and that the first screen of each destination should be its primary task. These come from the product narrative in the earlier records and the owner's statement, not from usage data.

## Design language

One structure on every destination, phones first.

**Page frame.** A compact top bar (title, status, privacy), then content in sections. No eyebrow-plus-heading intro block. The bar's title is the page's only level-one heading; sections use level-two headings that say something the bar does not.

**Container policy.**
- A card (a solid surface) is allowed for: the one primary group of a screen (the portfolio summary, the day-entry form, the connection summary), a chart, a list the person scans row by row (holdings, record), and outcome panels (notices, results, review and destructive confirmations).
- Everything else is spacing, a section heading, a hairline divider or a row. No card sits inside a card. A form field is a labelled input with its own control surface, not a boxed wrapper around one.
- A disclosure is a plain row with a heading, not a bordered card, and is used only for reference material. Frequent figures and actions are never behind one.

**Status and privacy.** Both stay in the bar on every screen. On phones the status chip carries a short word ("Demo", "Synced", "Tap to sync", "Offline copy", "Reconnect", "Needs attention", "Checking…", "Renewing…"); its accessible name and tooltip keep the full existing sentence including the age. The Your data screen already states the full detail. The privacy control is an icon button with an accessible name.

**Navigation.** The four main destinations and all routes (`#overview`, `#expenses`, `#import`, `#connection`, `#history`, `#months`, `#fund/…`) are unchanged. The bar and bottom navigation are shorter. Detail screens (Fund, Month by month) put their "back to Portfolio" control in the bar. Long screens (Portfolio, Expenses, Your data) get a small in-page navigation of three chips that jump to the next sections, instead of more wrappers. It moves focus to the section heading and never changes the route.

**Order.** The DOM order is the reading, tab and visual order. CSS `order` is not used on primary content. Grid placement on wide screens keeps source order left to right, top to bottom.

**Single-word labels** never wrap inside the word: buttons that hold one word use `white-space: nowrap` and a grid sized for them; paired icons are dropped where the label already says the action.

**Density.** Row heights follow content. Nothing shrinks below the existing type scale, touch targets stay 48px, and no figure moves behind a disclosure to meet a height target.

## Per destination

Wireframes are text sketches of a 375px phone. `[ ]` is a control, `{ }` a card, `---` a divider.

### Application shell

- Primary purpose: tell you where you are, whether the data is trustworthy, and let you change privacy, without being a page of its own.
- First viewport: a bar of about 56px plus the top safe-area inset (target: bottom edge at or under 80px), and the 56px navigation fixed at the bottom.
- Before:
  ```
  { Portfolio                    [eye] }   115.6px, floating glass card
  { ● Demo data                         }
  SAMPLE PORTFOLIO
  As of 15 August 2025
  [ 3M  6M  1Y  All ]
  [      Add a statement      ]
  ```
- After:
  ```
  Portfolio            ● Demo  [eye]       about 56px, flush glass bar
  ```
- Detail screens: `[<] Fund name  ● Synced [eye]`.
- States: the status chip is a link to Your data when it describes a stable state, a "sync now" button when it says "Tap to sync" or "Reconnect". Update, attention and demo notices stay as compact one-line notices under the bar. Reduced transparency, forced colours and reduced motion keep their existing handling.
- Accessibility: skip link and focus handoff to `#main-content` unchanged; the bar is a `banner` landmark; the status chip keeps its full accessible name; the back control is a link named "Back to Portfolio".

### Portfolio (`#overview`)

- Primary question: how much is my portfolio worth and how is it trending?
- First viewport: the headline value, total gain with its percentage, and the trend chart (target: headline value and trend fully visible above the navigation).
- Section order: summary, trend chart (with its period control), in-page navigation, changes, holdings, allocation, trends and comparisons (disclosure), what the numbers mean (one disclosure that now also holds the exact definitions), setup (demo only).
- Cards: the navy summary; the chart; one card for the three changes; one card for holdings; one card for allocation. The three change rows are rows, not cards. The trends disclosure is a plain row; its charts remain cards.
- Visible: every figure that is visible today. The chart period control moves into the chart it governs. "Add a statement" stays, as a compact action in the summary's header row. The fund search stays and becomes one line with an inline clear control. Holdings rows keep the four labelled figures (value, gain %, gain, net invested), laid out two by two with tighter spacing.
- Disclosure: trends and comparisons, what the numbers mean (merged with exact definitions), per-chart tools and values, the demo-portfolio picker. One fewer disclosure than before on the demo screen (the exact definitions joined the glossary), and none hidden that was visible.
- Context: the statement date is the first line of the summary ("As of 15 August 2025"). Holdings link to the fund screen; the bar's back control returns to Portfolio.
- Before and after:
  ```
  Before (5.3 screens)          After
  {header 116}                  [bar 56]
  intro 187                     { As of 15 Aug 2025   [+ Statement]
  { hero 356 }                    Total fund value
  { chart 704 }                   ••••  €      +••••  +14,38 %
  { period results 450            Net invested ••••   Funds held 2 }
      {stat}{stat}{stat} }      { trend chart   3M 6M 1Y All }
  { Holdings 1,228 }            [Holdings] [Allocation] [Trends]
  { Allocation 406 }            { Changes: 3 rows }
  analysis, glossary            { Holdings, compact rows }
                                { Allocation }
  ```
- States: connected-empty keeps its import-led empty state and never falls back to demo balances; demo keeps its label; unavailable values keep their reasons; a failed chart keeps its tables.
- Wide screens keep the twelve-column bento: summary and changes on the left, the trend spanning both on the right, holdings and allocation beneath.

### Fund and Month by month

- Fund primary question: how has this one fund done? First viewport: fund name in the bar, ISIN, value, gain, and the chart. The chart-period row above the content is gone; its control sits in the chart. Latest figures use two columns on phones.
- Month by month primary question: what did a past statement look like? First viewport: the statement picker and the summary. The repeated H1/H2 and the intro sentence are replaced by one short section heading. The month summary and the per-fund values become one list in one card instead of one card per fund. The all-months tables stay behind one disclosure on phones (open on wide screens) with their labelled local scrolling.

### Work expenses (`#expenses`)

- Primary task: record today's costs.
- First viewport on any day: the selected date and its state, the date controls, and the first entry input. On a non-recordable day the same viewport also shows why (the tracker covers Monday to Friday) and two buttons that open the previous and the next workday, named with their dates. Amended: an empty weekend or future day no longer renders the disabled form, total and save row, only the reason and the workday buttons (a day that already holds amounts still shows them); which date is selected is unchanged. Previous and Next step one calendar day, so weekend days can be viewed (owner request, 2026-11-08); only a workday can be recorded.
- Section order (also the DOM and tab order): the day-entry card, the week, in-page navigation (Year, Categories, Record), the year (reporting-year control, annual total and projection, the three averages), where it goes (disclosure), how these summaries work (disclosure), the record. Amended: the sample banner is the first block in the demo, not the last, and the two status notices are one.
- Cards: the entry card (the primary group), the week, the year, the averages, the record. Fields are labelled inputs in rows without boxes; the day total is a divider-separated row inside the entry card. The three averages are rows, not bordered columns.
- Visible: all five fields, optional costs labelled as optional, Previous, Today, Next and the date picker (text-only, never wrapping; Previous and Next carry the calendar day they open in their accessible names), the draft total and completeness, save and its feedback, review and conflict panels. The reporting-year control moves from the page intro to the year section because it governs only the report figures.
- Disclosure: where it goes, how these summaries work, previous saved versions.
- Context: previous, next, week and record actions keep the draft guard exactly as today. The in-page navigation moves focus to a section heading.
- Before and after (Sunday):
  ```
  Before                        After
  {header 116}                  [bar 56]
  SAMPLE WORK EXPENSES          { Sun, 8 Nov 2026       [Weekend]
  Your working costs              [Previous][ Today ][ Next ]
  Try recording…                  [ 08/11/2026          ]
  Reporting year [2026]           Weekend: Mon to Fri only.
  { RECORD A DAY                  [Previous workday: Fri 6 Nov]
    Sun 8 Nov  [Weekend]          [Next workday: Mon 9 Nov]
    [Previo|us][Today][Next]      Outbound commute   [ ____ ]
    [ 08/11/2026 ]                Lunch              [ ____ ]
    note (84px)                   Inbound commute    [ ____ ]
    Daily essentials              Optional: Dinner, Other
    ▢ ▢ ▢ ▢ ▢ (below fold) }      Recorded so far ...  [ Save ] }
                                  { Your week ... }
                                  [Year][Categories][Record]
  ```
- States: Today and weekday as today; weekend and future dates keep their notices and disabled inputs, and a weekend note offers the nearest workdays as buttons; hidden amounts keep their reserved save position; error, correction, conflict, uncertain-save and demo states are unchanged in meaning.
- Accessibility: DOM order equals visual order; the date label is an `aria-live` heading; Previous and Next carry accessible names that include the destination date.

### Import (`#import`) and Import history (`#history`)

- Primary task: choose the bank file.
- First viewport: the choice of Excel file or manual entry and the file picker (target: picker above the navigation, including when the signed-out notice is shown).
- Section order: signed-out or connected notice, three-step progress as one line, the Excel/manual choice, the file picker, review. The page is no longer wrapped in one big card; fieldsets and review groups are the containers. The repeated eyebrow and H2 are removed; a short purposeful heading replaces them.
- Visible: every step and message that exists today. Optional JSON import stays at the end as one plain disclosure row.
- States: reading, review ready, problems, saving and recovery keep their status regions and focus handoffs. Notices stay one block, not a card inside the page card.

### Your data (`#connection`)

- Primary task: see whether the data is current and sync it.
- First viewport: the connection summary and the sync action.
- Section order: connection card (the primary group), verify history, tidy sheet, restore (only when it applies), then the work expense history, where your data lives with Forget this device (amended name; its long explanation is a disclosure), advanced (only without a client id). Sections other than the connection summary and the restore card are plain sections with a heading and a divider; result messages and confirmations remain tinted panels. The sections are reachable from the in-page navigation.
- States: all existing confirm, busy and result states keep their copy, roles and focus handoffs.

## Alternatives rejected

- A sticky bar plus sticky navigation: permanently takes about 16% of a phone viewport and changes how the bar scrolls today.
- Collapsing holdings after the first few funds: hides frequent figures. Rejected.
- Merging Portfolio and Expenses into a home screen: new product scope.
- Making the first entry input sticky or opening Expenses on the latest workday: changes behaviour; see the owner decisions below.

## Owner decisions

1. **Weekend default date: decided, 2026-11-08.** Expenses keeps opening on today's date, which is a Sunday on 2026-11-08 and so cannot be recorded. The redesign makes the restriction and the way to the nearest eligible days visible in the first screen without changing which date is selected. The owner chose to keep this behaviour; opening on the latest workday was considered and not adopted.
2. **Expenses order on wide screens.** To make DOM order equal visual order on every width, the entry and week now lead and the reporting cards follow. Wide screens previously placed the reporting cards first. This follows the product narrative in the experience plan ("record a day, review the week, understand the pattern"). Say if wide screens should lead with reports; that would need the reports first in the DOM on phones too.
3. **Previous and Next include weekends: decided, 2026-11-08.** The owner asked that Previous and Next step through weekend days too. They now move one calendar day (Sunday, Saturday, Friday); the weekend note keeps two buttons that jump to the previous and next workday. Recording stays Monday to Friday, and a weekend date is read-only.
4. **Shortened status words on phones.** The full sentences are kept as accessible names, tooltips and on Your data. Only the visible phone label changes.

## Verification plan and evidence categories

Deterministic: `npm run verify` (types, lint, unit tests, repository policy, build, PWA and bundle checks) on Node 22 and 24 in CI. Emulated browser: the scratch matrix at 320, 375, 390, 430, 768 and 1440 in light and dark, 200% text, connected-empty and demo states, journeys by keyboard and touch emulation. Deployed origin, physical devices (Android, iOS), Firefox, WebKit and manual screen-reader review are separate evidence and are not claimed unless performed. Synthetic or simulated connected rendering is not authenticated Google access.

## Results

Revision: commits f1758e6 (shell, Portfolio, Fund, Month by month), d30df62 (Expenses) and ab1667a (Import, Import history, Your data) on top of the brief in e3d0a5a. Local `npm run verify` passed on Node v26.13.0 (repository policy, punctuation, types, lint, 823 tests, Pages checks, production build, PWA and Apps Script bundle checks). CI runs it on Node 22 and 24 and is a separate gate.

### Before and after, 375 x 812, demo data, amounts hidden, disclosures closed

Same harness, same states and the same measurement definitions as the baseline above. The "before" build is the unchanged parent revision, rebuilt separately.

| Destination | Height before | Height after | Change | `.card` | Card in card | Computed surfaces | Max nesting | Top chrome (bottom edge) | Primary at y | Primary in first screen |
|---|---|---|---|---|---|---|---|---|---|---|
| Portfolio | 4,303 | 2,984 | -30.7% | 12 to 8 | 3 to 0 | 8 to 6 | 1 to 1 | 132 to 56 | 400 to 185 | yes to yes |
| Fund | 1,929 | 1,462 | -24.2% | 2 to 2 | 0 to 0 | 3 to 3 | 1 to 1 | 132 to 56 | 554 to 280 | yes to yes |
| Month by month | 1,772 | 1,354 | -23.6% | 6 to 3 | 0 to 0 | 4 to 1 | 1 to 1 | 132 to 56 | 625 to 440 | partly to partly |
| Expenses, Sunday | 5,508 | 3,646 | -33.8% | 8 to 6 | 0 to 0 | 15 to 7 | 2 to 2 | 132 to 56 | 776 to 559 | no to yes |
| Expenses, Wednesday | 5,398 | 3,401 | -37.0% | 8 to 6 | 0 to 0 | 15 to 6 | 2 to 1 | 132 to 56 | 702 to 314 | partly to yes |
| Import | 1,153 | 920 | -20.2% | 0 to 0 | 0 to 0 | 1 to 0 | 1 to 0 | 132 to 56 | 871 to 481 | no to yes |
| Import history | 1,083 | 850 | -21.5% | 0 to 0 | 0 to 0 | 1 to 0 | 1 to 0 | 132 to 56 | 801 to 411 | no to yes |
| Your data, device copy | 3,045 | 2,826 | -7.2% | 5 to 1 | 0 to 0 | 6 to 2 | 2 to 1 | 132 to 56 | 307 to 169 | partly to yes |
| Portfolio, twelve funds | 7,521 | 4,556 | -39.4% | 12 to 8 | 3 to 0 | 8 to 6 | 1 to 1 | 132 to 56 | 400 to 222 | yes to yes |
| Portfolio, device copy, four funds | 4,213 | 2,777 | -34.1% | 11 to 7 | 3 to 0 | 7 to 5 | 1 to 1 | 132 to 56 | 400 to 222 | yes to yes |

The fixed bottom navigation went from 72.8px to 58.4px, so the space between the bar and the navigation grew from 607.6px to 697.6px. Primary at y is the headline value (Portfolio, Fund, twelve funds, device copy), the first entry input (Expenses), the file picker (Import, Import history), the month summary (Month by month) or the connection summary (Your data). "Partly" means the element starts in the first screen but extends past it.

### Acceptance targets

| Target | Result |
|---|---|
| Top chrome about 80px or less | Met: the bar's bottom edge is at 56px on every destination (132px before). The navigation is reported separately above. |
| Portfolio headline value and trend visible in the first screen | Headline value: met, fully visible at y=185 to 222. Trend: **partly met.** The chart starts in the first screen and the top 60% of its plot is visible; its lower part and the date slider sit under the navigation. Getting the whole plot above the navigation needed about 100px more, which would have meant removing the hero captions or splitting the summary, so it was not done. |
| Portfolio at least 30% shorter, nothing frequent hidden | Met: 30.7% on the demo, 34.1% on the four-fund device copy, 39.4% with twelve funds. Every figure and action that was visible is still visible. |
| Expenses first entry input visible whenever entry is available; on a non-recordable day show the restriction and the route to an eligible date | Met on Wednesday (y=314) and on Sunday (y=559, disabled), with the weekend note and its two workday buttons in the same screen. The selected date is unchanged. |
| Main destinations reach their primary section in one tap with no scrolling | Met in the journey check for Expenses, Import, Your data and Portfolio. |
| No card inside a card | Met for `.card` (3 to 0) and for every computed surface in the default states, except tinted notice panels: the weekend note with its two buttons sits inside the Expenses entry card on a weekend (nesting 2 on Sunday), and Import review states use tinted fieldsets and notices for outcomes. |
| No single-word button label wraps within the word at 320px | Met: 0 cases at 320 and at every other width (20 cases before). |
| Primary DOM order equals visual order | Met: 0 of 140 matrix cases differ (24 before). On Expenses the reordering CSS is removed. |
| Existing workflows, information and financial meaning preserved | No calculation, parser, persistence, Google or consent file was changed. Copy was moved or shortened only where noted in the brief (header eyebrows and repeated headings; hero captions now share the label's line). |
| `npm run verify` passes | Local: yes. CI: separate. |

### Matrix, emulated browser

140 cases: widths 320, 375, 390, 430, 768 and 1440; light and dark; demo, empty demo, synthetic connected-empty, synthetic device copy with four funds, twelve funds, Expenses on Sunday and on Wednesday.

| Check | Cases affected before | After |
|---|---|---|
| Page overflowing horizontally | 0 | 0 |
| Element overflowing outside a scroll region | 0 | 0 |
| Word broken inside a button, link, label or heading | 20 | 0 |
| Interactive target under 48px | 22 | 10 |
| Text under AA contrast (computed estimate) | 54 | 0 |
| Primary block order differs from DOM order | 24 | 0 |

The 10 remaining small-target cases are two kinds, both present before: the stretched fund links in the desktop holdings table (the visible link text is small but its click area is the whole row), and the individual segments of the allocation ring, whose full-size alternative is the legend link next to each. Contrast figures are computed from rendered colours; glass and gradient backdrops are approximated by the page colour, so they are an estimate, not a WCAG audit.

Fixes the matrix drove, all in this change: the desktop Portfolio first placed holdings above the summary (an explicit grid row left over from the removed intro), the chart header was scrambled by an old flex rule on tablet and desktop, the period buttons were 46px wide at 768px, positive and negative percentage chips and two tonal buttons were under 4.5:1, and the phone bar and navigation labels broke or grew at large text.

### 200% text

Browser default font size set to 32px (not a CSS zoom), at 320, 375 and 768 wide, 22 cases: no horizontal overflow, and words broken inside a word fell from 53 to 0. At very large sizes the bottom navigation labels stop growing (like a tab bar) instead of breaking, and the phone bar wraps its status and privacy control onto a second line.

### Journeys

39 keyboard and touch checks pass in headless Chrome using real key and pointer events: one tap to each main destination with the primary section on screen; the Sunday restriction, Previous and Next carrying the calendar day they open, Previous stepping Sunday to Saturday to Friday and Next stepping back, and the Next workday button opening Monday; a keyboard entry of three amounts, a forward-only tab order through the card, the live total and a demo save; the in-page jump chips moving focus without changing the route and opening the analysis disclosure; a fund opening and the back control returning; the privacy control and the short status word contained in its accessible name; Previous, Next and Latest staying on one line and moving between statements; every direct link (`#overview`, `#expenses`, `#import`, `#history`, `#connection`, `#months`, a fund); the skip link; forced colours and dark with no overflow; the wide Expenses and Portfolio layouts.

### Interaction shape audit (added after the owner reported a mismatch on the dock)

The owner saw the dock's selection start as a rectangle and animate as a rounded shape. Cause, confirmed: this redesign deleted the late rule `.nav-link, .nav-list::before { border-radius: var(--shape-sm) }`, so dock items became pills while the sliding selection stayed an 8px rectangle, and the browser's own rectangular tap highlight showed on every link because only `<button>` had turned it off. A computed-style audit over all 28 distinct controls then found 15 with no pressed state and 11 hover rules that stick after a tap on touch screens. All are fixed in the shared layers (rules in [Microanimations and interactions](../operations/interactions.md)): one shared radius for the dock, the tap highlight off at the root, one shape-clipped pressed layer, and hover limited to hover devices. After the fix: 0 mismatched indicators, 0 controls with the browser tap highlight, 0 enabled controls without a pressed state, 0 ungated hover rules; the 140-case matrix and the 39 journey checks are unchanged. Not changed: the app still uses two button shapes (pills for the dock-adjacent chrome, primary and tonal buttons; 8px rectangles in Expenses and Month by month). That is a design-language choice for the owner, not a state mismatch.

### Notices and banners (added after the owner called the update banner off-theme)

The owner reported the "Reload to update" banner, and "similar ones", as unpolished. Rendering every notice-like pattern in light and dark showed five unrelated looks: an amber `.notice` used for everything (so "Statement saved" looked like a warning), a grey `.review-adjustments` panel that gave success no sign of success, `.review-problem` errors drawn with a heavy 2px outline, Expenses panels with their own copy of the styling, and loading and failure cards. Every action button inside them was an unstyled browser button, because only a few screens had button styles.

They are now one family (rules in `app.css`, "Notices: one family"):

- **Anatomy:** a panel tinted by its tone inside its own shape, a leading icon, text in the normal text colour so contrast does not depend on the tone, and the app's pill button for the action, on its own row under the text.
- **Tones:** information (blue, the default), success (green), warning (amber), error (red). The tone is told by the icon's shape as well as its colour (info circle, check circle, warning triangle, error circle). The existing classes keep their meaning (`.notice` information, `.review-adjustments` a neutral result, `.review-problem` an error); `.notice-success` and `.notice-warning` change the tone.
- **Assigned by meaning:** saved and consistent results are success; a sheet that needs attention, leaving mid-import, unresolved conflicts, sheets not included and "connect before saving" are warning; the update, demo, device-copy and checking banners stay information; failures are error.
- **Busy:** the loading notice swaps its icon for a spinner (still under reduced motion and forced colours).
- Expenses panels (weekend note, correction review, conflicts) use the same family; the loading and failure cards are notices and no longer cards.

Checked in the rendered app, light and dark, on a phone and on desktop, with the 140-case matrix, the 39 journeys and the shape audit unchanged, and 200% text with no overflow. The Sunday first input moved from y=502 to y=559 because the weekend note is now a fuller panel; it is still in the first screen.

### Evidence categories

- Deterministic: `npm run verify` locally, PASS. CI on Node 22 and 24: separate result.
- Emulated browser: headless Google Chrome 157.0.8103.39 on macOS, fresh profile, network limited to the preview origin, synthetic data only. The matrix and journeys are scratch tooling kept outside the repository (a local scratch directory), not a committed suite or durable artifact.
- Connected states are simulated with a synthetic device copy in browser storage. They do not verify authenticated Google access.
- Not done: the deployed origin, a physical Android or iOS device, Firefox, WebKit, manual screen-reader review, real touch keyboard behaviour around the sticky navigation.

### Remaining decisions and limits

The wide-screen order of Expenses is the one owner decision still open (the weekend default date was decided, see above). Month by month starts its primary content in the first screen but does not fit it. Your data is only 7.2% shorter because its content is a list of safeguards that all remain visible.
