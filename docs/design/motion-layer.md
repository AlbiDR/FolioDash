# Motion layer

Status: **Proposed 2026-11-19, not started.** Owner request: make UI and UX animation easy to create, review and prove, now and as the app grows. This record decides the shape and the order. It does not change any visual design or token value.

Authority: [CleanStack](../architecture/cleanstack.md) UXC-1, UXC-4, UXC-5, UXC-12, UXC-13 and ARC-13, the [interaction coverage](interaction-coverage.md) contract and the [rendered interaction audit](../operations/interactions.md). Architecture, not a redesign, so the [Astryx reference](astryx-reference.md) is not the governing reference for the mechanics. Any visual change still follows its own design record.

## Context

- **Tokens already exist.** Durations, easings and motion amounts are in `src/interfaces/web/shared/tokens.css`, and `verify:style` enforces them.
- **Feedback already exists.** Every semantic control inherits `src/interfaces/web/shared/ui/control-feedback.css`.
- **Motion is hand-written in several places.** Row reordering lives in `src/interfaces/web/shared/ui/row-glide.ts`, presence (enter and exit) in `presence.tsx`, page transitions in `use-page-motion.ts`, and chart morphs in `src/interfaces/web/presentation/charts/motion/`. Each one solves start, interruption and reduced motion again.
- **Proof is slow and brittle.** The rendered audit is the only proof for most interaction states, and it waits on fixed timeouts. On 2026-11-19 a hover check timed out in CI, which blocked a release while the code itself was not at fault. Pure functions in `motion-timing.ts`, `row-glide.ts` and the chart geometry already have millisecond tests, so the timing logic is the part that can be proven cheaply.

## Decision

Add one shared motion layer, a small set of primitives, not an animation library:

1. **Tween.** Interpolates one value between two states using a duration and easing token. Pure function first, with a thin hook on top. Interruption starts from the current value, never from the start.
2. **Presence.** Enter and exit for elements that appear or leave, with the exit finished before the element is removed. Replaces `presence.tsx` internals and keeps its interface.
3. **Reorder.** The first, last and invert technique for moving rows, extracted from `row-glide.ts`.
4. **Feedback.** Press, hover and focus for controls. CSS only, owned by `control-feedback.css`. Primitives add classes and state attributes and no motion logic of their own.
5. **Reduced motion.** Read once from the existing media query hook (`use-media-query.ts`). Each primitive settles immediately when it is set, so no component checks it again.

Placement: the primitives live in a `shared/motion/` folder beside the other shared UI, in the web interface. `shared` stays domain-blind (ARC-13), so no primitive knows what a fund, a value or a privacy setting is. Chart morphs stay in `presentation/charts/motion/` and call the shared tween.

## Rules for every motion

- Durations, easings and colours come from tokens, and only transform and opacity animate (UXC-12). A primitive takes a token name, never a number.
- Reduced motion removes all transition and movement, and visible state still changes (UXC-13).
- Privacy hiding, validation and every financial value update immediately (UXC-5). A chart morph animates presentation only. Its end state must equal the exact projection that the unanimated chart would draw.
- Pure timing and geometry live in `.ts` files with their own tests. React hooks stay thin.
- Each primitive writes one state attribute, `data-motion`, with the values `settled` or `moving`. Browser audits wait for `settled` rather than a fixed delay. Nothing in CSS may style that attribute, so it is a test signal, not a design hook.

## Migration order

Each step is behaviour-neutral, so the built output and the audits must not change. A step that changes timing is a separate commit and is recorded as a design change.

1. **Tween and reduced motion.** Pure functions and tests, with no UI change.
2. **Presence.** Move `presence.tsx` onto the tween. Check the rendered audits for every screen that opens or closes a panel.
3. **Reorder.** Move `row-glide.ts` onto the reorder primitive. Check the holdings journey.
4. **Chart morphs.** Move `presentation/charts/motion/` onto the tween. Check the chart geometry tests and the reduced-motion audit.
5. **Remove duplicated timing.** Delete the constants that the migrated code no longer uses, and regenerate the interaction inventory (UXC-4).

## Proof

- Every primitive has pure tests that cover start, interruption, completion and reduced motion. These run in the normal test suite.
- The reduced-motion audit must still pass unchanged (UXC-13). The rendered interaction audit must still show each migrated control's feedback.
- Any control that a step adds or changes is regenerated in the interaction inventory and reviewed. A matching CSS selector is not coverage on its own.
- A green build is not proof of motion. The rendered audits and the pure tests are the evidence, and a step that cannot show them stays open.

## Out of scope

- No animation library or new dependency.
- No motion gallery or preview route, which would be a speculative layer.
- No change to token values or to the visual design.
- No spring physics beyond the existing `--ease-spring` token.

## Open questions for the owner

1. Is a `data-motion` attribute acceptable in the production DOM, given that it is only a test signal?
2. Should step 2 (presence) go first, since it touches the most visible screens, or step 1 alone to prove the tween with no UI change?
