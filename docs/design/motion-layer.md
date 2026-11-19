# Motion layer

Status: **Revised 2026-11-19 after review; step 1 started.** Owner request: make UI and UX animation easy to create, review and prove, now and as the app grows. This record decides the shape and the order. It does not change any visual design or token value. The first draft was committed in `0f63c5a`; this revision supersedes it.

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
- Only properties the style gate allows may animate: transform, opacity and paint-only properties such as colour, shadow and border colour. Layout-forcing properties never animate. UXC-12's wording says "only transform and opacity", which the gate does not enforce. Until the owner decides between the two, new motion follows the gate and any paint-only transition is named in its design record.
- Reduced motion removes all transition and movement, and visible state still changes (UXC-13).
- Privacy hiding, validation and every financial value update immediately (UXC-5). A chart morph animates presentation only. Its settled state must equal the exact projection that the unanimated chart draws.
- Pure timing and geometry live in `.ts` files with their own tests. React hooks stay thin and only connect a controller to a render.
- There is no motion state attribute in the production DOM. Browser audits find motion through `element.getAnimations()` and wait for it to empty, rather than waiting a fixed time. The audits already do this for the chart morphs, the holdings glide and the bar morph.

## Migration order

Each step is behaviour-neutral, so the built output and the audits must not change. A step that changes timing or appearance is a separate commit and is recorded as a design change.

1. **Animate and Settle, then row glide and bar morph.** Add the primitives with their own tests, and move `row-glide.ts` and `bar-morph.ts` onto them. Their existing stub tests and the holdings and range journeys are the proof.
2. **Presence.** Move `presence.tsx` onto Animate. Check the rendered audits for every screen that opens or closes a panel.
3. **Chart hooks and page motion.** Move `use-geometry-morph.ts`, `use-update-fade.ts` and `use-page-motion.ts` onto Animate and Settle. Check the chart geometry tests and the reduced-motion audit.
4. **Reorder, and Tween when a consumer exists.** Generalise the reorder technique only when a second keyed consumer needs it.
5. **Remove duplicated timing and inventory the CSS.** Delete constants the migrated code no longer uses, regenerate the interaction inventory (UXC-4), and list every motion stylesheet with its owner.

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
- No spring physics beyond the existing `--ease-spring` token.
- No scalar tween until a consumer exists.

## Decisions and open questions

- **Decided:** no motion attribute in the production DOM. Audits use `element.getAnimations()`.
- **Decided:** step 1 is the Animate and Settle primitives with row glide and bar morph. Presence follows as step 2. The scalar tween is not built now.
- **Open, for the owner:** UXC-12 says only transform and opacity animate, but the style gate also allows paint-only properties and blocks only layout-forcing ones. Should the rule's wording change to match the gate, or should the gate be tightened to match the wording? The card hover built on 2026-11-19 animates shadow, background and border colour, so it depends on the answer.
