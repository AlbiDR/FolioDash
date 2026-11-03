# Lighthouse verification

Scores describe a named build, page, environment and run. A rounded 100 is not proof of full accessibility, physical Android smoothness or a functioning Google save. Do not change audit categories, throttle settings, privacy policy or reduced-motion preferences to manufacture a score.

## Baseline and changes

The live signed-out homepage on revision `4dc5a19` measured 98 Performance, 99 Accessibility, 100 Best Practices and 100 SEO in Lighthouse 13.6.0's default mobile profile. The heading-order failure was the onboarding H3 immediately following the page H1.

- Onboarding and the empty-account next-step headings now use H2, matching the actual page hierarchy.
- Import, history and account screens use on-demand modules. The XLSX reader loads when a file is selected. Startup scripts decrease from approximately 74.7 KiB gzip to 62.1 KiB across the entry and shared chunks, around 17 percent.
- Deferred screens have an accessible loading state and a readable module-download failure recovery. Main navigation remains available. Financial write errors and unknown outcomes retain their existing handling.
- The PWA build still lists every generated chunk in its cache. Browser checks confirm that unvisited import/history/account modules load offline after installation. A deliberately blocked account chunk produces recovery text, not an empty screen.
- Financial metrics, motion preferences, the signed-out demonstration and authentication/privacy boundaries are unchanged.

## Reproduction

Use the installed Lighthouse CLI with a fresh browser profile, standard simulated throttling and the production URL. Run audits sequentially without concurrent browser tests. Keep reports outside the repository; signed-in financial pages must not enter tracked artifacts.

```sh
lighthouse 'https://albidr.github.io/FolioDash/' --only-categories=performance,accessibility,best-practices,seo --chrome-flags='--headless --disable-gpu --no-first-run' --no-enable-error-reporting --output=json --output=html --output-path=/private/tmp/foliodash-lighthouse-mobile
lighthouse 'https://albidr.github.io/FolioDash/' --preset=desktop --only-categories=performance,accessibility,best-practices,seo --chrome-flags='--headless --disable-gpu --no-first-run' --no-enable-error-reporting --output=json --output=html --output-path=/private/tmp/foliodash-lighthouse-desktop
```

The Vite preview serves index.html for absent paths, including robots.txt. That produces an invalid-robots SEO finding locally; the production GitHub Pages origin returns its own root robots response. Do not add a permissive robots policy for a private application to hide a local preview artefact.

## Evidence

- `npm run verify`: 536 tests and all source/build/PWA gates pass.
- Local browser checks: manual draft/review retention, fund removal undo, chart reset with unchanged geometry, keyboard controls, mobile layouts, offline loading of every deferred route, and recovery after a blocked module pass.
- Optimized local mobile audit: Performance 100, Accessibility 100 and Best Practices 100. Preview SEO is subject to the robots response described above; local scores are not deployed evidence.
- Production revision `fc64a54` deployed successfully in GitHub Actions run `41735641628`. The served entry script was fetched directly and checked for that revision before measurement. Full Lighthouse 13.6.0 audits then ran sequentially against the signed-out production homepage with default simulated throttling and no concurrent browser tests.

## Production results

| Run | Performance | Accessibility | Best Practices | SEO |
| --- | ---: | ---: | ---: | ---: |
| Initial optimized mobile | 98 | 100 | 100 | 100 |
| Mobile confirmation 1 | 98 | 100 | 100 | 100 |
| Mobile confirmation 2 | 100 | 100 | 100 | 100 |
| Mobile confirmation 3 | 100 | 100 | 100 | 100 |
| Desktop confirmation | 100 | 100 | 100 | 100 |

The target of 100 in all four categories was observed on both device profiles. The full series is retained here: mobile Performance varied from 98 to 100, so this is not a guarantee that every later run scores 100. The mobile confirmation series measured first contentful paint of 1.3s, 0.8s and 1.1s, with Speed Index 3.8s, 0.8s and 1.1s respectively. It reported no run warnings. A performance-only diagnostic also reached 100, but is excluded from the full-category evidence above.

Local report files use `/private/tmp/foliodash-lighthouse-optimized-mobile.report.*` and `/private/tmp/foliodash-lighthouse-confirm-{mobile-1,mobile-2,mobile-3,desktop-1}.report.*`. These temporary reports are not tracked or required for the app. The live-provider/user-data and physical-device acceptance gates remain separate from these signed-out lab scores.
