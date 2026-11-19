# Depth and hierarchy

Status: **Draft 2026-11-19. Proposed, not implemented.** Owner request after comparing FolioDash with a public studio dashboard: find what makes its screens read as polished, and decide which of those ideas fit FolioDash's contracts. This record changes no token value and no layout. Each decision that changes what a person sees needs the owner's approval before code.

Authority: [UI system](ui-system.md) (type, shape, containers and the rules for the next change), [interaction coverage](interaction-coverage.md), [motion layer](motion-layer.md), the [dashboard coherence](dashboard-coherence.md) record, and the financial and privacy rules in [CleanStack](../architecture/cleanstack.md). Where this draft and those records disagree, the existing record stands until the owner decides.

## Reference considered

- **Studio dashboard demo** (`demo.codeandchill.store/talmo`), observed in the in-app browser on 2026-11-19. It is a commercial template, so nothing was copied: no code, assets, fonts or colours were reused. Its visual features were read, and its motion was measured in the page.
- **Astryx.** The [Astryx reference](astryx-reference.md) already records the dashboard hierarchy adopted on 2026-11-16. This draft did not re-read Astryx's depth or elevation patterns. That review is open (see the questions below).

What the demo does, measured:

- Light grey cards with layered soft shadows and a faint inset edge. One inverted black card carries the key metric. Big numerals sit beside small units. Colour is almost monochrome, with one accent on the main action.
- Its only running animation at rest is an endless `breathe` pulse. It has no CSS transitions, and hovering a card changes nothing, not even its shadow.
- Switching the view changes the URL (`?who=mine`) and shows no animation. Whether that is a full reload was not checked.

## Current state, measured

Contrast was computed from the token values in `shared/tokens.css`.

| Pair | Light | Dark |
|---|---|---|
| Card surface against page background | 1.09:1 | 1.11:1 |
| Card edge line (10% inset) against the card | 1.24:1 | 1.32:1 |
| Hero text against hero (`#ffffff` on `--color-hero`) | 14.1:1 | not measured |

- Depth comes almost entirely from `--shadow-card` (a 2.5% alpha shadow in light, 12% in dark) and the inset hairline. Cards separate from the page by about 1.1:1.
- The hero (`.hero`) is the one dark card on Portfolio. It is flat, with `box-shadow: none`, so its emphasis comes from colour alone.
- No card in the app is a link as a whole, so the card lift added on 2026-11-19 currently applies only to cards with no action.
- The container rule in [UI system](ui-system.md) says cards have no hover feedback, and that a card is not a button. The 2026-11-19 card lift contradicts it. This is the one place where the code and the design record disagree today.

## Decisions proposed

**D1. Three depth levels, each a token.**
- `flat`: rows and sub-sections. A hairline only, no shadow. This is the current behaviour of nested content.
- `card`: the default container. Keep the surface and the radius (16px). Strengthen the edge so it can be seen without relying on the shadow (see question 2).
- `hero`: the one primary figure per screen. Keep the navy. Optionally add a soft shadow token for it, judged visually before adoption.

**D2. Cards do not lift.** A card is a container. Any hover feedback belongs to the link or button inside it, which already has feedback under the interaction contract. The card lift is removed from cards with no action. If a whole card ever becomes a link, it gets its own record and its own audit assertion.

**D3. One dark primary card per screen.** This matches the demo and the current Portfolio. The hero stays the only inverted card. Other cards do not take the navy.

**D4. Numerals keep their roles.** Primary figures use `--text-figure` or `--text-display`, and units use `--text-caption`. Figures already use tabular numerals across 15 stylesheets, so no change is proposed there. Any new figure must use the same roles.

**D5. Dark mode mirrors the levels.** Each level has a dark value in `shared/tokens.css`, in the existing `prefers-color-scheme` block. Shadows are stronger in dark, because a soft shadow on a dark surface is barely visible.

**D6. No ambient motion for depth.** The demo's endless pulse is not adopted. Depth is static. The interaction contract forbids repeating decoration, and reduced motion must still stop everything that moves.

**D7. Value highlights are a motion question.** A brief highlight on a figure that changed after a save or a statement update could help people notice the change. It belongs to the motion layer, not to this record, and it must leave the figure's exact value visible at once (UXC-5).

Out of scope: layout changes, new components, the timeline or scheduling ideas from the demo, and any change to financial or privacy behaviour.

## Proof

- **Contrast.** Each token pair in the table above is measured again after any change, in light and dark. The method is the WCAG relative-luminance ratio from the resolved token values.
- **Visual review.** Before and after screenshots of Portfolio, light and dark, on desktop and phone. Markup changes also re-run the README capture (UI system rule 6), because the main verification does not cover it.
- **Audits.** The range journey currently asserts that a hovered card lifts (`0px -2px`). If D2 is accepted, that assertion changes to the opposite: a hovered card with no action does not lift, while its links keep their feedback. Reduced motion is unaffected, because this record adds no motion.

## Questions for the owner

1. **D2.** Accept removing the card lift from cards with no action? This reverses part of the 2026-11-19 approval. The draft recommends it, because no card is a link as a whole.
2. **Edge contrast.** The edge is currently 1.24 to 1.32:1. WCAG 1.4.11 asks for 3:1 only where a boundary is needed to identify an interactive component, and cards are not controls. Should the card edge be raised to a measured middle, such as at least 1.5:1, and reviewed for accessibility? The draft recommends that, and not 3:1, which would look heavy on every card.
3. **Astryx depth patterns.** Should the Astryx elevation and card patterns be reviewed before D1 is decided? The draft has not done that review.
