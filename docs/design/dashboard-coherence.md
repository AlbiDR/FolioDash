# Dashboard coherence

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

This supersedes the floating glass shell, ambient gradients and separate Progress/Composition headings described above. The owner requested a substantive redesign using the supplied bento and interface-design references.

The portfolio uses one compact statement-date/action row. The chart range lives here and explicitly affects charts, while period results retain latest-statement semantics. At wide widths, a navy value summary and a grouped period-results surface form the left column; the main trend panel spans both beside them. Tablet widths pair summary and period results before the full-width chart. Phones follow the source order: summary, chart, period results, holdings and allocation. Layout tracks size from content rather than fixed heights. Sparklines remain secondary context beside the period explanations. Unavailable values retain their reasons.

Holdings and allocation follow directly, with analysis and definitions still disclosed. Chart inspection's reset and detailed keyboard instructions now live in Chart tools and values; the date slider and selectable legend remain visible. No financial formulas, financial policy, persistence or save/recovery protocols change.

The shared shell uses an anchored sidebar, a simple page header, solid surfaces and restrained token-owned corners. This updates expenses, import and account surfaces as well as the portfolio. Motion still uses the shared focus, press, selection and reduced-motion rules. The signed gain/loss text retains meaning independently of colour; losses on the navy summary use its high-contrast foreground.

References applied: [responsive CSS Grid composition](https://github.com/microsoft/Resource2Skill/blob/main/skills_wiki/web/responsive_bento_dashboard_grid_05a335e3/text/overview.md), [bento-ui](https://skills.rest/skill/bento-ui), [frontend-design source skill](https://github.com/omanjaya/attendancedev/blob/main/.claude/skills/frontend-design/SKILL.md), and the owner's [Impeccable reference](https://skills.rest/repo/pbakaus/impeccable). Guidance was adapted to the existing Preact implementation and stronger repository accessibility/privacy requirements; no external skill scripts or runtime libraries were installed.

### Verification record

- Revision/build: commit containing this entry; production artifact from `npm run verify`, 2026-11-05.
- Capability: responsive dashboard composition and shared shell, with existing financial/chart interactions preserved.
- Environment: local production preview, headless desktop Google Chrome, fresh temporary profile, service-worker bypass; invented demo portfolios only. Viewports 320, 390, 760, 1024 and 1440 CSS pixels; typical, single, many, different and empty portfolios.
- Method: `npm run verify`; `npm run capture:readme`; browser checks navigating Portfolio, Expenses, Month by month, Import, history and Your data, inspecting page overflow, landmarks and 48px control heights. Repeat portfolio cases with 200% root text. Exercise slider selection, legend highlighting, Escape/reset, range keyboard selection, fund search/clear, analysis disclosure, privacy, sidebar resize and focus clearance. Compare chart paths and ticks before/after inspection. Emulate reduced motion and forced colours.
- Result: PASS. All 757 tests in 58 files, source/build/PWA/Apps Script gates, and 124 local browser assertions passed. Captured and visually reviewed the actual portfolio renderer in light/dark desktop and dark mobile, plus the shared expense shell. No unhandled browser exceptions in the browser assertion run.
- Evidence: generated synthetic screenshots in `dist/readme/` (ignored build output); local verification logs `/tmp/foliodash-bento-redesign-verify.log` and `/tmp/foliodash-redesign-browser-results.txt`. These temporary files are local evidence, not durable CI artifacts.
- Remaining gates: Firefox/WebKit, physical Android, screen-reader review and live Google acceptance NOT RUN for this change. No live-product or hosted-revision verification is claimed.
