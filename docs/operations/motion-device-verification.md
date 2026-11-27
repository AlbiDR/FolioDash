# Motion verification on other browsers and real devices

Status: **Proposed 2026-11-27; not run.** This is phase 8 of the [polished-by-default plan](../design/polished-by-default.md) (FD-029). It is a script for the owner to run on their own devices, and an automated half that needs a decision. The device and browser matrix belongs to FD-012, which is still open, so the matrix below is a proposal until the owner accepts or amends it. Nothing here has been run, and no result is claimed (STD-11).

## What is and is not proven today

| Proven, on synthetic data | Where |
|---|---|
| Every screen's arrival, in-app entry, data changes, layers and reduced motion, in headless Google Chrome | the rendered audits, locally and on CI's macOS runners ([testing](testing.md)) |
| Motion components mounted in real Chrome, WebKit (Safari engine) and Firefox (change cue, Presence, count-up, page motion, busy indicators, disclosure) | `npm run test:browser` |
| Slow-frame behaviour of the navigation pill, reproduced by CPU throttling | `AUDIT_CPU_THROTTLE`, see [the sidebar journey flake](../design/polished-by-default.md#the-sidebar-journey-flake-2026-11-27) |

| Not proven | Why it matters |
|---|---|
| Safari and Firefox as whole products, and every mobile browser | The component tests run in the WebKit and Firefox engines on desktop; the full-page audits do not. Different engines run view transitions, entry styles, individual transform properties and animated disclosures differently, or not at all |
| Physical devices | Frame pacing, touch, safe areas, edge-swipe back |
| Screen readers | Notices now enter and leave through a wrapper; announcements, focus and the "pressed" state of the new selectors are untested with assistive technology |
| The installed app (PWA) | Standalone window, update flow, launch animation |
| The deployed origin | The published demo is built by CI; it has not been walked on a device |
| Real data and real Google | Out of scope here: the connected flows have their own acceptance ([onboarding acceptance](onboarding-acceptance.md)) |

## Ground rules

- **Synthetic only.** Test on the published demo, `https://albidr.github.io/FolioDash/`, or a local preview. Do not sign in, import a real statement or capture a real account in any screenshot or recording. The files for the import journeys are the generated synthetic ones (`npm run build:fixtures`, [onboarding acceptance](onboarding-acceptance.md)).
- **Name the build.** The Your data screen ends with the build stamp ("FolioDash build: ..."). Every result records it, with the engine and OS version, the device, the OS settings and the date.
- **Three outcomes only:** PASS, FAIL, NOT RUN. A result is never inferred from another device, and a simulator or a resized desktop window is not a physical device ([web quality contract](web-quality.md)).
- **A failure is reproduced before it is fixed.** The sidebar flake took a trace to find; guessing took two wrong fixes. Record what was seen, where, and the script id.

## Proposed matrix (for the owner to accept or amend, FD-012)

| Tier | Engine | Device | Why |
|---|---|---|---|
| A | Safari | Mac, current macOS | WebKit on desktop; the audits' text geometry assumes the macOS font, but run in Chrome |
| A | Safari | iPhone, current iOS | Touch, edge-swipe back, safe areas, home-screen app |
| A | Chrome | A physical Android phone, ideally mid or low range | Frame pacing on weaker hardware, installed WebAPK |
| B | Firefox | Desktop | Gecko |
| B | VoiceOver on Safari (Mac and iPhone), TalkBack on Chrome (Android), NVDA on Firefox (Windows, if available) | | Screen readers |

OS settings to cover on each device where it exists: **Reduce Motion** (macOS and iOS "Reduce motion", Android "Remove animations"), **Reduce transparency** and **Increase contrast** (macOS, iOS), forced colours (Windows), the largest text size or 200% zoom, and dark mode. Motion on and Reduce Motion on are separate runs.

## What differs by engine, and what to expect

Each feature below is guarded or has a fallback. A run records which of the two behaviours the engine shows; either is acceptable if the rest of the script passes.

| Feature | Where | With support | Without |
|---|---|---|---|
| Same-document view transitions | `src/interfaces/web/shared/ui/use-page-motion.ts`, `src/interfaces/web/shared/ui/motion/arrival.css` | Sidebar and toolbar hold still, the page fades out, a holding row's name moves into the fund title | The page fades out and the next arrives; focus still lands on the page |
| Entry styles (`@starting-style`) | `src/interfaces/web/shared/ui/motion/state-controls.css`, used by Presence | A notice or layer grows in | It appears without growing; leaving is unaffected |
| Animated disclosure (`interpolate-size`, `::details-content`, behind `@supports`) | `src/interfaces/web/shared/ui/motion/layers.css` | A details panel opens and closes smoothly | It opens at once with a short fade |
| Registered `--section-arrival-delay` | `src/interfaces/web/app/styles/page-chrome.css` | Sections arrive in reading order | Delays fall back to zero; sections still arrive |
| Glass (`backdrop-filter`, reduced-transparency and unsupported fallbacks) | `src/interfaces/web/shared/tokens.css`, `src/interfaces/web/app/styles/shell.css` | Translucent navigation | Opaque surfaces, no blur |
| Individual `scale`, `translate`, `rotate` | the state files in `src/interfaces/web/shared/ui/motion/` | Press, hover and focus movement | Colour and outline feedback remain; the small movements do not |
| Hover only on a fine pointer (35 rules) | all stylesheets | Hover feedback with a mouse | On touch, nothing sticks; press feedback only |

## The scripts

Run each on every device in the matrix, once with motion and once with Reduce Motion, unless a step says otherwise. Record by id. "Settle" means everything has stopped moving.

**M1, cold open.** Open the demo in a new tab or after killing the app. Expect the Portfolio's sections to arrive in reading order and settle within about 1.2 seconds, figures to count up once, charts to draw, no flash of unstyled content and no layout jump. Evidence: a screen recording.

**M2, in-app navigation.** Portfolio to Month by month and back; Portfolio to a fund (tap a holding) and back; Portfolio to Expenses to Your data. Expect the sidebar (or the bottom dock) and toolbar to stay still, the old page to fade, the new page to arrive quicker than a cold open, figures to show at once without counting, and a holding's name to move into the fund page's title. On iPhone also swipe back from the edge: expect no double animation, no stuck overlay and no frozen page. Evidence: recording; note whether the engine used a view transition.

**M3, changes in place.** Change the chart period; sort and search Holdings (surviving rows glide, returning rows fade, rows that stay do not re-fade); filter Activity (rows glide); step through months on Month by month (figures change at once with a short fade, never from zero); toggle privacy (amounts hide immediately and nothing fades on the masked text). Evidence: recording.

**M4, layers.** On Expenses open a weekend day (the form leaves); on Your data open and dismiss "Forget this device"; add a checkpoint; trigger a validation message in a field; open and close a details panel. Expect each to enter and leave rather than appear or vanish, and the content below to shift smoothly. Evidence: recording.

**M5, busy indicators.** On Import choose a synthetic statement file. The reading line shows a spinner that turns about five times and then holds still while its message stays. Evidence: recording over eight seconds; note anything that keeps moving.

**M6, Reduce Motion.** With the OS setting on, repeat M1 to M5. Expect no transition or animation anywhere, every state change still visible, amounts to hide at once, page changes instant with no view transition, and no page stuck inert or half-faded. Evidence: recording.

**M7, touch and focus.** On touch: every control gives press feedback, nothing stays "hovered", targets are at least 48 pixels. With a keyboard (or Full Keyboard Access): tab through a page after a navigation; focus rings are visible and never hidden behind the sticky toolbar; arrow keys, Home and End move within Activity's status filter and Import's entry-method switch. Evidence: notes and a recording of the keyboard pass.

**M8, reflow and text size.** At the narrowest width and at the largest text size, run M2 and M4: no horizontal scrolling of the page, no clipped notice while it leaves, no overflow during a transition. Evidence: screenshots at rest and mid-transition.

**M9, frame pacing (the Android phone, and the oldest device otherwise).** Record a page change and a period change. Expect no freeze over about a tenth of a second, and the navigation pill's stretch to be visible. If Chrome's remote debugging is available, record a performance trace of one page change. Evidence: the recording or trace; the device model and age.

**M10, screen readers.** For each reader in the matrix: after a navigation, focus is on the page and its title is read; a notice or alert that enters is announced once, and one that is leaving is neither announced again nor reachable; a figure that changes is not announced twice; masked amounts read as "Amount hidden"; Activity's status filter and Import's entry-method switch read as toggle buttons with their pressed state and move with the arrow keys; the busy line announces its message once. Evidence: notes per item, and an audio or text capture where the reader supports it.

**M11, installed app.** Install on Android and iPhone, then repeat M1, M2 and M6 from the installed icon. Expect the same behaviour in the standalone window, and an update never to interrupt an unsaved entry ([installable app](pwa.md)).

## Recording results

Copy a row per run. Leave a row out rather than writing a result that was not observed.

| Script | Engine and version | Device and OS | OS settings | Build stamp | Date | Result | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## What each outcome allows

- Until a row is PASS with its evidence, the documents keep saying the case is not verified.
- When the Tier A rows for a device pass, the records may say motion is verified on that engine and device with the build named. They may not say "all browsers" or "all devices".
- A FAIL becomes a defect named by its script id. Its fix follows the project's usual path: reproduce, trace, fix at the source, and add a guard that fails without the fix.
- The scripts are the exit criteria of phase 8. Phase 8 is done when the owner has run the matrix they accepted, or has recorded which rows they chose not to run.

## Decisions for the owner

1. **The matrix.** Accept or amend the tiers above, and say which physical devices exist, including the age of the Android phone, because M9 is only meaningful on weaker hardware.
2. **Automated WebKit and Firefox. Implemented 2026-11-27 (owner request "Add WebKit and Firefox").** `npm run test:browser:install` downloads the two builds (about 620 MB, outside the repository) and the 15 component tests run in all three engines, locally and in the `accessibility-and-polish` CI suite. A probe found view transitions, individual transform properties, registered properties, `checkVisibility`, `backdrop-filter`, container queries and `@starting-style` supported in all three; `interpolate-size` is supported in Chromium and WebKit but not Firefox, where the disclosure test asserts the fade fallback instead. Original proposal: The web quality contract already says browser automation "should cover Chromium, WebKit and Firefox". Vitest browser mode can run the component tests (`npm run test:browser`) in Playwright's WebKit and Firefox as well. That would cover the engine differences in the table above for Presence, the change cue, the count-up and the page motion hook, in seconds, on every push. The cost is two browser downloads on CI (the macOS runner has Chrome only) and a few extra minutes of runner time. It cannot cover touch, screen readers or frame pacing on real hardware. This is a dependency and CI decision, so it is yours.
3. **Hosted device services.** A cloud device service could supply Safari and Firefox rows without owning the devices. It is an external service, so it needs your explicit approval, and it would still be limited to the synthetic demo.
4. **Who runs it.** The scripts take about two hours per device with recordings. If you prefer, I can split M1 to M8 into per-device checklists you can run and send back as recordings and notes, and fill in the results table from them.
