# Consolidation plan

Status: **Direction accepted 2026-11-28: the owner delegated the choice of amendments to the assistant ('you choose what's best'). The choices are in the next section. No code is changed yet; each amendment is made in its authoritative document in the phase that needs it, and the owner can reverse any of them.** Owner direction: move from feature building to consolidation, so that the product reads as one composition with a deliberate hierarchy, not a patchwork of features that took the space they found. This record proposes; it changes none of the contracts it names until the owner decides each amendment.

Authority: [UI system](ui-system.md), [Depth and hierarchy](depth-and-hierarchy.md), [Motion layer](motion-layer.md), [Interaction coverage](interaction-coverage.md), the [web quality contract](../operations/web-quality.md) and the [Astryx reference](astryx-reference.md). FolioDash's privacy, financial geometry and reduced-motion rules stay in force.

## How this was produced

Nine read-only research passes on 2026-11-28, one per source: Astryx, Modern Web Guidance, UnSlop, BoardUI, Bklit, BeautifulUI, Transitions, Bencho and KokonutUI. Each looked at its source and compared it with FolioDash, using the published synthetic-data demo or the CSS. No source code, asset, font or dependency was copied or installed, and no real data was used. Standard set by the owner: a source is useless only when we gain nothing from it, contracts may be amended when a real gain needs it, and polish is rebuilt natively in Preact, Vite and our tokens, so a source's framework is no reason to drop an idea.

Limits of the evidence: dark mode and Chrome only, mostly 1440px; light mode, hover and press states and phone widths were largely not measured; motion numbers come from computed styles, not watched playback; four passes compared against our CSS rather than the rendered demo.

## What the passes agree on

| Finding                                                                                                                                                        | Sources                                           | Evidence                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Controls and rows are large for desktop: 48px controls, 74px list rows, 54 by 48px segmented pills. References use 32 to 36px visual controls.                 | Astryx, BoardUI, BeautifulUI, KokonutUI           | Measured                                                                   |
| The spacing scale has no 12px step, so authors write 0.6 to 0.9rem literals, and there is one `--section-gap` where Astryx has local, group and section tiers. | UnSlop, Astryx, Modern Web Guidance               | 66 literal spacing uses against 405 token uses; 28 distinct literal values |
| Too many radii, heading sizes and hover durations: five radii, headings from 14 to 24px, hover durations of 100, 180, 220 and 380ms.                           | Astryx, UnSlop, KokonutUI                         | Measured                                                                   |
| Cards combine a shadow and an inset ring, and nested panels sit inside cards.                                                                                  | Astryx, KokonutUI                                 | Matches open question 2 in Depth and hierarchy                             |
| Exit motion equals enter motion; references run exits at about 60 to 70 percent.                                                                               | Transitions, Astryx                               | Computed styles                                                            |
| Charts need one inspection language: tooltip anatomy, one linked readout, neighbours dimmed on selection.                                                      | Bklit, KokonutUI, Bencho                          | Rendered, partly                                                           |
| No shared anatomy for status, rows, tables and validation errors.                                                                                              | BeautifulUI, BoardUI, Astryx, Modern Web Guidance | Rendered and read                                                          |

## Corrections from reading our own records

Two proposals from the passes conflict with decisions already taken, and are dropped or reshaped here:

- **Delta chips and status pills.** The 2026-11-28 polish pass deliberately turned gain and loss into signed coloured text and Activity's Complete and Partial pills into a status dot and word. The BoardUI delta chip and the BeautifulUI status pill would reverse that. Not proposed. A glyph beside the sign is a separate small question for the owner.
- **Weights.** The bold weight token already equals the semibold value, so nothing renders heavier than 600. The remaining work is to delete the duplicate token and unify heading recipes, not to cap weights.

## Proposed contract amendments

Each is for the owner to accept, change or refuse. The 48px target rule is stated in both the UI system and the web quality contract, so amendment 1 changes both.

1. **Control size.** A 32 to 36px visual size with a 48px hit area, on fine pointers at 1024px or wider only. Touch and phones keep 48px (measured at 375px: 53 controls at 48px, neighbours already 0 to 2px apart). A 48px hit area on a 32px visual reaches 8px past each edge, and on desktop 37 of 75 main-area targets have a neighbour within 12px, so the extension must be capped at half the gap and stacked rows and segmented groups need 16px spacing or a 40px minimum. This is a medium change, not a small one.
2. **Spacing.** Add the 12px step and three tiers (local, group, section) over the single `--section-gap`.
3. **Type roles.** One heading recipe per level, `--leading-tight` near 1.3 for titles that wrap, one card title size, duplicate weight token removed.
4. **Elevation.** Three depth tiers (flat, card, hero) and one edge language per surface, answering open question 2 in Depth and hierarchy. The glass material stays as chosen by the owner.
5. **Motion.** Exit at about 60 to 70 percent of enter, a real layer entrance, a direction-aware page change, one hover duration, and figure swaps limited to transform and opacity. Blur never touches figures.
6. **Interaction.** Validation shows after the first blur or submit, the focus ring does not move the control, and a compact desktop tier is named.

## Choices made on the owner's delegation

| Amendment | Choice | Reason |
|---|---|---|
| 1. Control size | Accept, desktop fine pointers only, made in phase 3 | Four sources agree; touch keeps 48px; the hit-area overlap needs the phase 3 spacing work first |
| 2. Spacing | Accept, made in phase 1 | Measured literals fill the missing 12px step |
| 3. Type roles | Accept, made in phase 1 | Heading sizes and leading differ per card; the weight cap already holds |
| 4. Elevation | Accept, made in phase 2 | Answers open question 2 in Depth and hierarchy; glass material kept |
| 5. Motion | Accept exit asymmetry, one hover duration, a real layer entrance, figure swaps limited to transform and opacity. Defer the direction-aware page change: the page transition shipped in the Polished by default phase 5 and has no measured fault | Smallest change that closes the measured gaps |
| 6. Interaction | Accept validation after first blur or submit, and a focus ring that does not move the control. Defer a shared hover indicator | Both accepted items are measured gaps; the indicator is cosmetic |

Refused: count-up or rolling digits on financial figures (cosmetic, against immediate updates), and the hold-to-confirm button (needs a bounded-fill exception for a cosmetic gain).

## Phases, in layer order

Each phase ends with a green `npm run verify`, a rendered audit, a local `npm run capture:readme`, and its own record here. Phases 1 and 2 change little that is visible; phase 3 is the largest.

1. **Tokens.** One radius set (controls, with pills staying 999px by an explicit rule for which controls are pills; 16 cards; the shell lowered from 20px to 16px; nested panels with a documented 8px floor, since outer 16 minus padding 16 would be 0), the spacing ladder and tiers, type roles and leading, one hover token, exit tokens, a density axis, a chart token set. Replace the off-grid literals in `app/styles/controls-and-charts.css`, `shell.css`, `review-and-your-data.css`, `tables.css` and `page-chrome.css` first.
2. **Elevation and containment.** Three tiers, one edge language, de-box the nested chart panel and the Portfolio support stack.
3. **Control rhythm and shell.** The compact desktop controls, sidebar groups with Your data pinned at the foot, segmented and tab sizing, one table header and row recipe, hairlines between rows, a soft edge shadow on a pinned column only while scrolled.
4. **Shared anatomies.** One row anatomy, one stat tile, one validation error rule across the five forms, and a native dialog and popover tier when the first overlay is needed.
5. **Charts.** A refined tooltip anatomy (it exists as `.chart-inspection-tooltip`: 224px, 4px 8px padding, 8px radius, solid fill, no total, no swatches; the proposal is a date header, series dots beside labels, roomier padding about 8px 12px and muted labels over brighter values; blur only if the reduced-transparency path is kept), a solid crosshair fading at its ends as a weak option (point halos already exist), one linked inspection readout across the Performance card, dimming of unselected marks, one first-draw reveal capped near 600ms. Geometry stays exact and canonical. Smoothed lines, dashed grids, swell under the cursor and data marks that move are rejected.
6. **Motion.** Apply amendment 5, then one audit for stray durations and curves.
7. **Import review.** A before and after treatment with a change count in the review, keeping the consent and recovery path and never showing an estimate as a fact.

## Rejected on evidence

Curved lines (would invent values between statements), dashed grid (dashes already mean Net invested), blur on figures, a keypad for expense entry, wake and ASCII effects, gauge, heatmap and meter (no matching data), a quota meter (no limits in the product).

## Phase 1 record, 2026-11-28

**Done.** Tokens: the 12px step (`--space-2-5`), the tiers (`--space-local`, `--space-group`, `--space-section`) with `--section-gap` kept, `--time-hover` and `--time-exit` (both unused, no value changed), `--leading-title` (unused), `--weight-bold` removed (a pure alias of 600; ten stylesheets and the portfolio study moved to `--weight-semibold`), and `--shape-xl` 20px to 16px for the shell. Replaced in `shell.css`: the nav padding, brand padding, nav link padding, a 4px gap and a 0.75rem gap; in `controls-and-charts.css`: the donut margin, the legend padding, the perf row gap; in `review-and-your-data.css`: the account section gap, the plain list indent, the steps margin and the build stamp margin; in `tables.css`: three 0.5rem values and the matrix cell padding; in `page-chrome.css`: the status chip and the privacy toggle.

**Not replaced, because a box would move by more than 2px (each is a decision for you).** Measured as a same-state before and after on the local build, so these are the edits that were tried and reverted: the holdings table cell padding `0.7rem` (to 12px: +1.6px a row, and the rows add up to a drift of up to 45px lower on the Portfolio page at 375px together with the next item); the `.perf` gap `0.15rem` and `.perf-row` padding `0.45rem` (seven rows each +1.6px, about 21px over the card); the list gaps `0.6rem` in `.plain-list` and `.steps` (to 8px: 3.2px over three items); the `.legend a` gap `0.6rem` (name shifts 1.6px and widens 3.2px at 1440px); the segmented button padding `0.8rem` and link padding `0.9rem` (the Activity status control narrows by 4.8px). Left because they are not on the ladder and are not whole-pixel rhythm: 2px and 3px nudges in the segmented control and nav list, `-1px` visually hidden margins, `0.1rem` nav link gap (a 2.4px shift), the 1.25rem values (a 4px shift either way), `2.25rem` and the `6.5rem` bottom navigation clearance.

**Evidence.** Computed before and after on the local production build with synthetic data and no service worker, same state for both, all five screens. At 1440px and at 375px no page height changed and no box moved by more than 1.6px (the largest was 1.6px). Portfolio padding and gap values off the 4px grid: 412 of 2,582 down to 404 at 1440px; 562 of 2,381 down to 558 at 375px; distinct padding values 15 to 14 at 1440px and 13 to 12 at 375px. The first comparison against an earlier snapshot was invalid because the update notice and a changed Expenses state shifted pages by up to 62px, and is not used.

## Open before phase 1 starts

Settled by the third pass on 2026-11-28:

- The chart tooltip exists and is small; the chart phase is a modest refinement, and the earlier claim that halos were missing was wrong.
- The compact controls and radius set hold in light mode. Muted text measures 5.89:1 on the card and about 5.3:1 on the page background, so muted text at 400 weight needs 500 on the page background.
- Astryx `shell-nav` renders as an IDE-style frame with no dashboard relevance.

Still open:

- Astryx `theme-showcase` was not rendered.
- Hover contrast in light mode, phone-width tooltip taps and live keyboard focus on charts were not checked.
- The Astryx reference register needs a new row for this work, with the upstream revision reviewed (`f4df1d9`).
- The owner may reverse any choice above before the phase that uses it.
