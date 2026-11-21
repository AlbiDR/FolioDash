# Depth and hierarchy

Status: **Draft 2026-11-19. Owner decided D2 on 2026-11-19: keep the card lift. The other decisions are still proposed, not implemented.** Owner request after comparing FolioDash with a public studio dashboard: find what makes its screens read as polished, and decide which of those ideas fit FolioDash's contracts. This record changes no token value and no layout. Each decision that changes what a person sees needs the owner's approval before code.

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
- The container rule in [UI system](ui-system.md) said cards have no hover feedback. The 2026-11-19 card lift contradicted it, and the owner decided to keep the lift. The UI system's container paragraph and rule 3 now say so, so the code and the design record agree.

## Decisions proposed

**D1. Three depth levels, each a token.**
- `flat`: rows and sub-sections. A hairline only, no shadow. This is the current behaviour of nested content.
- `card`: the default container. Keep the surface and the radius (16px). Strengthen the edge so it can be seen without relying on the shadow (see question 2).
- `hero`: the one primary figure per screen. Keep the navy. Optionally add a soft shadow token for it, judged visually before adoption.

**D2. Cards keep the fine-pointer lift (decided 2026-11-19).** A card lifts two pixels and brightens its edge on a fine pointer, and nothing inside it moves. That is container feedback, and the UI system now states it. Press and focus feedback still belong to the links and buttons inside the card. If a whole card ever becomes a link, it gets its own record and its own audit assertion.

**D3. One dark primary card per screen.** This matches the demo and the current Portfolio. The hero stays the only inverted card. Other cards do not take the navy.

**D4. Numerals keep their roles.** Primary figures use `--text-figure` or `--text-display`, and units use `--text-caption`. Figures already use tabular numerals across 15 stylesheets, so no change is proposed there. Any new figure must use the same roles.

**D5. Dark mode mirrors the levels.** Each level has a dark value in `shared/tokens.css`, in the existing `prefers-color-scheme` block. Shadows are stronger in dark, because a soft shadow on a dark surface is barely visible.

**D6. No ambient motion for depth.** The demo's endless pulse is not adopted. Depth is static. The interaction contract forbids repeating decoration, and reduced motion must still stop everything that moves.

**D7. Value highlights are a motion question.** A brief highlight on a figure that changed after a save or a statement update could help people notice the change. It belongs to the motion layer, not to this record, and it must leave the figure's exact value visible at once (UXC-5).

Out of scope: layout changes, new components, the timeline or scheduling ideas from the demo, and any change to financial or privacy behaviour.

## Proof

- **Contrast.** Each token pair in the table above is measured again after any change, in light and dark. The method is the WCAG relative-luminance ratio from the resolved token values.
- **Visual review.** Before and after screenshots of Portfolio, light and dark, on desktop and phone. Markup changes also re-run the README capture (UI system rule 6), because the main verification does not cover it.
- **Audits.** The range journey asserts that a hovered card lifts (`0px -2px`) where a fine pointer exists, and that it stays unlifted where none does. Both stay as they are, because D2 keeps the lift. Reduced motion is unaffected, because this record adds no motion.

## Prototype, 2026-11-21 (branch `worktree-depth-surfaces-prototype`, not merged)

Surface contrast informed the depth system: a near-black page and a tinted card differ by 1.40:1, and the raised panel sits another 1.31:1 above the card, so four tones read as depth without borders. The implementation uses original code, assets, fonts and palette.

What the prototype changes, tokens and one component only:

- **Dark surfaces (D1, D5).** Card `#1c2437` (page `#07080d`) is about 1.3:1 against the page, up from 1.11:1. The inset tier (`--surface-low`), the raised tier (`--color-surface-2`) and the highest tier (`--surface-high`) are retuned around it with one blue tint. The Portfolio hero takes a lighter navy, `#234684`, so it is the raised block (D3).
- **Sample banner.** The saturated blue first-run notice is now an inset strip with only a hairline, so the headline figure is the first thing a person sees.
- **Light.** The page is `#e9edf4` and `--shadow-card` has a hairline layer, so a white card separates by edge and shadow without a heavier border.

- **Charts.** A line's area fades toward the baseline, the grid is a faint solid hairline, lines are 2.5px and monthly bars rest at 80% opacity. Presentation only: geometry, privacy masking and figures are untouched.
- **Arrival motion (a design change to the motion layer).** Dashboard cards used to arrive with a 2px, 220ms nudge that no one could see. They now rise 16px from transparent over 380ms, 45ms apart and capped at the sixth card (about 0.6 seconds in all). The new values are tokens (`--motion-rise`, `--motion-rise-opacity`, `--motion-stagger`). This replaces the earlier "no stagger" note in `refinement.css`; reduced motion still removes all of it, through the existing global rule. Not built: bar growth on first paint, because the bar morph owns the bars' transforms.

Measured, not judged: dark page against card was computed from the token values. Light page against card was not recomputed, and no hero text contrast is re-measured. The range journey, the README capture and a physical device are not run. The rest of D1 to D7 and both questions below stay open.

## Questions for the owner

1. **Edge contrast.** The edge is currently 1.24 to 1.32:1. WCAG 1.4.11 asks for 3:1 only where a boundary is needed to identify an interactive component, and cards are not controls. Should the card edge be raised to a measured middle, such as at least 1.5:1, and reviewed for accessibility? The draft recommends that, and not 3:1, which would look heavy on every card.
2. **Astryx depth patterns.** Should the Astryx elevation and card patterns be reviewed before D1 is decided? The draft has not done that review.

Decided: D2, keep the fine-pointer card lift (owner, 2026-11-19).
