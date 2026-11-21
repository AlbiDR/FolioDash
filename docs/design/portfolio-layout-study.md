# Portfolio composition study

Status: **Revision 02, review proposal, 2026-11-21. Isolated design study; not applied to the application.**

Owner request: explore a more coherent and polished desktop and mobile Portfolio in a separate worktree while another agent works independently.

Run `node scripts/artifacts/portfolio-layout-study.ts`, then open the generated dist/portfolio-study-preview/index.html in a browser. The generated study works without a server or account. Resize the window to compare layouts. The figures are invented and the chart is an illustrative SVG, not the production financial renderer. The only actions are section navigation, Hide/Show figures and the illustrative values disclosure. No import, save, connection or investment action is simulated.

## Revision 02: retain the existing character

The owner rejected revision 01 as too plain and identified the running local `?demo=many#overview` Portfolio as the stronger visual baseline. It was inspected directly in a fresh, synthetic Chrome capture. Its floating navigation, blue summary, dark tonal surfaces and chart-led composition are the starting point for this revision. The page at localhost:5174 was read only and is unchanged by this branch.

Revision 02 restores the floating glass frame and ambient backdrop, a saturated blue summary with controlled illumination, the tall Performance panel beside summary and Changes, coloured percentage pills, tonal fund badges, and an Allocation ring with a readable centre. The generic introductory headline is shortened. The proposal keeps the existing token family; it does not import another font or template. The review board now leads with dark-mode captures so the visual comparison uses the same theme as the preferred page. Light-mode captures remain available.

This corrects the direction of the study. It does not establish that the owner prefers the revision, replace the production renderer, remove the app's small trend charts, or change application navigation. Those controls and charts remain in the actual app; the standalone study still covers composition only.

## Composition

The opening screen answers three questions in order: what is the portfolio worth, how has it changed, and which funds make it up?

| Area | Desktop | Phone | Purpose |
|---|---|---|---|
| Frame | Floating translucent section navigation and a compact floating top bar | Compact top bar and fixed section navigation with safe-area padding | Keep orientation distinct from financial content |
| Summary | A blue summary above Changes beside Performance | First financial panel | Lead with total value, monthly change, net invested and gain |
| Performance | Larger share of the opening row | Full-width panel after the summary | Give recorded history enough space to read |
| Changes | A vertical panel below the summary | Label/value rows in one group | Retain the baseline’s stacked rhythm and clear period context |
| Holdings | Broad list with aligned value and gain columns | Identity above paired value/gain figures | Preserve financial information without squeezing a desktop table onto a phone |
| Allocation | Tinted supporting panel beside Holdings on wide screens | Full-width after Holdings | Explain composition with a labelled list and proportional ring |
| Comparisons | Clearly identified continuation | Follows the same reading order | Retain the existing visible analysis journey in any eventual implementation |

There is one page heading. The summary carries the strongest blue emphasis; Allocation uses a supporting tonal surface. Group spacing, type, surfaces, colours and feedback consume the existing FolioDash token source. This study retains the baseline’s summary/Changes/Performance relationship, proposes a tighter section rhythm and uses the existing larger shape token for main panels; it does not amend the current UI system. Proposed navigation is for sections inside this study, not a replacement for the app's destination navigation. Missing longer-period comparisons remain dashes with explicit reasons.

The Comparisons block is a boundary marker for this opening-screen study. It does not demonstrate redesigned trend charts or replace any existing comparison. Holdings sorting, fund links, actual range selection, chart inspection and application navigation are outside this artifact. Their future adaptation needs production implementation and evidence.

## References and adaptation

- Composition goals: a dominant chart, a distinct supporting panel, repeated row anatomy, close alignment, compact section rhythm, mobile recomposition and coordinated finite motion. These relationships use original markup and styling. No template code, fonts, copy, assets or dependencies were imported. FolioDash retains its navy/blue system and financial terminology.
- **Astryx Portfolio Dashboard**, template description reviewed at revision `dc58f19792b2ad26091d2f1914b8a4c54f6a9445`: [source](https://github.com/meta/astryx/blob/dc58f19792b2ad26091d2f1914b8a4c54f6a9445/packages/cli/assets/templates/pages/dashboard-composition/template.doc.mjs). Considered the balance/change, chart and ranked-holdings progression. Kept FolioDash's fund-value/net-invested history rather than adopting a composition-through-time chart. No upstream code or dependencies were used. See the [reference register](astryx-reference.md).

Existing [UI system](ui-system.md), [interaction coverage](interaction-coverage.md), [structural redesign](structural-ui-redesign.md) and [web quality](../operations/web-quality.md) remain authoritative. This is a proposal under UXC-11; it changes no financial definition, ledger, privacy policy, persistence or open decision. Financial rules remain canonical under PRN-2 and ARC-4. The standalone drawing establishes design intent only under UXC-8 and BAN-15.

## Motion and controls

The initial composition has one short settling transition, using FolioDash's motion tokens. Figures appear immediately; the plotted path and allocation lengths never animate. Shared control feedback is imported directly from the application. Reduced motion removes the entrance, all transitions and smooth scrolling. Hide figures replaces numeric content and removes the chart and allocation graphic immediately, including the open values table. This is a presentation demonstration; it makes no claim about data security.

The production inventory scans application sources only. It has been regenerated and reviewed; this generated artifact does not add production controls. Its separate audit also runs the existing style policy against its extracted CSS; the production gate is unchanged. The study inventory is explicit here, rather than extending or weakening that check.

| Study control | Contract | Evidence scope |
|---|---|---|
| Skip link | Visible on focus; moves to main | Shared feedback; manual screen-reader journey OPEN |
| Brand and section links, desktop and phone | Native anchors, focusable targets, current-location indication | Reflow/target sizes measured; individual hover/press and touch journeys OPEN |
| Hide/Show figures | Toggle with immediate masking, visible selected state and live announcement | Keyboard, pointer hover/press/release and masking checked by the study audit |
| Observation disclosure | Native keyboard-operable disclosure with open-state indication | Open table and privacy checked; individual animated opening/closing OPEN |
| Values scroll region | Named, focusable local scroll region | Target dimensions and page overflow checked; full keyboard scroll journey OPEN |
| Design-notes link | Native link to this document | Target dimensions checked; individual feedback states OPEN |

No count or matching selector is presented as complete state coverage (UXC-4). Physical touch, screen readers, other browser engines and smoothness remain OPEN.

## Reproduce and inspect

Run `node scripts/audit/portfolio-layout-study.ts` from the checkout after `npm run setup`. It uses the repository's isolated Chrome runner and serves only the study's selected static dependencies from generated output. It writes full-page PNGs, a compact desktop/phone review board and a JSON report under `dist/portfolio-layout-study/`. It does not access a signed-in browser or a Google account.

The study audit checks 1440, 768, 390 and 320 CSS-pixel widths, desktop and phone dark mode, and 320px with 200% text. It checks page overflow, target dimensions, reading order, single H1/main, automated accessibility, immediate masking including an open values table, reduced motion and the privacy control's keyboard and pointer states. Screenshots demonstrate settled layout, not production chart correctness or physical-device behaviour.

Implementation files: [artifact generator](../../scripts/artifacts/portfolio-layout-study.ts), [markup](../../scripts/artifacts/portfolio-study/markup.ts), [styles](../../scripts/artifacts/portfolio-study/styles.ts), [presentation interactions](../../scripts/artifacts/portfolio-study/interactions.ts), [rendered audit](../../scripts/audit/portfolio-layout-study.ts). The HTML imports FolioDash's authoritative tokens and feedback directly; no second application or financial engine is introduced.

## Verification record

Revision: revision 02 on the design-study branch based on `95045d7`; revision 01 is preserved in commit `75f7b70`. Final revision commit reported to the owner after checks.

Environment: local macOS Chrome; Node 26.13.1. All figures synthetic. Node 22/24 CI and deployed verification are separate.

| Check | Result | Evidence |
|---|---|---|
| Setup and doctor | PASS | Isolated checkout dependencies installed from the existing lockfile; doctor reports ready |
| Study renderer | Revision 02 PASS | Seven layouts; no page overflow or undersized targets; one main/H1; phone reading order; non-overlapping chart dates; axe checks; immediate privacy including open table; reduced motion; privacy keyboard and pointer feedback. JSON report and PNGs under dist/portfolio-layout-study |
| Production source inventory | PASS | Regenerated and reviewed: unchanged at 224 templates across 50 files |
| Production interaction audit | PASS | 145 journey assertions, 931 control samples, 27 states |
| Production recovery and recorded-data journeys | PASS | Backfill 6, expense recovery 22, expense restore 9, sale/reopening 17, account outcomes 20, Portfolio signals 7 and checkpoints 18 assertions |
| Production automated accessibility | PASS | 32 route/viewport/scheme combinations, no violations |
| Production reduced motion | PASS | 16 screens, 48 checks; no motion and immediate hiding |
| README captures | PASS | All 15 synthetic light/dark/phone captures regenerated from the unchanged production application |
| Full repository verification | Revision 02 PASS | Revision 02 full run: 1,324 tests across 130 files and 33 script tests; build, policy, types, lint, coverage, PWA and content checks passed |

The browser plugin was unavailable because a bundled browser-service component was missing. The study and production audits used the repository's documented, fresh-profile Chrome runner instead. A capture attempt initially hit the interaction audit's occupied port; the complete capture was rerun successfully using FOLIODASH_AUDIT_PORT=4208. No check was weakened.

Visual review: inspected desktop light/dark and phone captures, and compared revision 02 against the owner’s preferred running dark-mode Portfolio. The first 200% text render exposed figures squeezed into narrow columns despite no page overflow; the final proposal stacks those fields when the available width is small relative to the text, and thins the chart date labels to the endpoints while retaining all dates in the values table. This illustrates why screenshot review accompanies the assertions.

Production application layout is unchanged. The production rendered journeys and README captures above are retained evidence from revision 01; revision 02 changes only the isolated artifact and its capture presentation. No Google, deployed-origin, simultaneous-device, physical-device, other-engine or screen-reader proof is claimed. Individual control states remain OPEN as listed above.
