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
