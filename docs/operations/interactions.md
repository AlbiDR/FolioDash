# Microanimations and interactions

The inventory contains **92** named behaviours: the original 32, five additional microanimations (33-37), five additional functional microinteractions (38-42), and two further sets of 25 motion touchpoints (43-67 and 68-92). A touchpoint means a particular control/state receiving motion feedback, not a unique keyframe: related controls deliberately share easing and choreography. Existing chart reveals, card entry animations and mobile date sliders are outside this count.

The shared presentation layers are `src/interfaces/web/shared/ui/interactions.css` and `motion.css`, imported after the base styles. Motion durations, distances and easing come from `shared/tokens.css`. Functional interactions remain in their owning UI components; the financial kernel and persistence are unchanged.

## Polish and consolidation, 2026-11-05

This pass refines the existing interaction system without adding another animation quota:

- Dashboard cards arrive together with a short two-pixel cue; financial figures are visible immediately. Line charts show the entire shape immediately with a brief emphasis transition. Sidebar movement uses the shared duration tokens. Legend spotlight cancels competing arrival animation so inspection always owns opacity.
- Buttons, field controls, navigation, status links and disclosures retain 48px target heights on desktop as well as mobile. Exclusive chart-period selection uses one Tab stop with the existing arrow/Home/End controls. Forced colours preserve visible selection boundaries. Focus is brought clear of the measured sticky header or floating navigation after keyboard/programmatic handoffs, including zoom and viewport changes.
- Fund search has an explicit Clear search action and Escape recovery, both returning focus to the field. Clipboard actions expose actual pending/success/failure states, prevent overlapping requests and keep manual-copy recovery available. Compact month browsing shows and announces the actual statement date and position.
- Line inspection separates a selected date from temporary pointer hover and restores selection on pointer exit. A shorter chart period clears dates no longer present. Chart reset is visible beside the date controls; Escape also resets inspection. Monthly bars have one Tab stop, arrow/Home/End browsing, focus-driven readouts and a latest-month reset. Both date sliders expose privacy-aware formatted summaries; value tables have labelled, keyboard-scrollable regions.
- Manual entry, file reviews and validation hand focus to the next useful heading or unresolved field. Retained manual/file drafts have separate save locks and instance-specific field/radio identifiers. Actual saving/checking, unknown outcomes and saved-but-not-reloaded states freeze financial inputs and prevent a replacement import; read-only checking remains available until the outcome is resolved. The optional JSON-history importer retains its interrupted-save receipt after a failed check and shares the shell lock without unmounting its recovery controls.
- Import steps identify the current phase. Account actions name their actual pending operation and retain a live status. Forget this device focuses the safe Keep it action first and restores the trigger on cancellation. Browser departure and app updates respect an active import/recovery lock.

No financial calculation, persistence protocol, confirmation requirement or Google scope is changed by this pass. Reduced motion removes the new transitions and entrances while preserving immediate state feedback. Chart resizing schedules width updates outside ResizeObserver delivery and cancels pending work on cleanup.

Verification for this pass uses the actual local production renderer and isolated headless Chrome with invented demo portfolios, service-worker bypass and browser focus emulation. Component recovery probes use explicit synthetic save/clipboard stand-ins and are not live Google verification. Probe scripts and screenshots remain outside the repository under `/tmp/foliodash-polish-production.mjs`, `/tmp/foliodash-workflow-polish-check.mjs`, `/tmp/foliodash-portfolio-polish-check.mjs` and `/tmp/foliodash-chart-feedback-check.mjs`. Physical devices, Firefox/WebKit, screen readers and live Google behavior remain separate acceptance gates.

Result: **PASS** for the polish patch following `ecbe70f`, checked independently of concurrent work-expenses changes. `npm run verify` passed with 637 tests, repository/contributor/punctuation rules, types, lint, production build, PWA integrity and the Apps Script bundle check. The exact isolated production artifact passed all 109 browser assertions across five routes, five invented portfolio variants, 320-1440px viewports, 200% text, normal/reduced motion, privacy, forced colours, keyboard inspection, geometry preservation, header/navigation focus clearance and sidebar resize. The isolated artifact can be checked with `/tmp/foliodash-polish-isolated-production.mjs`; synthetic component probes additionally cover interrupted responses, repeated read-only checks, duplicate-submission guards and retained draft isolation.

## Shared surface feedback and allocation inspection

The follow-up on 2026-11-04 covers gaps between the original numbered touchpoints. This is a shared presentation rule rather than another fixed animation quota:

- Every card and chart panel acknowledges hover with an accent edge and soft elevation. Keyboard focus within a panel has the same boundary, and touch press has an immediate edge. Chart and form panels stay in place while being used.
- Current gain, Month on month, Year to date and Year on year additionally lift by two pixels on a fine-pointer hover. Their labels gain accent and available sparklines gain emphasis. An unavailable metric keeps its reason and still receives surface feedback. These information cards keep normal text semantics and are not extra keyboard stops.
- The portfolio and fund hero cards share panel feedback. The portfolio hero also emphasizes its sparkline and gently shifts its existing decorative gradients.
- Allocation segments are fund links with names and shares in their accessible labels. Hovering a segment or legend link, or focusing either by keyboard, highlights that segment and legend row and shows the exact share in the centre. Leaving inspection restores the fund count. Pressing a segment or legend link opens the fund, including on touch. Legend links have full 48px targets and wrap long fund names. Keyboard focus clears stale pointer inspection; pointer exit restores any remaining focused fund.
- Facts, glossary entries, import-review KPIs and monthly matrix rows gain a subtle inspection surface. Ranking rows, linked action rows, phone holdings and link-style buttons share hover/press feedback.

Allocation inspection stays inside its own component, so pointer movement does not rerender the rest of the dashboard. Segment angles, plotted paths, values, axis bounds and financial calculations do not animate or change. Reduced motion removes the stat lift and gradient movement in addition to all transitions and animations; the selected fund remains readable immediately.

| # | Addition | How to exercise it |
| --- | --- | --- |
| 01 | Consistent enabled-button press feedback | Hold a button; disabled buttons do not compress |
| 02 | Primary-action hover lift | Hover a primary action with a fine pointer; touch does not get a sticky hover |
| 03 | Keyboard button focus halo | Tab to a button; its existing focus outline remains |
| 04 | Selected navigation icon settles | Navigate to a different main destination |
| 05 | Navigation icon press feedback | Press a main navigation destination |
| 06 | Sliding time-range selection pill | Switch between 3M, 6M, 1Y and All |
| 07 | Arrow-key range selection | Focus a range button and press Left/Right; focus and selection move together and wrap |
| 08 | Home/End range shortcuts | Focus a range button; Home selects the first, End the last |
| 09 | Privacy icon swap | Toggle privacy; only the icon animates, amounts change immediately |
| 10 | Privacy-state halo | Hidden amounts keep a visible boundary on the privacy control |
| 11 | Mobile holding-row press surface | Press a fund in the phone holdings list |
| 12 | Action chevron nudge | Hover or keyboard-focus a linked fund/action row |
| 13 | Ranking-row keyboard emphasis | Tab to a fund in Gain by fund |
| 14 | Allocation-legend row emphasis | Hover or keyboard-focus an allocation fund link |
| 15 | Input hover border | Hover an enabled field with a fine pointer; invalid fields keep their error border |
| 16 | Input focus halo | Focus a text/date/select field |
| 17 | Fund/question group focus boundary | Move focus into and out of a fund fieldset |
| 18 | Checked-answer surface | Select a radio answer or the restore confirmation checkbox |
| 19 | Chart date-slider focus/drag halo | Focus or drag a chart's date slider |
| 20 | New fund card entry | Add a fund; its card enters without animating existing cards |
| 21 | Add-fund focus handoff | Add a fund; its name field receives focus and is brought into view |
| 22 | Remove-fund focus handoff | Remove a fund; focus moves to Undo removal |
| 23 | Undo focus restoration | Undo removal; focus returns to the restored name/value field |
| 24 | Entry-method panel transition | Switch Excel/manual; the newly visible panel enters and the draft remains mounted |
| 25 | Values/review transition | Continue to review, then return to values; existing answers remain under the existing retention rules |
| 26 | Disclosure-content entrance | Expand a definitions, values table or comparison disclosure |
| 27 | Disclosure indicator rotation | Open/close a disclosure; the chevron follows its native open state |
| 28 | Real-work spinner | Read a file or save a statement; the spinner follows that actual state and stops afterwards |
| 29 | Notice/error entrance | Trigger a new notice or validation message; it fades in once and stays available |
| 30 | Chart legend spotlight | Select a legend name; other lines soften. Select it again to clear. Every observation and axis bound stays unchanged |
| 31 | Active chart-point emphasis | Explore chart dates; active markers grow subtly without animating financial coordinates |
| 32 | Monthly bar pin/unpin | Tap/click a bar or activate it with Enter/Space; the selected month remains after the pointer leaves. Activate it again to release it |
| 33 | Animation: inspection crosshair entrance | Explore a chart date; the guide fades in without tweening its coordinates |
| 34 | Animation: selected legend swatch | Highlight a chart line; its legend swatch briefly extends to its full width |
| 35 | Animation: back-link directional cue | Hover or keyboard-focus Portfolio on a detail screen; its arrow briefly nudges left |
| 36 | Animation: changed-month boundary | Choose a statement month; the summary border briefly confirms the change |
| 37 | Animation: restored-fund tone | Undo a fund removal; the restored card briefly changes tone |
| 38 | Interaction: adjacent statement navigation | Use Previous/Next on the phone month view. They follow recorded dates, skip absent months, and disable at the ends |
| 39 | Interaction: latest-statement shortcut | Use Latest to return directly to the newest recorded month |
| 40 | Interaction: reset chart inspection | Reset the inspected date and highlighted line together; the time range and axes stay unchanged |
| 41 | Interaction: copy a fund's ISIN | Copy ISIN on a fund page; a persistent live status reports success or an actionable clipboard failure |
| 42 | Interaction: fund-list search | Search holdings by name or ISIN on phone/desktop. A result count and empty state explain the filter; portfolio totals and charts remain unchanged |
| 43 | Main-navigation selection glide | Switch destinations; the shared selected surface moves horizontally on phones and vertically in the sidebar |
| 44 | Sidebar-toggle direction | Collapse/expand the desktop sidebar; its icon smoothly mirrors direction |
| 45 | Source-chip hover boundary | Hover the source link with a fine pointer |
| 46 | Source-dot state settlement | An actual source tone change remounts only the dot for a short scale settlement |
| 47 | Toolbar-icon hover boundary | Hover the sidebar control with a fine pointer |
| 48 | Page-title arrival | Navigate between pages; only the new heading gets a short two-pixel arrival |
| 49 | Import-mode destination marker | Switch One statement/Whole history; the destination marker extends |
| 50 | Filter-result count cue | Change the search result count; only the count text receives a short fade |
| 51 | Active field label | Focus a labelled field; the label transitions to accent |
| 52 | Active field instructions | Focus a field with instructions; the instructions gain text contrast |
| 53 | Focused placeholder recession | Focus a field with a placeholder; its example becomes quieter while its label stays visible |
| 54 | Native file-picker hover | Hover the file input; its native picker button changes tone |
| 55 | Valid manual subtotal boundary | Complete valid values; the total gains a boundary without tweening the amount |
| 56 | Validation-label colour | Enter/resolve an invalid field state; its label transitions to/from error colour |
| 57 | Checkbox selection settlement | Check a checkbox; only the small native glyph settles |
| 58 | Radio selection settlement | Select a radio answer; its glyph settles within the unchanged label target |
| 59 | Action availability fade | An action enables/disables; opacity follows its actual state |
| 60 | Workbook-link underline | Hover or focus Open in Google Sheets; its secondary underline extends |
| 61 | Disclosure hover surface | Hover a disclosure summary with a fine pointer |
| 62 | Disclosure focus boundary | Keyboard-focus a disclosure summary; its boundary transitions in |
| 63 | Clipboard-result arrival | A real clipboard result updates text inside the retained live region |
| 64 | Search-empty explanation | A search with no matches reveals its explanation gently |
| 65 | Returning search rows | Newly matching rows appear; existing matching rows are not remounted |
| 66 | Review-ready edge | A ready/review panel appears with a short edge confirmation |
| 67 | Local-record summary settlement | The existing browser-only recorded summary settles after an actual local record |
| 68 | Chart-legend hover surface | Hover a legend action; its surface blends in |
| 69 | Chart-legend keyboard swatch | Keyboard-focus a legend action; its swatch nudges slightly |
| 70 | Highlighted readout label | Spotlight a line; its readout label changes tone, with amounts untouched |
| 71 | Slider-thumb press | Hold a native chart slider thumb; only the thumb grows slightly |
| 72 | Slider-label focus | Focus a chart date slider; the label gains contrast |
| 73 | Inspected date cue | Inspect another chart date; the date text receives a short fade |
| 74 | Pinned-bar outline | Pin/release a monthly bar; its outline opacity transitions |
| 75 | Bar keyboard hit surface | Keyboard-focus a bar; its hit region receives a subtle surface |
| 76 | Inspected bar-month cue | Change the inspected bar month; only the month label fades |
| 77 | Allocation-dot hover/focus | Hover or focus an allocation link; its dot grows slightly |
| 78 | Allocation-dot press | Press an allocation link; its dot compresses |
| 79 | Ranking-bar hover contrast | Hover a ranking link; its bar brightens without changing length |
| 80 | Ranking-track keyboard boundary | Focus a ranking link; its track gains a boundary |
| 81 | Holdings-share inspection | Hover/focus a holdings row; its share fill gains contrast, retaining width |
| 82 | Holdings keyboard row surface | Focus a table fund link; the row surface follows the existing transition |
| 83 | Wide-table focus boundary | Focus a scrollable table region; its boundary appears |
| 84 | Phone holding-name focus/hover | Hover/focus a phone holding link; its name gains accent |
| 85 | Month-step arrow cue | Hover/focus Previous/Next; the arrow moves in the matching direction |
| 86 | Monthly fund-card focus boundary | Focus a fund link in the monthly phone view; its card gains a boundary |
| 87 | Source-status text change | Actual source/status wording updates with a short fade |
| 88 | Chart-reset availability cue | Begin chart inspection; the newly available reset action gets one edge cue |
| 89 | Account-result heading | A successful account result reveals its heading gently |
| 90 | Confirmed history progress | The fill transitions only to the actual number of confirmed saved statements; accessible counts update immediately |
| 91 | Google-consent waiting edge | A real waiting state produces a single boundary cue, without repeating pulses |
| 92 | Available-update arrival | An actual update notice enters from above; reload still requires the person's action |

## Behaviour limits

- No delay before navigation, saving, privacy changes or error display. No count-up amounts, invented progress, vibration, sound or automatic dismissal.
- Hover effects require a hover-capable fine pointer. Focus handoffs preserve the entered values; real Android keyboard appearance remains a device check.
- Reduced motion disables animations and transitions, including pseudo-elements such as the spinner and selection pill. All selections, focus changes, disclosures and chart controls remain functional.
- Chart spotlight changes opacity only. It does not filter series, refit axes, rewrite history or change any metric. Monthly pinning changes only the inspected observation.
- Save-state feedback uses `data-busy` rather than suppressing the live status region with `aria-busy`, so work announcements remain available.
- The additional 50 touchpoints share a small motion vocabulary. Most are hover/focus/state transitions, not entrance animations. There are no staggered animation queues, added timers, animation dependencies or repeating decorative pulses. The existing actual-work spinner remains the only repeating motion.
- Most added cues take 150-220ms and move at most 2px. Interactive transforms never change the dimensions of a financial bar, series, axis, amount or hit target. Native choice/slider glyphs can scale inside their existing hit regions.
- History progress animates a presentation width towards the actual confirmed count. It never advances while waiting for an acknowledgement; its accessible count and accompanying status update immediately. It is not a financial value animation.

## Verification

Run `npm run verify` for the full source and build gates. Browser acceptance additionally checks the numbered behaviours, range focus/shortcuts, add/remove/undo focus, chart spotlight with unchanged paths/ticks, monthly pinning, draft retention, narrow-layout overflow, and reduced-motion computed styles. Record actual results separately from physical Android/WebAPK, screen-reader and live Google testing.

Local browser evidence (headless desktop Chrome, synthetic portfolio, 2026-11-03):

| Check | Result |
| --- | --- |
| Inventory has 32 sequential unique entries | PASS |
| Range End, Home and wrapping Left selection, focus and pill transform | PASS |
| Legend highlight/reset, with identical line paths and axis tick text before/after | PASS |
| Monthly bar Enter to pin, pointer leave retention, Space to release | PASS |
| Add focus, remove-to-undo focus, restore-to-field focus | PASS |
| Reduced-motion computed animation/transition styles, including spinner pseudo-element | PASS |
| Manual draft, removal undo, review/back and movement-answer retention | PASS |
| Five main screens at 320/390/430/844/1440px, narrow touch-target checks, short viewport and doubled root text | PASS: the prior mobile layout checks remain green |

Physical touch feel, Android software-keyboard behaviour, screen-reader announcements and live Google saving are NOT RUN here. The feedback layer also needs a visual judgement on the actual phone; a computed-style or synthetic interaction check cannot establish that it feels right there.

Follow-up for additions 33-42 (same local synthetic environment): the inventory check passes with 42 unique sequential entries, exactly five new animations and five new interactions. Browser checks pass for Previous/Next end boundaries, Latest, search/no-result/clear, chart reset with unchanged geometry, and clipboard success/failure feedback using a stubbed Clipboard API. Computed animation names confirm crosshair, swatch, month summary and undo feedback; actual Tab/Shift-Tab focus confirms the back-arrow cue. Reduced motion disables restored-card animation. The prior motion/focus and five-width mobile checks also pass. Native clipboard permissions and physical Android clipboard use remain NOT RUN.

## Evidence for the further two sets of 25

The inventory/source-marker check confirms exactly 50 additional touchpoints, numbered 43-92, and 92 total entries. The implementation adds no dependencies, timers or financial calculations. The new motion module is separate from the original interaction layer and uses the same semantic tokens.

Local headless Chrome with synthetic portfolios checks:

- The moving main-navigation surface finishes within 2 CSS pixels of the selected link's centre on phone and desktop, in the appropriate direction. Its count comes from the actual navigation entries, not a fixed number of destinations. Links share their row height so enlarged labels do not detach the indicator.
- Manual totals gain readiness only when valid, with 180ms boundary, label and instruction transitions. Amount text changes immediately.
- Reduced motion leaves zero running document animations and zero transition duration on the navigation indicator, native file button and native slider thumb. Native-control pseudo-elements have explicit overrides.
- A presentation-only progress fixture finishes at exactly the supplied confirmed fraction. This checks the fill, not a live history import; the production fraction is supplied by the existing confirmed-save callback, with no simulated increments.
- Earlier keyboard, chart highlight/reset and unchanged geometry, pinning, copy-feedback stub, add/remove/undo focus, draft retention and five-width mobile checks are rerun. Visual inspection uses the actual production renderer with invented data.

This evidence does not measure frame rate on the person's phone or prove physical Android smoothness, screen-reader use, native clipboard consent, actual Google sign-in/waiting, history saving or service-worker update arrival. Conditional feedback for those journeys is implemented but its live-provider/device acceptance remains pending. No new support claim follows from the number of motion touchpoints.

## Evidence for shared surface feedback

Local production build, headless desktop Chrome and touch emulation, synthetic portfolios, 2026-11-04:

- All four gain cards finish their hover at a two-pixel lift with the shared edge/elevation. Available sparkline fills gain emphasis, including when the portfolio has an unavailable year-on-year metric.
- Allocation legend hover and keyboard focus highlight the matching segment and show the same formatted share as the legend. Keyboard focus replaces an earlier pointer selection; pointer exit retains any focused fund; leaving both restores the count. Segment focus has a visible stroke and Enter opens its fund. Touching a segment also opens its fund.
- Amount text, allocation path data, line path data and axis tick text are identical before and after inspection. No browser page errors occur.
- Portfolio, month, import, history and account screens have no page-level horizontal overflow at 320, 390, 430, 844 and 1440 CSS pixels. Touch emulation covers typical, single-fund, many-fund, different-fund and empty portfolios; all allocation legend targets measure at least 48 by 48 pixels.
- The 100-percent centre label fits inside the ring in dark mode and at doubled root text size on a 320px viewport. Allocation typography follows its actual container width.
- Reduced motion has zero running document animations, zero panel/segment transition durations and no stat-card translation, while focus/selection remain functional.

These checks exercise the actual local production renderer, with service workers blocked to ensure the tested build is current. They do not establish physical Android feel, other browser-engine support, screen-reader announcements or live Google integration.
