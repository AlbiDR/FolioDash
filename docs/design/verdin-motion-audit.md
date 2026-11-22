# Verdin motion audit

Status: **Source and rendered DOM inspection, 2026-11-22; adaptation expansion in progress.** The [Verdin Insights demo](https://demo.codeandchill.store/verdin/insights/) and its delivered shared chart and interface assets were inspected in a fresh, signed-out headless Chrome profile. This is a source-level survey: the page rendered, but interactive frame-by-frame and physical-device inspection were not available. Some shared components below are present in the delivered bundle rather than proven to appear on Insights. No code, fonts or assets were copied. Verdin identifies itself as a licensed commercial template.

## Ten animation candidates

| Candidate | Evidence and FolioDash decision |
| --- | --- |
| 1. Panel stagger | Insights invokes a stagger on cards. Existing page arrivals adapt the reading order with FolioDash tokens. |
| 2. Category-row stagger | Insights invokes a delayed stagger for budget rows. Avoid delaying financial content; existing rows are immediately readable. |
| 3. Merchant-row stagger | The same Insights call includes merchant rows. Existing keyed row glide is used only when rows actually reorder. |
| 4. Headline count | Insights supplies a duration to its animated amount. FolioDash already has a separately authorized visual count-up, with exact text retained for accessibility and immediate privacy masking. |
| 5. Incoming chart bars | Adapted as the named `motion-bar-rise` recipe, staggered in semantic month order on FolioDash monthly bars. Canonical values and final geometry remain exact. |
| 6. Outgoing chart bars | The shared chart bundle separately staggers outgoing bars. No corresponding incoming/outgoing split is added. |
| 7. Net markers | Adapted as `motion-marker-arrive` for FolioDash checkpoint markers, which appear after their chart context without fabricating a net series. |
| 8. Selected bar rebound | Adapted as a bounded `chart-selection-rebound` when an existing FolioDash monthly bar is pinned; the stored value and bar length do not move. |
| 9. Line interpolation | The shared chart bundle interpolates line points on data changes. FolioDash keeps canonical settled geometry and its existing presentation-only chart motion. |
| 10. Ring progress | Adapted as `motion-ring-slice`: allocation slices reveal in semantic legend order. The exact allocation angles and proportions are never interpolated. |

## Fifteen small feedback candidates

The delivered CSS defines these individual states; a state definition alone does not establish a running animation or prove interaction coverage. FolioDash uses its own shared transitions and tokens (UXC-12, UXC-13).

| Candidate | FolioDash mapping |
| --- | --- |
| 1. Sidebar item hover surface | Shared navigation hover. |
| 2. Current sidebar icon emphasis | Current navigation icon. |
| 3. Sidebar collapse affordance hover | Sidebar toggle feedback. |
| 4. Search surface hover | Shared control feedback. |
| 5. Icon button hover surface | Shared button feedback. |
| 6. Primary button hover colour | Shared button feedback. |
| 7. Secondary button hover colour | Shared button feedback. |
| 8. Ghost button hover surface | Shared button feedback. |
| 9. Text-link hover underline | Link feedback. |
| 10. Filter chip hover colour | Segmented-control feedback. |
| 11. Pressed filter chip surface | Selected segmented control. |
| 12. Tab hover text colour | Navigation feedback. |
| 13. Sort-header hover colour | Holdings sort controls. |
| 14. Clickable table-row hover surface | Interactive rows; static rows remain distinguishable. |
| 15. Stepper button hover surface | Date controls and shared button feedback. |

## Five interaction candidates

| Candidate | Evidence and adaptation |
| --- | --- |
| 1. Inspect a chart point | Shared line chart maps pointer position to the nearest observation and clears on leave. Portfolio's existing guide, dot and tooltip use its own selection and privacy formatting. |
| 2. Inspect a chart column | Shared flow chart responds to pointer enter, focus and blur. FolioDash's bar controls have pointer and keyboard feedback. |
| 3. Pin a chart column | Shared flow chart uses a button and pressed state on selection. FolioDash retains its own bar selection and reset. |
| 4. Choose a reporting month | Adapted as `motion-range-select`, a shared RangeSelector confirmation. The selected state and canonical calculation update immediately. |
| 5. Adjust a budget | Insights supplies increment and decrement handlers. FolioDash does not invent a budget feature; existing date steppers keep their own purpose and state feedback. |

## Consolidated implementation ledger

| Recipe | Owner | Applied UI | Current proof |
| --- | --- | --- | --- |
| `motion-bar-rise` | `presentation/charts/chart-arrival.css` via `motion/recipe.ts` | Portfolio monthly bars | Build and focused chart tests pass; rendered audit blocked before chart journey |
| `motion-ranking-rise` | `presentation/charts/chart-arrival.css` via `motion/recipe.ts` | Portfolio Gain by fund ranking | Build and focused chart tests pass; rendered audit blocked before chart journey |
| `motion-ring-slice` | `presentation/charts/chart-arrival.css` via `motion/recipe.ts` | Portfolio Allocation ring | Build and focused chart tests pass; rendered audit blocked before chart journey |
| `motion-marker-arrive` | `presentation/charts/chart-arrival.css` via `motion/recipe.ts` | Performance-chart checkpoint markers | Build and focused chart tests pass; rendered audit blocked before chart journey |
| `chart-selection-rebound` | `presentation/charts/bars.css` | Pinned monthly bar | Build and focused chart tests pass; rendered audit blocked before chart journey |
| `motion-selection-rebound` | `presentation/charts/chart-arrival.css` | Active allocation slice | Build and focused chart tests pass; rendered audit blocked before chart journey |
| `motion-range-select` | `shared/ui/interactions/controls.css` | Portfolio and Fund period controls | Build and style gate pass; rendered audit blocked before journey |

All seven recipes use existing motion tokens and the global reduced-motion override. They animate presentation only: financial values, private-data hiding, selected state, keyboard focus and final geometric measurements update immediately. The ranking bar now brightens on keyboard focus as well as fine-pointer hover, an adaptation of the reference's parallel pointer and focus inspection. It changes only presentation, not bar length. The existing [Astryx reference](astryx-reference.md) and [Portfolio refinement](portfolio-refinement.md) continue to govern composition and prior chart adaptations. Interaction inventory and rendered audits are separate from the source survey; touch, screen reader, other browser engines and physical-device proof remain open (STD-11).

## Local verification

Before this expansion, on 2026-11-22, `npm run verify` passed, including 1,332 unit tests and the production build. After that build, `npm run audit:rendered` passed: 160 interaction journey assertions and 1,130 control samples in 27 states, recovery journeys, 24 reload cases, 32 automated accessibility cases, 48 reduced-motion checks across 16 screens, and the Portfolio arrival and layout audit. For the current expansion, focused chart tests, formatting, `verify:style` and the production build pass. The current `audit:rendered` run stops at an existing signed-out Checkpoints assertion before reaching the expanded chart journey; this record therefore does not claim rendered proof yet. These are synthetic local Chrome results, not live Google, physical-device, other-engine or screen-reader proof (STD-11). The source inventory remains a discovery record, not proof of every control state.
