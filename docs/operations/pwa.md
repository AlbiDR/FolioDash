# Installable app (PWA and WebAPK)

Status: **Built and checked in desktop Chrome on 2026-11-02. Not yet checked on an Android phone or on iOS.**

## What exists

| Piece | Where | Purpose |
|---|---|---|
| Web app manifest | `src/interfaces/web/public/manifest.webmanifest` | Name, `standalone` display, theme colours, icons and two shortcuts (Import, Your data). `start_url`, `scope` and `id` are `./`, so it works under the GitHub Pages sub-folder |
| Icons | `src/interfaces/web/public/icons/` | 192 and 512 pixel icons, a 512 pixel maskable icon (Android shapes it), a 180 pixel Apple touch icon and an SVG for the tab. Regenerate the PNGs with `node scripts/generate-icons.ts` |
| Service worker | `src/interfaces/web/serviceWorker/` | Keeps the app's own files so it opens instantly and works offline. Rules in `cachePolicy.ts`, worker in `sw.ts` |
| Build step | `config/pwa.ts` | After the build, bundles the worker with the list of built files and a fingerprint of their contents. Unchanged files keep the saved copy |
| Registration and update notice | `src/interfaces/web/app/serviceWorker.ts`, `App.tsx` | Registers the worker and shows "A new version of FolioDash is ready. Reload to update" |
| Check | `scripts/verify-pwa.ts`, run by `npm run verify` after the build | Manifest fields, icon files and sizes, a maskable icon, a worker that lists every built file, and the page's manifest and icon links |

## Privacy and safety rules

- The worker handles only the app's own files, fetched with GET, from inside its own folder. Google's APIs and sign-in are never intercepted or stored, so no statement, ledger or token reaches a cache (tested in `cachePolicy.test.ts`).
- A new version waits until the person chooses to reload, so a page is never swapped during an import or a save.
- The saved copy of the ledger on the device is unchanged: it is still the separate, validated device copy (FD-018), not part of this cache.

## What Chrome needs for an installable app and a WebAPK

HTTPS (GitHub Pages gives it), a manifest with a name, a `start_url`, a `standalone` display and 192 and 512 pixel icons, and a service worker. When all hold, Chrome on Android offers "Install app" and builds a WebAPK, which shows as a real app with its own icon. No Play Store listing or Digital Asset Links file is needed for that; those are only for a Trusted Web Activity published to the store.

## Verified, and not

- **Checked:** the files and the build (`npm run verify`); in a clean desktop Chrome the worker installs, takes control, caches the whole app, and with the server stopped the app still opens and renders.
- **Not checked:** the install prompt and WebAPK on a real Android phone; Google sign-in from inside an installed app window (the pop-up flow may behave differently there); how it looks on an iPhone home screen (Safari only offers "Add to Home Screen"); the update notice on a live deployment.

## Caveats

- The OAuth origin is unchanged: an installed app runs on the same `https://albidr.github.io` origin, so no new authorised origin is needed.
- Because the app shell is cached, a visitor sees a new deployment only after the new worker has installed and they reload. The notice makes that visible.

## Mobile interface

The phone layout uses a bottom navigation bar with reserved content space and safe-area padding. The viewport opts into edge-to-edge rendering and asks supporting Android browsers to resize content for the keyboard. Actual keyboard and system gesture behaviour still needs a physical-device check.

- Header titles wrap, privacy remains a labelled 48px control, and chart ranges occupy their own full-width row.
- Dashboard period results use two columns where space permits and one on narrow phones. Holdings become named summaries with value and gain, linking to each fund; the desktop table is retained at larger widths.
- Month by month opens with a statement selector and per-month portfolio/fund summaries on phones. Complete matrices remain available in an expandable, independently scrollable comparison section, expanded initially on larger screens.
- Line charts measure their containers with a cleaned-up ResizeObserver, draw at the actual width, reduce date tick density and keep a 240px drawing height on narrow screens. A labelled date slider provides an alternative to scrubbing the plot and works with keyboard controls. Resizing changes presentation, never observations or financial bounds.
- Forms use full-width inputs, 16px input text, larger action/choice targets and scroll clearance above navigation. Wide review tables scroll within their own boundaries.
- Route changes update the page title, return to the top and move focus to the main landmark. A skip link is available for keyboard navigation. Reduced motion follows the existing global preference.

Local verification uses invented demo portfolios in headless desktop Chrome with touch emulation and several viewport sizes. This verifies layout and browser interactions; it does not establish physical Android/WebAPK, iOS, Google OAuth, or live-save behaviour. Before accepting an Android release, check an installed copy with the on-screen keyboard open, gesture navigation, larger system text, file selection and Google sign-in.

Local mobile pass, 2026-11-03:

| Check | Result |
| --- | --- |
| Portfolio, months, single import, history import and Your data at 320, 390, 430, 844 and 1440 CSS pixels, with the twelve-fund synthetic portfolio | PASS: no page-level horizontal overflow; wide tables retain their own scroll area |
| Visible buttons, navigation, segmented links, selects and non-choice inputs at phone widths | PASS: measured heights at least 48 CSS pixels |
| Line chart after resize | PASS: drawing width follows container, height at least 240px on phones; observations remain rendered |
| Month selection and chart date slider | PASS: selection updates the displayed month/date; individual fund navigation renders its chart |
| Import at 390 by 450 CSS pixels | PASS: no page overflow and navigation remains within the viewport; a short viewport is not a real-keyboard test |
| Portfolio, months, import and Your data with root text doubled at 390px | PASS: no page-level horizontal overflow; actual Android font scaling remains NOT RUN |

The prior manual-entry interaction checks (draft preservation, remove/undo, review/backtracking and cash-answer retention) are rerun after the mobile styles. Financial and chart geometry coverage is part of `npm run verify`; viewport checks are local browser evidence, not part of that CI command.
