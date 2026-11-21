# Portfolio refinement

Status: **Implemented and verified locally in the isolated worktree, 2026-11-21. CI and manual-device categories remain separate.**

The owner requested changes to the actual FolioDash dashboard, retaining the visual style of the running many-fund demo at port 5174 and improving its polish and purposeful animation. The earlier [composition study](portfolio-layout-study.md) remains a historical proposal. This work changes the production Preact interface and its existing motion primitives, not the study generator.

## Selected baseline and references

The preferred preview was served from the committed depth/surfaces prototype at `122f442`. That exact baseline was merged into this branch without altering its worktree: tiered dark surfaces, blue hero, floating glass navigation, lighter chart grids, gradient area fills, stronger bars and shared chart/card typography. The owner explicitly asked to keep that appearance. No part of the separate prototype checkout was changed.

The refinement improves surface grouping, the relationship between a strong headline and supporting figures, an intentional inspection state and coordinated finite motion. It uses original code and styling, with no imported font, artwork, dependency or financial logic. FolioDash keeps every existing chart, comparison, sparkline and financial figure; no placeholder chart or simplified data model enters the application.

The [Astryx Portfolio Dashboard](https://github.com/meta/astryx/blob/dc58f19792b2ad26091d2f1914b8a4c54f6a9445/packages/cli/assets/templates/pages/dashboard-composition/template.doc.mjs), revision `dc58f19792b2ad26091d2f1914b8a4c54f6a9445`, was reconsidered through its previously reviewed template description: balance/change, history and holdings. FolioDash retains the selected summary/Changes column beside the tall Performance chart and all visible analysis below Holdings. This adapts the hierarchy, with its existing data and larger chart, rather than adopting a stacked-composition chart. No upstream code or dependency was imported (UXC-11).

## Presentation and motion

- The real Portfolio summary has a restrained static light treatment, a defined edge and a dedicated shadow. Its existing blue, heading, privacy-aware values and action stay in place. New surface tokens live only in the authoritative shared token file (UXC-1).
- Performance retains its renderer, period control, time spacing, checkpoint markers, readout, slider, legend, reset and values table. The readout gains a tonal surface and a reversible inspection highlight for a fine pointer or keyboard focus. Only background and shadow transition; the figures and plotted geometry change immediately (UXC-5, UXC-12).
- Holdings gains a compact held-count badge and a clearer table heading surface. Allocation gains a supporting tint and centre surface, with an explicit selected legend row. No allocation angle or bar length is changed for animation.
- The inherited card stagger now moves fully readable surfaces: no arrival or delay hides a financial figure. Reduced motion removes the movement. It does not introduce a count-up, progressive plot drawing or ambient repetition.
- Search now glides surviving rows with the existing row controller, just as sorting does. Table groups depend on the complete fund set, so filtering no longer replaces a surviving keyed row. Empty group headings are omitted; a completely empty result retains the existing explanation and clear-search recovery. Exact values, portfolio totals and chart paths do not change when searching.
- The row controller measures positions relative to its card. A card arrival, a page scroll or a notice above it therefore cannot create a false row displacement. A regression case proves that parent movement is ignored while real movement inside the card is retained.

These are interface refinements under the [UI system](ui-system.md), [interaction coverage](interaction-coverage.md), [motion layer](motion-layer.md) and [web quality contract](../operations/web-quality.md). They change no calculation, import, ledger, persistence, consent, recovery or open architecture decision. Financial calculations remain canonical (PRN-2, ARC-4).

## Value-axis readability

Visual inspection of the production renderer with amounts shown found that long EUR labels could exceed the fixed right-axis gutter. The line charts now have an explicit EUR unit and compact axis formatting: k for thousands and M for millions, with Italian separators and up to one decimal. This is a display policy, not a new financial method. The exact existing EUR formatter still owns the readout, accessible value summary, values table and the native title on each axis label. Real zero remains zero; invalid non-finite formatter input produces no label, never a fabricated zero. Privacy masks both the visible abbreviation and its exact native title.

The plotted observations, axis bounds and paths retain the same canonical geometry. The dedicated rendered audit measures actual axis text against the SVG edge at desktop, phone and enlarged text sizes; it does not infer success from a CSS rule. The formatter has explicit examples for zero, negative values, thousands, millions and non-finite input. This corrects a visible financial-readability defect without changing the renderer's numerical authority (UXC-7, UXC-8).

## Source and interaction scope

The selected prototype's PR 5 failed its rendered CI gate on eight text-contrast cases. The failing run was inspected directly: the build and project checks passed, while axe reported dark Portfolio/Expenses/Month-by-month text and light Import text below 4.5:1. The actual readout surface resolves the Portfolio cases. Three targeted fixes address the remaining combinations: segmented controls use the existing solid secondary surface, expense-state pills use the primary-container/on-primary-container pair, and secondary values in a selected month use the normal text colour. The palette and distinction between surface levels are retained. The full 32-screen accessibility audit passes locally after these corrections; this does not change PR 5's branch or historical failed run.

The phone holdings list was extracted into its own component in a separate refactor commit to keep the existing file within the structure limit. It retains the same markup, fund keys, links, figures and privacy components. Desktop and phone remain two responsive presentations of one canonical projection; there is no alternate financial implementation.

The source inventory is regenerated and reviewed after the changes. Existing native controls retain their shared hover/focus, press/release and disabled feedback. The new readout highlight is an inspection surface, not another control. Source classification is not state coverage: unexercised error, touch, assistive-technology and provider states remain OPEN (UXC-4).

| Changed behaviour | Required evidence |
|---|---|
| Card stagger | Real CSS arrival animations inspected at their first frame; financial contents fully opaque, including delayed cards; reduced motion checked separately |
| Search continuity | Same connected DOM row, unchanged figures, real running glide, exact settled position, unchanged headline and chart paths, no glide under reduced motion |
| Chart readout inspection | Existing production chart/keyboard journeys and pointer feedback survey; paint-only styling, with exact financial content retained |
| Allocation legend | Existing linked legend/donut inspection journey, geometry and state survey |
| Axis formatting | Independent formatter examples, measured SVG text bounds and the exact-values fallback |
| Mobile list extraction | Existing phone journeys, sorting, financial values and privacy checks in the production renderer |

## Reproduction and evidence

Use `npm run doctor`, `npm run verify`, `npm run audit:rendered` and `npm run capture:readme` for the repository gates. Run `node scripts/audit/portfolio-polish.ts` after a production build for the new motion/readability regression checks and actual-app screenshots. Generated evidence lives under dist/portfolio-polish; nothing there is a real financial record. The separate app preview uses the normal production preview server on port 5190, with the signed-out `?demo=many#overview` route.

Environment: local macOS Chrome, synthetic demo portfolios, Node 26.13.1. Node 22/24 CI, real Google access, deployed-origin, physical devices, simultaneous devices, other engines and screen readers are separate and unverified. The browser plugin is still unavailable because a bundled runtime component is missing; the documented fresh-profile repository Chrome runner supplies the rendered evidence.

| Check | Result | Evidence |
|---|---|---|
| Full repository gate | PASS | 1,327 tests in 130 Vitest files, 33 script tests, types, lint, coverage, formatting, source inventory, policy, build, PWA and content checks |
| Production interactions | PASS | 145 journey assertions and 931 control samples in 27 rendered states |
| Recovery and recorded-data journeys | PASS | Backfill 6, expenses recovery 22, expenses restore 9, sale/reopening 17, account outcomes 20, Portfolio signals 7 and checkpoints 18 assertions |
| Automated accessibility | PASS | 32 route/viewport/theme cases, including the prototype's formerly failing contrast combinations |
| Reduced motion | PASS | 16 screens and 48 assertions; no motion and immediate privacy hiding |
| Portfolio polish regression | PASS | Initial native animation frames fully opaque; keyed filtering moves and settles without changing financial content; nine layouts and measured axis labels, including 320px at 200% text; zero/one/many-fund cases |
| README captures | PASS | All 15 synthetic production captures regenerated |
| Source inventory review | PASS | 224 templates across 51 files after the mobile-list extraction; no new semantic control family |

The audit's pointer probe now scrolls Changes into view before measuring its hover point, because the richer summary can place its centre below the initial viewport. The same fine-pointer lift and inset-edge assertions remain in force. No assertion was removed or relaxed. The new Portfolio regression runs through the standard rendered gate as `npm run audit:portfolio-polish`; its native animation clock is frozen before mounting to measure the first frame without a timing race on CI.

A passing screenshot or synthetic renderer audit is never live-product verification (STD-11, BAN-15). Physical-device smoothness, screen readers, other engines, deployed integration and real Google remain unverified.

## Performance hover and scrub

The [Verdin Insights spending chart](https://demo.codeandchill.store/verdin/insights/) informed the guide, dot and tooltip that snap to a single observation. The existing Astryx portfolio hierarchy still provides the chart's context. Performance uses its existing hover, touch and keyboard selection to position the tooltip beside the guide, with exact masked or visible values from the same formatter as the readout. The halo and active dot use the settled coordinates, including while a series transition is running. Tooltip placement and dot emphasis use FolioDash tokens and update immediately. Other line charts retain their existing inspection presentation.
