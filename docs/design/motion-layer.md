# Motion layer

Status: **Revised 2026-11-22 after the Verdin adaptation review.** The Animate and Settle primitives exist in `shared/motion/`, and the row glide, bar morph and presence use them. The data-reveal recipes below now give charts named, token-owned adoption points. Owner request: make UI and UX animation easy to create, review and prove, now and as the app grows. This record decides the shape and the order. It does not change financial calculation or privacy timing. The first draft was committed in `0f63c5a`; this revision supersedes it.

Authority: [CleanStack](../architecture/cleanstack.md) UXC-1, UXC-4, UXC-5, UXC-12, UXC-13 and ARC-13, the [interaction coverage](interaction-coverage.md) contract and the [rendered interaction audit](../operations/interactions.md). Architecture, not a redesign, so the [Astryx reference](astryx-reference.md) is not the governing reference for the mechanics. Any visual change still follows its own design record.

## Context

- **Tokens already exist.** Durations, easings and motion amounts are in `src/interfaces/web/shared/tokens.css`. `verify:style` rejects motion and colour literals and rejects animating layout-forcing properties such as size, position and spacing.
- **Feedback for controls exists.** Every semantic control inherits `src/interfaces/web/shared/ui/control-feedback.css`. Motion CSS is wider than that file: 17 stylesheets carry transitions or animations, including `shared/ui/motion/`, `shared/ui/interactions/`, `app/styles/` and the feature styles. Container hover (cards) lives in `shared/ui/motion/refinement.css`.
- **Element animation is written six times.** `row-glide.ts`, `bar-morph.ts`, `use-geometry-morph.ts`, `use-update-fade.ts`, `presence.tsx` and `use-page-motion.ts` each call `element.animate`, keep their own animation record, cancel on interruption, read the duration and easing tokens and check reduced motion.
- **"Settle after render" is written four times.** Row glide, bar morph and the two chart hooks compare what this render draws with the last one, and then move what changed.
- **Reduced motion has no single reader.** Six modules call `window.matchMedia` directly. `presence.tsx` uses the reactive `use-media-query.ts` hook. Both readings must become one.
- **Proof was brittle in one specific way.** On 2026-11-19 a hover check failed in CI for two runs. It assumed a fine pointer that CI's headless renderer does not report, and it waited on fixed delays. The lesson is to assert the preconditions the check depends on, and to wait for the state rather than for time. Pure functions in `motion-timing.ts`, `row-glide.ts`, `bar-morph.ts` and the chart geometry already have millisecond tests, so the timing logic is the part that can be proven cheaply.

## Decision

Add one shared motion layer, a small set of primitives, not an animation library.

1. **Animate.** Starts keyframes on one element, replacing any motion that element already has, and stops it. Takes keyframes, not a single number, because the chart morphs are affine transforms. Duration and easing come from the motion tokens, read with `timingFrom`. Returns nothing to animate when reduced motion is on or the Web Animations API is missing. Lives in `shared/motion/animate.ts`.
2. **Settle.** Remembers what the previous render drew and which choice it belonged to, and reports whether that choice changed. Lives in `shared/motion/settle.ts`. Each controller decides what to move; Settle decides only whether anything changed.
3. **Reduced motion.** One reader, `prefersReducedMotion()`, in `shared/motion/reduced-motion.ts`. Controllers take a `Motion` by parameter, so their tests can supply a fixed answer. Components that need a live value may still use `use-media-query.ts`.
4. **Presence.** Enter and exit for elements that appear or leave, with the exit finished before removal. Moves onto Animate in step 2. Keeps its interface.
5. **Reorder.** The first, last and invert technique for keyed elements, generalised from `row-glide.ts` when a second consumer needs it.
6. **Tween.** A scalar interpolation. Not built now: no consumer exists, since the figure tween was dropped when no headline figure turned out to depend on the period. It is added only when a consumer needs it.

Placement: the primitives live in `shared/motion/`, beside the other shared UI, in the web interface. `shared` stays domain-blind (ARC-13), so no primitive knows what a fund, a value or a privacy setting is. Chart morph arithmetic stays in `presentation/charts/motion/` and calls Animate.

The feedback CSS keeps its present owners for now. A later step inventories the 17 stylesheets against one list of owners.

## Rules for every motion

- Durations and easings come from tokens. A primitive takes a token name, never a number. Colours come from colour tokens.
- Only properties that do not force layout may animate, as UXC-12 now states: transform, opacity and paint-only properties such as colour, shadow and border colour. Layout-forcing properties never animate. Any paint-only transition is named in its design record.
- Reduced motion removes all transition and movement, and visible state still changes (UXC-13).
- Privacy hiding, validation and every financial value update immediately (UXC-5). A chart morph animates presentation only. Its settled state must equal the exact projection that the unanimated chart draws.
- Pure timing and geometry live in `.ts` files with their own tests. React hooks stay thin and only connect a controller to a render.
- The shared primitives add no DOM attributes. Browser audits find motion through `element.getAnimations()` and wait for it to empty, rather than waiting a fixed time. The audits already do this for the chart morphs, the holdings glide and the bar morph.
- Presence keeps its `data-present` and `data-settled` attributes. `refinement.css` reads them to clip a notice while it collapses, so they are styling state that the page depends on, not test signals. Removing them would change the page, so step 2 does not.

## Recipe catalogue

This is the product's reusable vocabulary, not a count of incidental CSS declarations. A new interface uses a named recipe, its token and its proof rather than introducing an unnamed keyframe. Recipes group into the requested 10 structural animations, 15 micro-animations and 5 micro-interactions.

| Family | Recipes | Shared owner and first applied consumer |
| --- | --- | --- |
| Structural animation (10) | panel arrival; ordered content arrival; text arrival; figure transition; line geometry morph; bar rise; ranking-bar rise; ring-slice reveal; checkpoint reveal; keyed-row reorder | `shared/motion/`, `presentation/charts/chart-arrival.css`; Portfolio cards, bars, allocation, checkpoints and holdings |
| Micro-animation (15) | navigation surface; current-nav emphasis; navigation-toggle cue; search-field boundary; icon-button surface; primary, secondary and quiet action states; inline-link underline; chip hover; chip selected state; tab label; sort-header state; row inspection; date-step direction | `shared/ui/control-feedback.css` and `shared/ui/motion/`; shared controls and Portfolio |
| Micro-interaction (5) | inspect observation; pin/reset observation; choose reporting range; adjust a bounded value; undo or reverse a transient action | `presentation/charts/`, `shared/ui/range-selector.tsx`, `shared/ui/presence.tsx`; chart inspection, range controls and recovery notices |

The first five newly named chart recipes use only `--motion-index`, supplied by the mark's semantic order. `motion-bar-rise`, `motion-ranking-rise`, `motion-ring-slice` and `motion-marker-arrive` live in `chart-arrival.css`; the selected chart-bar rebound remains in its owning `bars.css`. Chart components use `presentation/charts/motion/recipe.ts` to choose only these named recipes and normalize their semantic order; they do not reproduce CSS names, timing or delays. `motion-range-select` names the reporting-window confirmation in the shared RangeSelector rather than relying on a generic segmented-control declaration. They never delay text, accessibility state, private masking or the exact settled financial geometry. The remaining recipes will be migrated from their existing isolated owners only with a component consumer and rendered proof; they are not counted as completed merely because a matching transition already exists.

## Migration order

Each step is behaviour-neutral, so the built output and the audits must not change. A step that changes timing or appearance is a separate commit and is recorded as a design change.

1. **Animate and Settle, then row glide and bar morph.** Add the primitives with their own tests, and move `row-glide.ts` and `bar-morph.ts` onto them. Their existing stub tests and the holdings and range journeys are the proof.
2. **Presence.** Move `presence.tsx` onto Animate. Check the rendered audits for every screen that opens or closes a panel. Done: the sibling shifts run on Animate, with the same carry-over. The import journey asserts the shift on removal and on undo, because no audit covered it before.
3. **Chart hooks and page motion.** Move `use-geometry-morph.ts`, `use-update-fade.ts` and `use-page-motion.ts` onto Animate and Settle. Check the chart geometry tests and the reduced-motion audit. Done: the update fade and the geometry morph run on Animate and Settle, and a new geometry still replaces a morph in progress. The page controller keeps its handler order and its timeouts, so the page motion tests are unchanged. A route check in the range journey proves the exit and arrival in the browser, since no audit covered them before.
4. **Reorder, and Tween when a consumer exists.** Generalise the reorder technique only when a second keyed consumer needs it. Closed 2026-11-19 without code. The only user-driven reorder is the holdings sort, which the row glide already serves on both the table and the phone list. The bar morph is keyed by month, but a period change triggers it and it applies an affine map, so it is a different motion and not a second reorder. No animation-frame caller tweens a value, so no tween is built. Revisit when a second user-driven reorder appears, or when a value needs to count up.
5. **Remove duplicated timing and inventory the CSS.** Delete constants the migrated code no longer uses, regenerate the interaction inventory (UXC-4), and list every motion stylesheet with its owner.

## Motion stylesheets and their owners (step 5, 2026-11-19)

The original seventeen stylesheets carry transitions, animations or keyframes. Two additional owners are recorded below for the selected surfaces prototype and the actual Portfolio refinement of 2026-11-21, and four more on 2026-11-26: the chart arrival recipes, which had been missing, and the three layers added that day, which [Polished by default](polished-by-default.md) folds into role owners in its phase 3. Each stylesheet has one owner: the design record that governs its area. Step 5 itself moved no value and changed no motion; subsequent visual changes are recorded in their own design documents.

| Stylesheet | Motion it holds | Owner |
|---|---|---|
| `features/overview/styles/portfolio-polish.css` | readout inspection surface, paint-only background and shadow feedback | [Portfolio refinement](portfolio-refinement.md) |
| `presentation/charts/bars.css` | bar emphasis and readout styling inherited from the selected baseline | [Depth and hierarchy](depth-and-hierarchy.md) |
| `shared/ui/control-feedback.css` | press, hover and focus feedback for every semantic control | [Interaction coverage](interaction-coverage.md) |
| `shared/ui/interactions/controls.css` | control feedback for the numbered additions | [Interaction coverage](interaction-coverage.md) |
| `shared/ui/interactions/content.css` | disclosure opening and closing, guide and confirmation cues | [Interaction coverage](interaction-coverage.md) |
| `shared/ui/motion/refinement.css` | arrivals, surfaces, presence and card hover | This record |
| `shared/ui/motion/navigation-and-workflow.css` | navigation and workflow motion | This record |
| `shared/ui/motion/charts-and-content.css` | legend and content-state feedback | This record; chart marks follow [interaction coverage](interaction-coverage.md) |
| `shared/ui/motion/static-and-native.css` | native and static elements, and the sparkline area | This record |
| `presentation/charts/charts.css` | chart series reveal and emphasis | [Interaction coverage](interaction-coverage.md) |
| `app/styles/shell.css` | sidebar and layout transitions | [UI system](ui-system.md) |
| `app/styles/page-chrome.css` | page identity, page arrival and global controls | [UI system](ui-system.md) |
| `app/styles/controls-and-charts.css` | segmented controls and their feedback | [UI system](ui-system.md) |
| `app/styles/forms-and-buttons.css` | form labels and import screens | [UI system](ui-system.md) |
| `app/styles/tables.css` | table row feedback | [UI system](ui-system.md) |
| `app/styles/content-and-notices.css` | notice and busy-state motion | [UI system](ui-system.md) |
| `features/overview/styles/holdings-and-attention.css` | holdings share bars and attention | [Dashboard coherence](dashboard-coherence.md) |
| `features/expenses/styles/categories-and-record.css` | expense categories and record arrival | [Work and expenses](work-expenses-experience.md) |
| `features/expenses/styles/responsive-and-hover.css` | expense layout and hover | [Work and expenses](work-expenses-experience.md) |
| `presentation/charts/chart-arrival.css` | named chart arrivals: bar rise, ranking rise, ring slice, marker arrival and selection rebound | This record ([recipe catalogue](#recipe-catalogue)) |
| `shared/ui/motion/workflow-feedback.css` | small state movements for workflow controls, their icons and their cards | [Polished by default](polished-by-default.md) |
| `shared/ui/motion/polish.css` | one easing for existing transitions and animations | [Polished by default](polished-by-default.md) |
| `shared/ui/motion/polish-secondary.css` | a second easing pass for further existing owners | [Polished by default](polished-by-default.md) |

Since 2026-11-26 `npm run verify:style` keeps this table complete: a stylesheet under the web interface that declares a transition or an animation, or defines keyframes, fails the check until it has a row here, and a row whose stylesheet is gone or no longer moves fails too (`scripts/verify/code/motion-owners.ts`).

## Proof

- Every primitive has pure tests covering start, replacement of an earlier motion, completion, stop, reduced motion and a missing Web Animations API. These run in the normal test suite.
- The reduced-motion audit must still pass unchanged (UXC-13). The rendered interaction audit must still show each migrated control's feedback.
- Any control that a step adds or changes is regenerated in the interaction inventory and reviewed. A matching CSS selector is not coverage on its own.
- A green build is not proof of motion. The rendered audits and the pure tests are the evidence. A step that cannot show them stays open.
- Browser checks assert the preconditions they depend on. A check that needs a fine pointer says so, and where the renderer has none it asserts the fallback instead.

## Out of scope

- No animation library or new dependency.
- No motion gallery or preview route, which would be a speculative layer.
- No change to token values or to the visual design.
- No spring physics beyond the existing `--ease-spring` token. Since 2026-11-26 that curve is `--ease-rebound`, kept only for a selected chart mark's rebound ([Polished by default](polished-by-default.md#phase-2-record-2026-11-26)).
- No scalar tween until a consumer exists.

## Decisions and open questions

- **Decided:** no motion attribute in the production DOM. Audits use `element.getAnimations()`.
- **Decided:** step 1 is the Animate and Settle primitives with row glide and bar morph. Presence follows as step 2. The scalar tween is not built now.
- **Decided 2026-11-19 by the owner:** UXC-12 matches the gate. Layout-forcing properties never animate, and transform, opacity and paint-only properties may. The gate is unchanged. The card hover's shadow and colour transitions therefore sit inside the rule. The gate's header comments now describe the same list.
