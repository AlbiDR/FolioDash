# Verdin motion audit

Status: **Source and rendered DOM inspection, 2026-11-22; local adaptation implemented, verification below.** The [Verdin Insights demo](https://demo.codeandchill.store/verdin/insights/) and its delivered shared chart and interface assets were inspected in a fresh, signed-out headless Chrome profile. This is a source-level survey: the page rendered, but interactive frame-by-frame and physical-device inspection were not available. Some shared components below are present in the delivered bundle rather than proven to appear on Insights. No code, fonts or assets were copied. Verdin identifies itself as a licensed commercial template.

## Ten animation candidates

| Candidate | Evidence and FolioDash decision |
| --- | --- |
| 1. Panel stagger | Insights invokes a stagger on cards. Existing page arrivals adapt the reading order with FolioDash tokens. |
| 2. Category-row stagger | Insights invokes a delayed stagger for budget rows. Avoid delaying financial content; existing rows are immediately readable. |
| 3. Merchant-row stagger | The same Insights call includes merchant rows. Existing keyed row glide is used only when rows actually reorder. |
| 4. Headline count | Insights supplies a duration to its animated amount. FolioDash already has a separately authorized visual count-up, with exact text retained for accessibility and immediate privacy masking. |
| 5. Incoming chart bars | The shared chart bundle scales incoming bars from zero. FolioDash already has a separately authorized entry presentation; canonical values and the final geometry remain exact. |
| 6. Outgoing chart bars | The shared chart bundle separately staggers outgoing bars. No corresponding incoming/outgoing split is added. |
| 7. Net markers | The shared chart bundle scales and fades net markers after bars. No corresponding net marker is added. |
| 8. Selected bar rebound | The shared chart bundle briefly scales selected bars. FolioDash uses paint and outline feedback instead. |
| 9. Line interpolation | The shared chart bundle interpolates line points on data changes. FolioDash keeps canonical settled geometry and its existing presentation-only chart motion. |
| 10. Ring progress | The shared chart bundle animates a ring's dash offset. Allocation angles and proportions remain exact; no ring drawing is added. |

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
| 4. Choose a reporting month | Insights passes the selected month to its segmented control. FolioDash retains its own period selectors and canonical calculations. |
| 5. Adjust a budget | Insights supplies increment and decrement handlers. FolioDash does not invent a budget feature; existing date steppers keep their own purpose and state feedback. |

The ranking bar now brightens on keyboard focus as well as fine-pointer hover, an adaptation of the reference's parallel pointer and focus inspection. It changes only presentation, not bar length. The existing [Astryx reference](astryx-reference.md) and [Portfolio refinement](portfolio-refinement.md) continue to govern composition and prior chart adaptations. Interaction inventory and rendered audits are separate from the source survey; touch, screen reader, other browser engines and physical-device proof remain open (STD-11).

## Local verification

On 2026-11-22, `npm run verify` passed, including 1,332 unit tests and the production build. After that build, `npm run audit:rendered` passed: 160 interaction journey assertions and 1,130 control samples in 27 states, recovery journeys, 24 reload cases, 32 automated accessibility cases, 48 reduced-motion checks across 16 screens, and the Portfolio arrival and layout audit. These are synthetic local Chrome results, not live Google, physical-device, other-engine or screen-reader proof (STD-11). The source inventory was regenerated and remains a discovery record, not proof of every control state.
