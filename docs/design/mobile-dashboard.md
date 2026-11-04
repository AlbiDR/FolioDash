# Mobile dashboard layout

Implemented 2026-11-04. This is a presentation change; financial definitions,
account access and import consent retain their existing owners.

Subsequent consolidation on the same date is recorded in [Dashboard coherence](dashboard-coherence.md). It retains these reflow rules while using three period cards (total gain stays in the hero), a separate chart-period row, paired holdings/allocation and disclosed supporting analysis. The earlier four-card verification below is historical evidence for that earlier layout.

## Research translated into product rules

A bento grid is a way to group related information, not a requirement to keep
multiple columns at every width. Card size follows the information it contains.
The mobile sequence remains value, portfolio trend, period metrics, holdings,
allocation and supporting analysis. Desktop retains its twelve-column layout.

| Principle | Application in FolioDash |
|---|---|
| Prioritise the primary task | Keep the portfolio visible sooner by making setup instructions and demo selection expandable. The Google action remains visible. |
| Give each card room to answer one question | All four performance cards span the phone grid. Labels, amounts, percentages and explanations remain visible without compressing them into half-width tiles. |
| Make controls explicit | Show "Chart period" on mobile as well as desktop. The range changes chart history, not latest-statement metrics. |
| Use progressive disclosure | Setup instructions, demo choices and the glossary have native, keyboard-operable details/summary controls. Frequent financial results remain expanded. |
| Keep a consistent rhythm | Shared page inset starts at 1rem and grid gaps at 1rem. Existing spacing tokens and 48px touch targets govern the layout. |
| Preserve readable type | Mobile KPI values use 1.75rem and captions use 0.875rem with 1.5 line height. Card titles use 1.125rem. |
| Recompose for narrow containers | Chart readouts use one column at widths up to 25rem. Latest fund figures use one column on phones. Hero facts use labelled rows that wrap when needed. Ranking cards move bars below labels using a container query, including at enlarged text sizes. |
| Support variable content | Long names wrap; headline typography follows its card width. Amounts in summary and holding cards can wrap rather than clip. Fund identity controls and fact rows can wrap. |
| Keep touch and keyboard paths | Native disclosures retain focus behaviour. Data status links, legend rows and controls have the established touch target. Existing chart sliders and accessible tables remain available. |
| Protect navigation space | Preserve safe-area padding, bottom-navigation clearance, local table scrolling and existing reduced-motion behaviour. |

The larger number of vertical cards is a deliberate tradeoff for reading complete
metrics. Secondary reference material is collapsed to reduce unrelated scrolling.
No fixed card heights, new component library or alternative calculations are added.

## Sources and their scope

- [NN/G: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/):
  defer secondary options, keep common tasks visible, and label the path to details.
- [Google: Adaptive apps](https://developer.android.com/develop/adaptive-apps/guides/get-started-with-adaptive-apps):
  adapt composition to available window space. The pane principle informs this web
  design; Android APIs and dp breakpoints are not copied into the web application.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): reflow, text resizing, focus,
  colour contrast and pointer target requirements. FolioDash's own quality contract
  selects 48px targets, above WCAG's 24px AA minimum and 44px enhanced criterion.
- [W3C: Understanding reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow):
  narrow layouts must preserve information and functionality; necessary wide tables
  may scroll within a region.

The spacing and typography values above are project design choices, not universal
standards or claims that every dashboard should look alike. The canonical product
requirements remain in [Web quality](../operations/web-quality.md).

## Verification

Production renderer, synthetic demo data only. Build with `npm run verify`, serve
with `npm run preview -- --port 4184`, then exercise the following browser matrix.
The locally executed Chrome DevTools Protocol probes are retained in
`/tmp/foliodash-bento-check.mjs` and `/tmp/foliodash-bento-details-check.mjs` for this
session; they are not installed project dependencies or a CI browser suite.

- At 320, 360, 390, 430, 760, 844 and 1440 CSS pixels, open Portfolio, Months,
  Import, History and Your data with the many-funds demo. Check document overflow,
  mobile targets and rendered chart dimensions.
- At 390px, open a holding, browse a statement month, move the chart date slider,
  open manual entry and reduce viewport height to 450px.
- At 320, 390, 760 and 1440px, inspect all five built-in synthetic portfolios with
  amounts shown. Check no page or headline amount overflow, the visible chart
  period label, and full-width mobile KPI cards.
- Expand setup, demo selection and glossary. Change the chart range and verify the
  headline amount stays the same. Resize text to 200% and repeat overflow checks.
- Inspect light and dark screenshots at 390px with reduced motion enabled.

Results on local desktop Chrome, 2026-11-04:

- PASS: `npm run verify`, including 536 tests across 44 test files, type checks,
  lint, production build, PWA and Apps Script bundle checks.
- PASS: 35 route/width combinations, fund navigation, statement selection, chart
  slider interaction, manual entry, short viewport and the first text-resize matrix.
- PASS: 20 portfolio/width combinations, visible amounts, full-width phone metrics,
  chart range stability, disclosures, and 200% text with no document overflow.
- PASS: light and dark 390px production-renderer screenshots inspected locally.

The broader matrix initially caught a clipped desktop hero amount and overflowing
ranking rows at 200% text. Container-relative headline sizing, wrapping amounts
and the ranking container query corrected them before the passing rerun.
Physical Android/iOS, Firefox/WebKit and screen-reader checks are separate evidence
and remain pending. Local synthetic checks do not verify live Google integration
or a hosted deployment.
