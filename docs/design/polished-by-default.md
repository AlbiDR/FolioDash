# Polished by default

Status: **Accepted by the owner 2026-11-26: all seven recommended decisions (FD-029). Phase 0 in progress.** Owner request: make a strong pass of motion, morphing and dynamism across every element, layer, tab and page, and, more importantly, build the layer that makes coherent, professional, in-motion UI the default an author gets for free, at the level of the Verdin and Talmo demos. References named by the owner: Astryx, responsive CSS Grid, bento-ui, frontend-design, Impeccable, NN/g, Google adaptive app guidance, WCAG 2.2, W3C reflow guidance and the shared UI system.

Authority: [CleanStack](../architecture/cleanstack.md) UXC-1, UXC-4, UXC-5, UXC-11, UXC-12, UXC-13 and ARC-13, the [motion layer](motion-layer.md), [interaction coverage](interaction-coverage.md), the [UI system](ui-system.md) and the [web quality contract](../operations/web-quality.md). This record proposes; it changes none of them. FD-028 (dynamic charts) stays in force; its open question about figures moving on a sync is taken up in phase 7.

## The goal, restated

The owner's bar is "coherent, professional, everything animated and in motion". The measurements below show that the reference demos do not get there by running more animations at once. They get there because every change is continuous (nothing pops in or swaps without a transition), each event moves as one gesture, and one easing family and one set of surfaces repeat everywhere. This record therefore reads "everything in motion" as **every change is animated, and each change is one coordinated movement**, not as more simultaneous movement. Decision 1 asks the owner to confirm that reading.

## What the references do

Measured 2026-11-26 in a fresh built-in browser profile, signed out, observation only. Both demos are commercial templates from one vendor: no markup, styles, scripts, fonts, assets or copy were taken, and none will be. The earlier source survey is the [Verdin motion audit](verdin-motion-audit.md).

| | Talmo | Verdin | FolioDash today (Portfolio, 1024px, synthetic demo) |
|---|---|---|---|
| Easing | One token, `cubic-bezier(.22, 1, .36, 1)` | The same single token | Three in use: standard, smooth and spring (overshoot) |
| Page change | Nothing animates; the page is simply there | One JavaScript-driven stagger: cards fade and rise about 0.6 s each, offset so the page settles in about 1.3 s | `<main>` fades out, then 34 distinct animation kinds start: every card rises, and every heading, subtitle, hero value, chart, mark, ring and bar runs its own recipe |
| Where motion lives | Meaning only: number tickers up and down, a live dot, a spinner, a circular theme reveal through a view transition | Page and list staggers, chart staggers in semantic order, number tickers | 33 keyframes across 23 stylesheets, about 5,050 lines that carry transitions or animations |
| Distinct radii in use (80% of elements) | 12 (4) | 17 (8) | 6 (2) |
| Distinct font sizes on text (80%) | 12 (5) | 12 (6) | 8 (2) |
| Distinct shadows (80%) | 17 (8) | 15 (8) | 10 (6) |

Three conclusions:

1. **FolioDash's token scale is already tighter than both references.** The polish gap is not a missing scale. It is how motion is authored and choreographed.
2. **The references choose one gesture per event.** Verdin's entry is one orchestrated movement of panels. FolioDash's entry is many independent recipes with their own durations and delays, so it reads as many things moving rather than one page arriving. NN/g's guidance points the same way: several animations at once compete, and the more often an animation runs, the shorter and subtler it should be.
3. **The two references disagree about navigation.** Verdin replays its entrance on every page; Talmo keeps navigation still and spends motion on data. Decision 2 asks which FolioDash should follow.

## Audit of FolioDash

### How motion is authored

- **Motion is written per selector, in many places.** 23 stylesheets carry transitions or animations. Import order in `src/interfaces/web/app/main.tsx` decides which declaration wins, so a later file can silently override an earlier one.
- **New polish arrives as new layers.** The four motion commits of 2026-11-26 added `shared/ui/motion/workflow-feedback.css`, `polish.css` and `polish-secondary.css`, each imported after the last. None of the three is in the stylesheet owner table of the [motion layer](motion-layer.md#motion-stylesheets-and-their-owners-step-5-2026-11-19). That record already noted that no check keeps the table honest; this is the drift it predicted.
- **The primitives are good and underused.** `shared/motion/animate.ts`, `settle.ts` and `reduced-motion.ts` are tested and shared by the page exit, row glide, chart morphs, update fade and Presence. Everything else, including every arrival, is CSS keyframes declared in place.
- **An unused animation library is installed.** `motion` 14 is a production dependency in `package.json`. It arrived in `f5c2626` with a set of agent skill files; `c9075f1` removed the skill files to unblock Pages, but the dependency stayed, and nothing in `src` or `scripts` imports it. The motion layer record rules out an animation library, and any dependency needs an FD-008 evaluation. Decision 4.
- **Layout-forcing motion exists under waivers.** Six declarations carry `style-allow layout-motion` waivers, including Presence's collapse of a grid row and its end margin (`shared/ui/motion/refinement.css`) and the sidebar's grid track (`app/styles/shell.css`). UXC-12 allows exactly this, a deliberate layout transition with a reasoned waiver beside it (decision 6).

### What the cascade actually does

All 39 stylesheets were parsed in the order `src/interfaces/web/app/main.tsx` produces, with the lazy feature styles last, and computed styles were read from the production build of `98f4009` at 1440 px. Items marked † were confirmed again by reading the rules. Line numbers are as of `98f4009`.

- **The sidebar collapse does not animate.†** `shared/ui/motion/refinement.css` sets `transition` on `.shell` and `.main-nav` with the same specificity as `app/styles/shell.css` and loads later, so only colour and shadow transition. The grid track and the navigation's slide and fade snap, and the layout-motion waiver in `shell.css` covers a declaration that never applies.
- **Control feedback replaces every control's transition list.** `shared/ui/control-feedback.css` loads last with a stronger selector, so the transitions written for icon buttons, navigation links, the status chip, segmented buttons, row links, legend items, page navigation, chart reset and summaries in `page-chrome.css`, `shell.css`, `controls-and-charts.css`, `interactions/controls.css`, `navigation-and-workflow.css`, `static-and-native.css`, `refinement.css` and both polish files have no effect. At least 13 of the timing edits in `98f4009` landed on these dead lines.
- **Most new workflow states jump instead of animating.** `shared/ui/motion/workflow-feedback.css` changes `scale`, `translate` and `rotate`, but the elements transition `transform` or nothing, so those states snap. Some are permanent rather than tied to a state: the navigation pill sits at a 1.005 scale while `app/app-chrome.tsx` clips it from exact bounds, and one heading is permanently raised by a pixel. Pressing an allocation slice scales it, which contradicts the control-feedback rule that data marks never move or resize.
- **The polish files undo deliberate choices.** `polish.css` and `polish-secondary.css` override springs added on purpose, including one added in the same commit. One rule in `polish-secondary.css` groups the WebKit and Mozilla slider-thumb selectors in one list, so a browser that rejects either drops all 27 selectors; the production minifier happens to split it, but the unminified development server does not.
- **Lazy feature styles win over shared ones.** The expense stylesheets load after every shared file, so they silently replace shared motion for the expense entry and review.
- **Duplicates.** 33 keyframes in 10 files include three identical fades under different names, three selection pulses, three scale-ins and several arrival variants that differ only in direction. Seven transition rules are overridden by a twin in another file or later in the same file.
- **Tokens are bypassed.** About 40 literal motion amounts in `workflow-feedback.css` and more in keyframes skip the `--motion-*` tokens, which the gate does not check. `--duration-navigation` is unused, while the navigation pill hard-codes 360, 550 and 450 ms in `app-chrome.tsx`. `shared/ui/presence.tsx` writes its own reduced-motion query instead of the single one in `shared/motion/reduced-motion.ts`.
- **Reduced motion holds, with one gap.** Every script-driven animation checks the preference, the global override exists in three places, and the last audit found nothing. But the reduced-motion resets in `workflow-feedback.css` lose on specificity to some state rules, so those offsets still apply, instantly, and the tokens' comment that easings are removed for reduced motion is not true.
- **The style gate has blind spots.** It does not recognise logical properties, so `block-size` transitions in `refinement.css` without a waiver, and `margin-block-end` is caught only because a waiver sits above it.
- **The owner table is stale.** Besides the three new files, `presentation/charts/chart-arrival.css` is missing from it, and the motion layer still counts 17 stylesheets where 23 now carry motion.

This is the strongest argument for the proposal: every polish pass so far has been written as another layer that wins by import order, so a large share of the motion that was carefully tuned is never seen.

### What a person sees

- **Page arrival is busy.** On 2026-11-21 the owner extended the Verdin reference to staggered text, count-up figures and charts growing from zero on open and route entry ([interactions](../operations/interactions.md#text-figures-and-chart-arrivals-2026-11-21)), and the same day's coordinated arrival gave them one 560 ms curve and one 55 ms stagger. The result is consistent timing but not one gesture: every heading and subtitle runs its own arrival on top of its card's rise, so text moves twice, and charts, rings and bars start while their card is still rising. This record keeps that direction and changes only how it is coordinated (decision 2).
- **Page change has little continuity.** The shell stays mounted and the navigation highlight stretches to its new item, but the content fades out, the page title replays its arrival, and the next page assembles from nothing. Opening a fund from Holdings, or Month by month from the Portfolio, gives no sense of where the new page came from.
- **Data changes are the strongest part.** A period change morphs every chart line, the trends and the monthly bars, and a holdings sort glides its rows (FD-028). This is the quality bar the rest should reach.
- **Hover overshoots.** Shared control and card feedback uses `--ease-spring`, which bounces past its end. Impeccable advises against bounce and elastic curves by reflex, and neither reference uses one.

The surface-by-surface gap list (instant swaps, layers without an exit, layout jumps) follows in [Gaps by surface](#gaps-by-surface).

## The proposal: motion by role

An author should get polished motion by saying what an element is, not by writing a transition. Every motion in the product belongs to one of six roles, and each role has one owner, one set of tokens and one choreography.

| Role | What it covers | Choreography | Owner |
|---|---|---|---|
| Feedback | Hover, focus, press, release, selection of any control | Immediate, about 100 to 150 ms, no overshoot, no neighbour moves | `shared/ui/control-feedback.css` only |
| Layer | Anything that appears or leaves: notices, disclosures, validation, import steps, sheets | Enter slower than exit (NN/g), exit finished before removal, siblings shift with it | Presence, on Animate |
| Data change | Period, sort, filter, month, fund or search changes on content that stays | Morph from the old geometry or order to the exact new one; settled state equals the unanimated render (UXC-5) | Settle and Animate controllers in `presentation/charts/motion/` and `shared/ui/` |
| Page | Arrival on first load and on navigation | One gesture: regions arrive in reading order with a capped stagger; text, count-ups and chart growth inside a region are timed from that region's arrival rather than on a separate clock; charts draw as their region settles | One arrival owner in `shared/motion/` |
| Continuity | Elements that exist on both sides of a navigation, and an item that becomes a page | Persistent chrome holds still; a holding row or month expands into its page | View transitions with a fallback to the page role (decision 3) |
| Live | Saving, syncing, a status that is still changing, figures that change after a sync | Bounded: stops when the state resolves and never loops past five seconds without a way to stop it (WCAG 2.2.2) | `shared/motion/` |

The rules every role inherits are the motion layer's: tokens only, transform, opacity and paint-only properties, reduced motion removes all movement while state still changes (UXC-13), and privacy hiding, validation and financial values update immediately (UXC-5).

### What makes it the default

- **Feature stylesheets stop declaring motion.** After consolidation, `transition`, `animation` and `@keyframes` may appear only in the role owners: `shared/tokens.css`, `shared/ui/control-feedback.css`, one choreography stylesheet in `shared/motion/` and `presentation/charts/chart-arrival.css`. `verify:style` enforces it as a ratchet that may only shrink, like the existing ones (STD rules in CleanStack section 12). A new screen built from the shared cards, controls and Presence moves correctly without writing any motion.
- **Roles hang off structure that already exists.** Regions are the existing card and `cell-N` grid items; controls are the existing semantic controls; layers are Presence. The arrival order comes from document order inside the page, so an author does not number anything. No production DOM attribute is added for motion, as the motion layer decided.
- **Tokens are named by role, not by value.** For example feedback, state, layer-in, layer-out, page and stagger, plus a stagger cap so a long list never takes longer than one page arrival. One emphasis easing for arrivals (the current `--ease-smooth`, which is the references' curve) and one standard easing for state changes. The spring is retired from feedback and kept, if at all, for the one bounded selection rebound. Durations follow NN/g's 100 to 500 ms range and Impeccable's bands: feedback 100 to 150, state 150 to 300, layers and page changes 300 to 500, a single authored focal entrance up to 800.
- **The proof is automatic.** The rendered audit gains a choreography check per event: how many separately timed groups start, when the page is settled, and that nothing animates a layout-forcing property. Today's numbers become the baseline, and the check only allows them to fall.

### How the named references apply

| Reference | Applied as |
|---|---|
| Astryx | Its dashboard and table templates already govern composition ([register](astryx-reference.md)). Phases 5 and 6 add a register entry for the continuity and layer patterns, with the adaptation recorded (UXC-11). |
| Responsive CSS Grid and bento-ui | The existing `cell-N` bento grid and container queries stay the layout. Regions arrive in their grid reading order, and a layout change caused by a resize never animates; only a person's action does. |
| frontend-design and Impeccable | One signature moment, executed precisely, instead of uniform motion everywhere: the Portfolio headline and its chart drawing in. Their anti-patterns (decoration without purpose, generic fade-and-rise everywhere, hover that moves neighbours, loops that run offscreen, bounce by reflex) become review checks. |
| NN/g | Duration bands, exit faster than entry, frequency rule (frequent motion shorter and subtler), one movement at a time. |
| Google adaptive guidance | Compact, medium, expanded and large width classes (under 600, 600 to 839, 840 to 1199, 1200 and over) are checked against the existing container thresholds. Choreography is defined per class: a phone page arrives as one column in reading order; a wide bento arrives row by row. |
| WCAG 2.2 and W3C reflow | 1.4.10 Reflow: no morph or view transition may cause two-dimensional scrolling at 320 CSS px or 200% text. 2.2.2 Pause, Stop, Hide: live motion ends or can be stopped within five seconds. 2.3.3 Animation from Interactions: met through the reduced-motion preference. 2.4.11 Focus Not Obscured: a view transition or sticky toolbar never hides the focused control. 2.5.8 Target Size is already exceeded by the 48 px rule. |
| Shared UI system | Every role is owned by a shared part; a feature interface imports none from another feature. |

## Gaps by surface

Read from source on 2026-11-26, with the claims marked † checked again against the code or the live renderer. Codes: **swap**, content replaced with no transition; **no exit**, a layer that fades in and then vanishes; **jump**, surrounding layout snaps to a new height. Paths are under `src/interfaces/web/`.

| Surface | Gaps | Where |
|---|---|---|
| Every route | Page arrival only staggers direct children of the page containers, capped at five steps; every programmatic scroll, including the page jump links, is instant; a lazy screen swaps from its loading notice instantly | `app/styles/page-chrome.css`, `shared/ui/page-nav.tsx`, `shared/ui/deferred-view.tsx` |
| Notices outside Presence | `.notice`, `.field-error`, `.review-problem` and `.expense-note` fade in once and have no exit (no exit, jump) | `shared/ui/interactions/content.css` |
| Portfolio chart | Axis labels and readout figures swap during a range change; the tooltip and halo dots have no motion | `presentation/charts/line-chart.tsx` |
| Holdings | Rows removed by a search vanish; the card height snaps on filter or fold; the first keystroke re-fades every visible row | `features/overview/overview-holdings.tsx` |
| Allocation | The centre figure swaps instantly and its font size jumps | `presentation/charts/donut.tsx` |
| Monthly bars | The arrival stagger has no cap†, so with 60 months the last bar starts about three seconds late; the readout value swaps | `presentation/charts/chart-arrival.css` |
| Fund | Copy ISIN swaps its label instantly | `features/overview/fund-view.tsx` |
| Month by month | The summary card is keyed by month†, so every step remounts it and counts every figure up from zero, a misleading cue; the old card vanishes; best and worst marks appear instantly and can change column widths | `features/overview/months-view.tsx` |
| Checkpoints | Rows insert and leave instantly; the withdraw confirmation swaps inline; a data reload remounts the screen and replays the page arrival | `features/checkpoints/checkpoints-view.tsx`, `app/app-checkpoints-route.tsx` |
| Activity | The status control has no sliding selection, unlike the period control; weeks and rows mount, leave and reorder with no glide; totals swap | `features/activity/activity-view.tsx` |
| Expenses | The entry form is removed instantly on weekends (a large jump); field errors have no motion; the week and year views swap their content; the "changes are still here" panel has no exit; the correction review animates twice | `features/expenses/expense-entry-card.tsx`, `expense-week-card.tsx`, `expense-year-section.tsx` |
| Import | The screen sits inside an inert wrapper, so neither Import nor History gets the page arrival†; the entry-method switch has no sliding selection and its outgoing panel vanishes; file steps and the review region mount instantly; removing a manual fund is instant | `app/app-import-routes.tsx`, `features/import/import-view.tsx`, `manual-entry.tsx` |
| History | The Excel journey's steps swap instantly and each statement remounts | `features/import/excel-history-view.tsx`, `features/history/history-view.tsx` |
| Your data | The busy line appears and leaves instantly, pushing every card below; the jump links, Verify, Organize and Reconnect appear instantly; the forget-device confirmation has no exit | `features/account/account-view.tsx`, `account-maintenance.tsx`, `account-device-section.tsx` |
| Shell | The back button mounts instantly and shifts the title; the status chip's width jumps when it changes | `app/app-chrome.tsx` |
| Dead or conflicting rules | `.mode-row` motion has no component; the page navigation's own entrance is overridden by the page arrival; `.expense-review` has two competing keyframes; the update notice's own entrance never runs because Presence switches child animations off | `shared/ui/motion/navigation-and-workflow.css`, `refinement.css`, `charts-and-content.css`, `features/expenses/styles/categories-and-record.css` |

There are no dialogs, sheets, popovers, menus or toasts: every confirmation is an inline swap. Phase 6 gives each row above its role; the Month by month count-up is a correctness problem as much as a polish one and comes first.

## Phases

Each phase is its own commit, follows `npm run verify`, the interaction inventory, the rendered and reduced-motion audits and `npm run capture:readme`, and states what it could not prove. Phases 1 and 3 are behaviour-neutral; phase 0 restores intended behaviour; the others are design changes and are recorded as such.

0. **Repair what is broken.** Make the sidebar collapse animate again, make the workflow states transition the properties they change, remove the permanent scales and offsets, split the slider-thumb selector list, and teach the style gate logical properties. These are fixes to work that was meant to ship, not new design.
1. **Ledger and baseline.** Add the four unlisted stylesheets to the motion owner table, add the check that keeps the table complete, and add the choreography measurement to the rendered audit with today's numbers as the baseline. Decide the `motion` dependency (decision 4).
2. **Role tokens and easing.** Introduce the role-named tokens and map the existing ones onto them; retire the spring from feedback. Visible change: hover and press stop overshooting.
3. **Consolidate owners.** Fold `polish.css`, `polish-secondary.css`, `workflow-feedback.css`, `refinement.css` and the motion declarations in `app/styles/` and `features/` into the role owners, without changing what renders. Turn on the ratchet that keeps feature stylesheets free of motion.
4. **One page gesture.** Regions arrive in reading order with a capped stagger; text, count-ups and chart growth are timed from their region's arrival; charts start as their region settles. How much of this replays on in-app navigation follows decision 2.
5. **Continuity.** Same-document view transitions for navigation where supported, with the current page motion as the fallback and nothing under reduced motion. Sidebar, toolbar and page title hold still; a holding row expands into its fund page and a month into Month by month.
6. **No instant swaps.** Every gap in the surface list gets its role: Presence for layers, a fade-through with height continuity for content that is replaced, a morph for content that stays.
7. **Live states and figures.** Bounded saving, syncing and status motion; answer FD-028's open question on whether figures count when a sync changes them, with exact text, accessibility and privacy unchanged.
8. **Proof beyond Chrome.** Physical Android and iPhone, Firefox and WebKit, and a screen reader. Until then every phase stays local synthetic Chrome evidence (STD-11).

## Decisions for the owner

The owner accepted every recommendation below on 2026-11-26 (FD-029). Decision 2 amends the 2026-11-21 per-route arrival direction.

1. **Meaning of "everything in motion".** Recommended: every change is animated and each event is one coordinated movement. Alternative: more simultaneous motion, which the references and NN/g advise against.
2. **Navigation.** The owner's 2026-11-21 direction is Verdin's: staggered text, count-ups and growing charts on open and on every route entry. Recommended: keep the full arrival on first open and when a page is entered from outside the app, and make in-app navigation a short continuity transition where persistent chrome stays still and the new page arrives as one quicker gesture, closer to Talmo and to NN/g's rule that frequent motion should be shorter. Alternative: keep the full arrival on every route entry, as now, coordinated into one gesture. Choosing the recommendation amends the 2026-11-21 direction, so it needs the owner's word.
3. **View transitions.** Recommended: adopt same-document view transitions as the continuity mechanism, feature-detected, with the current page motion as the fallback. It is a new mechanism, so it gets its own entry here and in the Astryx register.
4. **The `motion` package.** Recommended: remove it. The Web Animations API, the shared primitives and view transitions cover every role above. Keeping it requires an FD-008 evaluation and an amendment to the motion layer's no-library rule.
5. **Spring easing.** Recommended: retire it from hover and press; keep at most the bounded selection rebound.
6. **Layout motion.** Recommended: keep the reasoned-waiver gate, since the notice collapse and sidebar resize have no transform-only equivalent that preserves their geometry. On checking, UXC-12 already says a deliberate layout transition carries a reasoned waiver, so the rule and the gate agree and no amendment is needed.
7. **Strictness of the default.** Recommended: feature stylesheets may not declare motion at all after phase 3. Alternative: allow it with a waiver, as layout motion is.

## Out of scope

- No change to financial calculation, chart policy or privacy timing.
- No copying from Verdin, Talmo or any other template, and no new dependency.
- Surfaces, depth and typography beyond motion: the [Depth and hierarchy](depth-and-hierarchy.md) draft owns them.
- No motion gallery or preview route.
