# Dashboard coherence

> **Partly superseded on 2026-11-08 by [Structural UI and UX redesign](structural-ui-redesign.md).** That brief replaces this document's page identity and screen composition (the shared header plus a second per-screen intro block, per-metric stat cards, the bordered analysis disclosure and the separate glossary and definitions disclosures). The product narrative, the financial and chart rules in the later amendments (metric visibility, chart date labels, glass kept to navigation) and the recorded verification remain valid and unchanged below as the historical record.

Implemented 2026-11-04 under the owner's request to consolidate the whole UI, then repeat the review at progressively smaller scales. This governs presentation; financial policy, import consent and data authority remain unchanged.

## Pass 1: the product story

The portfolio answers four questions, in this order:

1. **Where am I?** The statement date, fund value, total gain and net invested establish the latest position. A single prominent link starts a statement import.
2. **What changed?** Three period cards show month on month, year to date and year on year. Current gain is already in the summary, so it is not repeated as a fourth card. Existing baseline definitions and unavailable-value explanations remain intact.
3. **What makes up the portfolio?** Holdings and allocation sit together on wide screens and follow one another on phones. Fund links lead to the existing detailed history.
4. **What deserves a closer look?** Monthly movement, fund rankings, multi-fund charts and provenance live in an expandable analysis section. Definitions remain available in their own disclosure.

Demo data is labelled in the status and statement context. Setup guidance follows the sample dashboard, allowing the dashboard itself to demonstrate the product first. An empty connected account has an import-led empty state; it must never silently fall back to demo balances.

## Pass 2: screen composition

- The sticky header owns page identity, data status and privacy. Chart period is a separate contextual row, with explicit copy that it affects charts rather than latest-statement figures.
- The value card gives value, total gain and capital separate visual groups. Its redundant miniature value chart is removed because the adjacent primary chart already owns that story.
- Holdings omit redundant row sparklines and share columns. The fund detail and adjacent allocation remain the relevant destinations for those views. The table retains value, invested capital, gain and gain percentage; wide tables stay locally scrollable.
- Import has one navigation destination and an explicit choose/review/save sequence. Both single and multiple Excel files use the established workflows. Existing history links and optional JSON import remain supported; JSON is secondary on either import route. No staged write or recovery behavior changes.
- Month by month introduces statement exploration before comparison tables. Your data introduces connection, verification and device ownership, with verification and sheet maintenance paired at larger widths. Restore controls and data-loss disclosures remain visible under their existing conditions.
- Charts keep their readout, plot, keyboard date slider and legend visible. Reset, detailed guidance and the data table share the Chart tools and values disclosure. Opening a disclosure does not change the calculation or chart domain.

## Pass 3: detail and consistency

One semantic token source continues to own colour, spacing, shape and motion. Cards and charts now share responsive padding and a quiet surface shadow. The existing icon artwork is reused for navigation identity. Glass remains restricted to navigation and header surfaces; numerical cards remain solid.

Section headings, explanatory text, import steps and account introductions share a restrained type/spacing hierarchy. Semantic status colours retain their meanings. The primary figure is never recoloured to imply performance, and percentages retain their original definitions and cash-timing caveats. Long amounts wrap inside their cards rather than clip. Mobile cards keep complete metric labels and values, rather than squeezing desktop columns onto a phone.

Existing keyboard focus, privacy controls, chart inspection, accessible tables and reduced-motion behavior remain applicable. Disclosure controls are native details/summary elements. No font service, stock imagery, icon library or production dependency is introduced.

## Evidence and limits

`npm run verify` passes, including 637 tests, type checking, lint, repository rules, production build, PWA integrity and the Apps Script bundle check.

The local production renderer was checked in headless Chrome with invented demo data:

- Five routes at 320, 360, 390, 430, 760, 844 and 1440 CSS pixels: no document overflow, mobile control targets, chart sizing, fund navigation, month selection, keyboard date slider and a short input viewport.
- Five demo portfolio variants at 320, 390, 760 and 1440 pixels: visible amounts, no clipped headline values, full-width phone metrics, stable headline values when chart period changes, disclosures and 200% root text size.
- Three period cards, collapsed secondary analysis, chart controls outside the sticky header and rendered chart measurement after expanding analysis.
- A synthetic empty device copy: the connected empty state renders with no demo label or charts.
- Light/dark production screenshots inspected between passes; the review removed the setup-first stack, repeated summary figures and clipped duplicate holdings columns.

The session's browser probes are `/tmp/foliodash-consolidation-check.mjs` and `/tmp/foliodash-consolidation-details.mjs`; they are local evidence, not a committed CI browser suite. The screenshots contain only invented data. Physical Android/iOS, screen readers, Firefox/WebKit, installed WebAPK and live Google behavior after these presentation changes are not claimed by this visual pass. Prior Google acceptance evidence retains its original tested scope.

## Bento redesign, 2026-11-05

The initial redesign replaced the floating glass shell and ambient gradients and removed the separate Progress/Composition headings described above. The owner subsequently requested restoration of the Apple-style material; the amendment below owns the current shell treatment. The owner requested a substantive redesign using the supplied bento and interface-design references.

The portfolio uses one compact statement-date/action row. The chart range lives here and explicitly affects charts, while period results retain latest-statement semantics. At wide widths, a navy value summary and a grouped period-results surface form the left column; the main trend panel spans both beside them. Tablet widths pair summary and period results before the full-width chart. Phones follow the source order: summary, chart, period results, holdings and allocation. Layout tracks size from content rather than fixed heights. Sparklines remain secondary context beside the period explanations. Unavailable values retain their reasons.

Holdings and allocation follow directly, with analysis and definitions still disclosed. Chart inspection's reset and detailed keyboard instructions now live in Chart tools and values; the date slider and selectable legend remain visible. No financial formulas, financial policy, persistence or save/recovery protocols change.

The initial shared shell used an anchored sidebar, a simple page header, solid surfaces and restrained token-owned corners; its material is amended below. This updates expenses, import and account surfaces as well as the portfolio. Motion still uses the shared focus, press, selection and reduced-motion rules. The signed gain/loss text retains meaning independently of colour; losses on the navy summary use its high-contrast foreground.

References applied: [responsive CSS Grid composition](https://github.com/microsoft/Resource2Skill/blob/main/skills_wiki/web/responsive_bento_dashboard_grid_05a335e3/text/overview.md), [bento-ui](https://skills.rest/skill/bento-ui), [frontend-design source skill](https://github.com/omanjaya/attendancedev/blob/main/.claude/skills/frontend-design/SKILL.md), and the owner's [Impeccable reference](https://skills.rest/repo/pbakaus/impeccable). Guidance was adapted to the existing Preact implementation and stronger repository accessibility/privacy requirements; no external skill scripts or runtime libraries were installed.

### Verification record

- Revision/build: commit containing this entry; production artifact from `npm run verify`, 2026-11-05.
- Capability: responsive dashboard composition and shared shell, with existing financial/chart interactions preserved.
- Environment: local production preview, headless desktop Google Chrome, fresh temporary profile, service-worker bypass; invented demo portfolios only. Viewports 320, 390, 760, 1024 and 1440 CSS pixels; typical, single, many, different and empty portfolios.
- Method: `npm run verify`; `npm run capture:readme`; browser checks navigating Portfolio, Expenses, Month by month, Import, history and Your data, inspecting page overflow, landmarks and 48px control heights. Repeat portfolio cases with 200% root text. Exercise slider selection, legend highlighting, Escape/reset, range keyboard selection, fund search/clear, analysis disclosure, privacy, sidebar resize and focus clearance. Compare chart paths and ticks before/after inspection. Emulate reduced motion and forced colours.
- Result: PASS. All 757 tests in 58 files, source/build/PWA/Apps Script gates, and 124 local browser assertions passed. Captured and visually reviewed the actual portfolio renderer in light/dark desktop and dark mobile, plus the shared expense shell. No unhandled browser exceptions in the browser assertion run.
- Evidence: generated synthetic screenshots in `dist/readme/` (ignored build output); local verification logs `/tmp/foliodash-bento-redesign-verify.log` and `/tmp/foliodash-redesign-browser-results.txt`. These temporary files are local evidence, not durable CI artifacts.
- Remaining gates: Firefox/WebKit, physical Android, screen-reader review and live Google acceptance NOT RUN for this change. No live-product or hosted-revision verification is claimed.


## Apple-style material restored, 2026-11-06

The owner clarified that translucency and liquid glass are part of FolioDash's intended identity and should have survived the bento redesign. Restore that material while retaining the revised data hierarchy, compact action row and chart tooling.

The sidebar, page toolbar and mobile navigation use the existing shared glass tokens: translucent fill, backdrop blur/saturation, an inset highlight and soft elevation. The desktop sidebar regains a small outer inset and rounded silhouette; the toolbar has rounded edges and comfortable inner padding. A static, restrained tonal backdrop makes the material visible without animation. Financial cards, forms and chart surfaces stay solid. No chart data, authentication, persistence or financial behavior changes.

Reduced transparency uses opaque surface tokens, disables blur and removes the backdrop accents. Browsers without backdrop-filter support also receive opaque surfaces and no blur. Forced colours use system Canvas colours and no blur/shadow. Reduced motion retains the established interaction fallback. No external fonts, runtime requests or dependencies are added.


### Material verification record

- Revision/build: commit containing this amendment, local production build checked 2026-11-06.
- Capability: translucent navigation/header material with solid financial surfaces and accessible preference fallbacks.
- Environment/dataset: headless desktop Google Chrome, fresh temporary profiles, signed-out synthetic demos, 320/390/760/1024/1440px viewports and 200% text.
- Method: `npm run verify`, `npm run capture:readme`, the existing local interaction/layout browser procedure plus computed-material checks under light/dark and reduced-transparency preferences. Inspect actual production screenshots on desktop and mobile.
- Result: PASS. 762 tests across 58 files; all 124 existing browser assertions passed. Nine additional material assertions passed, including translucent fill/blur, opaque reduced-transparency fallbacks in both themes and mobile navigation blur. An initial material assertion compared equivalent `#fff`/`#ffffff` token spellings; normalizing the expected colour corrected that check without changing the implementation.
- Evidence: ignored synthetic renders in `dist/readme/`; local `/tmp/foliodash-glass-verify.log`, `/tmp/foliodash-glass-browser.mjs` and `/tmp/foliodash-glass-material.mjs`. Local temporary paths are not durable CI artifacts.
- Limits: physical Apple/Android devices, WebKit/Firefox, unsupported-filter fallback rendering and screen-reader testing NOT RUN for this change. The unsupported-filter fallback was reviewed in source. No hosted or live-Google verification is claimed.

## Keep financial metrics visible, 2026-11-06

The owner reported Gain % leaving the Holdings card while long fund names consumed much of its width. The table's automatic sizing and non-wrapping identity cells let it exceed the card; the local scroll area hid the last column until scrolled. The old compact representation also omitted net invested and combined gain with its percentage.

Holdings now prioritises Fund, Value, Gain %, Gain and Net invested. A fixed-layout table reserves 24% for the wrapping fund identity and shares the remaining width between the four metrics. Figures retain their normal font size and precision; exceptionally large values wrap instead of clipping. Below 42rem of the card's actual content width, a named CSS container query replaces the table with a full-name row and four explicitly labelled metrics. Below 20rem, those metrics use one column. No holding metric is removed. Identity, closed status, search, privacy, fund links and canonical financial values remain available in both representations. This is a CSS reflow, with no resize handler or data recalculation.

The browser review also found an intrinsic-width overflow in the period-results group at 1024px with 200% text. That group now has an explicitly shrinkable grid track and stacks its amount, percentage and sparkline within narrow containers instead of allowing the percentage track to escape. The same review makes allocation/ranking names wrap before competing with shares/returns and allows financial fact groups to wrap in narrow desktop cards as well as on phones. Dense historical comparison tables retain their labelled local scroll regions because their two-dimensional relationships remain useful. The restored Apple-style material is unchanged.

This follows the [container-query model](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_size_and_style_queries) and [WAI responsive-table guidance](https://www.w3.org/WAI/tutorials/tables/tips/): adapt presentation to available space while preserving the relationships between labels and values. The 42rem threshold and 24% identity allocation are project design choices, not universal standards.

### Metric visibility verification record

- Revision/build: commit containing this amendment, local production build, 2026-11-06.
- Capability: complete holdings metrics, bounded/wrapping names, narrow-container period and fact reflow.
- Environment/dataset: fresh headless desktop Chrome profile, service-worker bypass, built-in synthetic portfolios only. Metric checks cover 320/390/760/1024/1180/1440/1920px at 100% and 200% root text; a 1280px desktop additionally demonstrates the compact card inside the bento grid.
- Method: `npm run verify`; production browser assertions for exactly one holdings representation, all four metric labels/cells, metric bounds within the card, no holdings horizontal scrolling and an identity column below 30% in wide mode. Stress only the rendered presentation with a deliberately long invented name and very large formatted signed amounts; reload the actual demo before final screenshots. Repeat the established six-screen layout, privacy, keyboard, chart/search, focus, forced-colour and reduced-motion checks.
- Result: PASS. All 762 tests in 58 files and all 168 browser assertions passed. The first broad matrix found the enlarged-text period overflow described above; its corrective container/grid changes passed the same regression check. Visually reviewed the actual wide and compact holdings renderings. No financial formulas or source data were changed.
- Evidence: local `/tmp/foliodash-metrics-verify.log`, `/tmp/foliodash-metrics-browser.mjs`, `/tmp/foliodash-metrics-browser-results.json`, `/tmp/foliodash-holdings-wide.png` and `/tmp/foliodash-holdings-compact.png`. These temporary files are local evidence, not durable CI artifacts.
- Remaining gates: physical Android/Apple touch, screen-reader and Firefox/WebKit checks NOT RUN for this change. No hosted revision or live Google claim follows from the local synthetic checks.

## Chart date-label collisions, 2026-11-06

The owner reported overlapping October/November labels in Monthly change in gain. The confirmed cause was the fixed every-N-month label cadence plus an unconditional final label. A regular penultimate label could collide with the appended final month, and centred endpoint text could extend past the SVG boundary.

Monthly bars and line-chart time axes now share one presentation-only label-positioning policy. It measures real SVG glyph widths, reserves the latest date, clamps text inside the plot's horizontal bounds and includes earlier labels only when their measured intervals have sufficient clearance. Crowded labels are omitted from the visual axis; observations and their dates remain available through the existing readout, slider, keyboard inspection and complete values table. All bars, values, time coordinates, financial calculations and line paths are preserved. Labels cannot intercept pointer inspection.

Measurements update when label candidates change, a closed disclosure opens, the SVG resizes or fonts finish loading. Hidden/unmeasurable text uses a conservative initial estimate. Resize/font listeners and scheduled frames have explicit cleanup. Date labels do not animate. The pure policy tests cover the final-month collision, clipped endpoints, unequal glyph widths, empty/single cases and histories up to 60 months.

### Chart-label verification record

- Revision/build: commit containing this amendment, local production build, 2026-11-06.
- Environment/dataset: fresh headless Chrome profiles with service workers bypassed; validated synthetic ledgers containing 1, 2, 8, 11, 12, 13, 24 and 60 monthly observations ending November 2026. No live account or financial records used.
- Method: `npm run verify`; actual SVG text rectangle comparisons for overlapping visible labels and horizontal chart-edge clipping in all expanded bar/line charts, at 320/760/1280/1440px and 100%/200% root text. Check that every bar observation is retained and the latest November label remains visible. Repeat the six-screen metric/layout and interaction browser matrix from the preceding amendment.
- Result: PASS. 767 tests across 59 files; 129 chart-specific browser assertions and 168 broader UI assertions. Visible chart text had no detected collisions or horizontal clipping in the matrix; no page overflow or unhandled browser exceptions. Actual production rendering was visually inspected with the 60-month synthetic ledger. Existing geometry/inspection checks confirm that hovering and pinning do not change plotted bar/line geometry or axis scale.
- Evidence: `/tmp/foliodash-labels-verify.log`, `/tmp/foliodash-axis-browser.mjs`, `/tmp/foliodash-axis-browser-results.json`, `/tmp/foliodash-labels-ui-results.json` and `/tmp/foliodash-axis-labels.png`. These local temporary files are not durable CI artifacts.
- Limits: physical-device touch, screen-reader, Firefox/WebKit and arbitrary real-world content outside the tested matrix remain unverified. This is a bounded regression review, not a claim that every possible UI/content combination is defect-free. No live Google or hosted-release verification was performed.
