# Web quality and verification contract

Status: **Acceptance contract; automated checks partially implemented, live acceptance incomplete**
Created: 2026-11-01  
Architecture authority: [CleanStack ADR](../architecture/cleanstack.md)  
Open decisions: [Decision register](../architecture/decision-register.md)

These are product/release requirements, not optional polish. The repository now has a local PWA, CI and tests. Individual requirements still need their named evidence; implementation does not imply full acceptance.

FD-013 selects GitHub frontend delivery with user-owned private Google Sheets and an Apps Script service. [Google-backed architecture](../architecture/google-sheets-backend.md) owns its storage/transport protocol and FD-014 proof gates; a separate database is not assumed. A GitHub secret cannot supply private browser-runtime access. Live browser-to-Google feasibility is NOT RUN.

## 1. User-facing journeys

| Journey | Required behaviour | Evidence before support is claimed |
|---|---|---|
| Start with no history | Explain the first import; no empty broken charts or manual bootstrap scripts | Synthetic fresh-account browser journey |
| Connect a Google workbook | Authenticate, prove authorised caller/workbook binding and explain scopes; no shared secret or public-sheet step | Real OAuth/API executable test from the deployed origin with two Google accounts |
| Import a statement | Select XLSX, review date/funds/flows, confirm once; show progress and clear saved state | Real file picker on Mac and Android plus synthetic browser integration |
| Start with existing history | Select multiple supported bank Excel exports or a workbook with a statement per sheet; review dates and cash decisions in order, then confirm the complete selection. Surface duplicate months, invalid and unrecognized sheets before writing; retain confirmed progress and reconcile uncertain saves | [Excel history implementation and local evidence](importing-history.md); real Mac/Android file picker and synthetic Google save/recovery journey remain required |
| Repeat a file/date | Explain already-recorded versus revised content; never duplicate movements | Concurrent API/commit tests and UI journey |
| View portfolio | Opening KPIs and chart values agree with the same committed revision | Independent expected-value and real chart tests |
| Select a fund | Name-based selection; ISIN accessible; only that view updates | Keyboard/touch journey and measured selection latency |
| Add/close/reopen | Preserve history; require explicit lifecycle and cash facts | Kernel cases and full import journeys |
| Any portfolio, any change | Views are generated from the committed funds, never from a fixed list, column, colour or count. Zero, one or many funds, funds added, closed, reopened, or a completely different set (another person's portfolio) all render correctly, with series and labels from data | Synthetic portfolios of differing size and composition, and a month-to-month change of the whole fund set, through the import journey and real chart tests |
| Correct a statement | Preview affected history, preserve prior revision, report save outcome | Replay/transaction tests and UI recovery journey |
| Use a second device | Confirmed Mac import appears on Android after synchronisation | Deployed two-device synthetic-account test |
| Refresh Google history | Show the latest committed workbook revision on defined refresh/focus events; do not silently accept unreviewed bank-tab edits | Racing-commit/read and manual-source-change tests |
| Lose connection | Retain review; distinguish offline cached view from saved/unsaved state | Browser/network failure injection |
| Export and restore | Complete portable history; declared omissions; validated recoverable restoration | Round-trip plus damaged/incompatible backup tests |
| Sign out/switch account | No previous account's data or cached chart remains accessible | Two-account cache, API and UI isolation tests |
| Install/update | App opens coherently; update never destroys an unsaved import. On Android, Chrome installs a qualifying PWA as a WebAPK (its own icon, standalone window and app-drawer entry); that behaviour is part of the journey | Actual supported Mac/Android install and update journey, including the Android WebAPK install on a real device |

Normal success does not require opening an editor, calling AI, running a repair script or finding a maintenance submenu. Recovery actions may exist but must not be routine completion steps.

## 2. Visual system and information hierarchy

- One semantic token source owns typography, spacing, colours, radii, motion and chart series styling. No local raw visual constants when an existing token fits.
- Owner direction, 2026-11-04: design every new or changed user journey with clear data presentation, purposeful interactions and microanimations as part of the feature. Use the shared [interaction system](interactions.md), preserve immediate financial values and truthful save feedback, and retain all meaning and functionality with reduced motion. Journey clarity and motion are acceptance requirements from the start of design.
- Keep a consistent outer inset, alignment anchors, section rhythm, numerical alignment and precision. There is no spreadsheet-style 25px row/column mechanism in the PWA.
- Lead with useful portfolio/fund KPIs. Keep technical provenance and audit details accessible without turning the main dashboard into a diagnostics panel.
- Use navy/blue for structure, neutral styles for value/capital/allocation, and signed labels for gains/losses. Do not communicate performance by colour alone.
- Use names for fund selection and stable ISIN identity underneath. Never require memorising identifiers.
- Default copy is English with Italian/EUR formatting. One label has one meaning; definitions are shared rather than rewritten per view.
- Unavailable results show a clear dash with a discoverable reason, not false zero or an apparently broken empty metric.
- Buttons name actions: Import statement, Confirm import, Save correction, Restore backup. Avoid generic OK for meaningful financial changes.
- Use one accessible custom SVG icon primitive; no decorative emoji or third-party icon library by default. Necessary data libraries are separately evaluated.

## 3. Chart contract

- Charts use the same committed revision and calculation policy as their tables. The renderer does not calculate financial metrics.
- All relevant plotted series inform bounds. Null/unknown values stay gaps; real zero remains plotted. A first/single valid point must still be visible.
- Time spacing reflects actual observation dates. Labels remain readable at mobile widths without silently implying month-end dates.
- Auto bounds use a named, tested spread-padding policy with flat/zero/negative/finite safeguards. Padding policy is presentation, not financial methodology.
- Show units, dates, scale and series identity clearly. Tighter axes improve detail, not numerical accuracy. Individual fund slopes on independently scaled axes are not return rankings.
- Net invested and value remain distinguishable by labels plus non-colour styling where supported. Do not claim a dashed line from a configuration test without verifying it in the actual renderer.
- Comparison shows all selected funds on a common scale, retaining separate reopening episodes. Do not join unavailable periods or unrelated holding episodes.
- Container dimensions adapt to the viewport/content; avoid fixed spreadsheet-cell footprints or a custom plot margin that clips labels. Resize observers/listeners have explicit cleanup.
- A chart failure keeps readable financial tables and an actionable message. A chart failure after a confirmed import must not invite reimport.
- Test actual production renderer output, series values, axis bounds, labels and resize/selection behaviour. A hand-drawn SVG approximation is design evidence only.

## 4. Accessibility and responsive behaviour

- One main landmark and one level-one heading; clear navigation and a keyboard-visible skip link.
- All core workflows are keyboard-complete, with labelled controls, visible focus and predictable focus restoration.
- Touch targets use a consistent minimum 48 by 48 CSS-pixel hit area. Dense visual glyphs may be smaller inside that area.
- At a 320 CSS-pixel viewport and 200% text resizing, no required control, metric or error is clipped. A genuinely wide table may scroll inside an explicitly labelled region; the whole page must not require horizontal scrolling.
- Respect reduced motion and forced-colours preferences. Hover-only hints cannot be the sole path to information.
- Accessible numerical tables/text alternatives accompany charts; tooltips work for touch/keyboard where applicable.
- Apply WCAG AA contrast and readable focus treatment. Automated accessibility tests do not replace screen-reader, touch and wording review.
- Browser automation should cover Chromium, WebKit and Firefox. Actual support claims name tested versions/devices through FD-012; simulated Android dimensions are not a physical Android check.

## 5. Error and progress taxonomy

Errors are typed by meaning: unsupported/invalid file, inconsistent evidence, missing financial input, authentication expiry, ownership denial, duplicate import, stale review, known-not-committed failure, uncertain commit outcome, saved-but-view-failed, corrupted backup and incompatible version.

Each error:

- Appears in the workflow where it occurred and preserves entered values when safe.
- Says whether data was saved, not saved or still being reconciled.
- Offers a safe primary recovery action and full wrapping/selectable, redacted diagnostic text.
- Never hides a full message behind truncation, an auto-disappearing toast or only an OK button.
- Never offers blind retry for an unresolved financial commit.

Progress exposes genuine phases: reading file, validating, reviewing, saving, checking outcome and synchronising. Do not fabricate percentages or show success while a write is merely queued. Dialogs are for file selection, meaningful review, account transitions or destructive decisions, not a chain of one-value prompts.

## 6. Performance and measurement

Initial design targets, **not measured results**:

- Local actions acknowledge input within 100ms under the named reference conditions.
- Operations lasting over 1 second expose phase/status and keep the interface responsive.
- Selecting a fund does not refetch statements, reparse XLSX or recalculate every unrelated view.
- Import preparation does not repeatedly rebuild dashboards; commit refreshes the affected coherent projections.
- XLSX parsing and chart dependencies load on demand where appropriate, not on the public/login critical path.
- Cache coherent reads within their explicit lifetime; never cache away authorisation or commit/revision checks.
- Batch Apps Script/Sheets reads and writes; no sheet formatting, resizing or spreadsheet chart construction in the service path. Measure actual API execution/consent/round-trip latency and quota failures, not just local parsing.

FD-012 must set actual reference devices, dataset sizes, network conditions, warm/cold definitions, end-to-end import/selection targets and bundle budgets before performance is accepted. Measure multiple runs and report median and tail/worst cases, including file selection, parsing, review, server confirmation and sync separately. Exclude human review time only when explicitly stated.

Local synthetic history measurements and confirmed bottleneck fixes are recorded in [Growth assessment](scalability.md). They do not settle FD-012 device or capacity targets.

Do not transplant another project's 55KiB asset budget or 100/100 Lighthouse claim into an XLSX/chart application. A timing from a mock adapter is not input-to-pixel or real-provider latency.

## 7. Security, caching and release integrity

- Separate application hosting, account API and optional document archive responsibilities. All data access is account-authorised at the trusted boundary, not by hidden UI controls.
- No personal financial files/fixtures, production screenshots, secrets or real account seeds enter the repository, CI, preview deployment, bundle or public demo.
- The production artifact is scanned for secret/environment leakage and unexpected third-party runtime/network dependencies.
- A tracked-root policy check enforces CleanStack section 4.3: no unapproved root files, scratch/release archives, duplicate legacy implementations or committed generated/private artifacts. Test legitimate tool exceptions as well as deliberately introduced violations; ignored local folders need a separate pre-publication privacy review. Implemented as `npm run verify:repository`; see [Repository policy](repository-policy.md) for coverage and limits.
- Apply an evaluated restrictive Content Security Policy and real deployable transport/framing/referrer protections. Do not claim a response header that the chosen host cannot serve.
- Third-party application packages are bundled/reviewed, not fetched as mutable CDN scripts at runtime. A Google-hosted identity loader, if selected under FD-005/FD-014, is an explicitly reviewed provider exception with a minimal origin/CSP allowlist; it is not permission for arbitrary CDN scripts.
- Actions secrets are deployment-only; user Google tokens and financial data never enter static builds, public configuration or workflow artifacts. Verify this in the built release, not merely in source.
- Google workbook tabs are not tenant security boundaries. Verify actual Google caller identity/access and reject cross-account or tampered-workbook requests. Hidden/protected tabs and a private repository are not substitutes.
- Prove the external browser authentication/API route, logout/regrant and token expiry before declaring supported Mac/Android connectivity. Do not use `no-cors`, JSONP, anonymous owner execution or a published sheet to bypass failures.
- Never put tokens or private data into URLs, analytics, public metadata or a generic service-worker response cache. Session storage/cookies are chosen under FD-005, not copied from Spotify's token policy.
- Device caches are explicitly account-scoped; logout and account switching purge the prior account's records. Offline retention and revocation limits are disclosed.
- Update/install failure preserves the usable current version or offers a clear recovery path; no forced update discards reviewed input.
- Verify the exact released revision and compatibility of client, server and schemas. Stale assets or a generic HTTP 200 do not prove a deployment succeeded.
- Required checks run before deployment; deployment verifies the exact checked artifact/revision. Least-privilege CI, controlled migrations, locked dependencies and immutable third-party action references are part of that design.
- A public synthetic demo and private personal app must have separate data/auth/cache boundaries. Do not enable indexing or social previews for private portfolio content.

### Public link preview

The public application entry point at `https://albidr.github.io/FolioDash/` exposes static Open Graph and large-image Twitter card metadata. The shared card describes FolioDash only; it never reflects the signed-in account, workbook, current route, holdings or expenses. Crawlers can fetch the product artwork without authentication or JavaScript. This does not enable previews of private portfolio content.

Artwork lives in `src/interfaces/web/public/social/`: `preview.svg` is the editable design and `preview.png` is the 1200 by 630 delivery image. To regenerate the PNG, open the SVG in headless Chrome with `--hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --screenshot=<absolute output path>` and its absolute `file://` input URL. Inspect the resulting image before committing it. The palette and rising-line motif follow the existing product icon. No financial screenshot or customer data is used.

`npm run verify` builds the card into the checked application and `verify:pwa` checks static metadata, the absolute Pages image URL, PNG integrity and dimensions. Existing Pages composition preserves those checked bytes. A future domain change must update the canonical URL, social URLs and their verification together. These checks prove the release files; fetching by a particular messaging service and the resulting preview still require a real share after deployment. Existing messages may retain a cached preview. The GitHub repository's own link preview is a separate repository setting.

## 8. Evidence and release gate

Each requirement is tracked with a method and one of PASS, FAIL, BLOCKED or NOT RUN. A proposed script name, test count, screenshot or performance target is not a passing gate.

The initial implementation must provide checks for dependency boundaries, types if used, lint, kernel examples/properties, parser contracts, transactional/idempotency/concurrency behaviour, two-account authorisation, redaction/artifact policy, production builds, browser journeys, actual chart rendering, cache/update lifecycle, export/restore and deployed Mac/Android acceptance.

The implemented local/CI command is `npm run verify`; dependency security uses `npm run audit:dependencies`. These cover a subset of the categories above. Unimplemented or manual gates remain NOT RUN or BLOCKED until their own evidence exists.

Required report shape:

```text
Revision / build:
Capability and requirement:
Environment / devices / dataset (synthetic):
Method and reproducible command or manual steps:
Result: PASS | FAIL | BLOCKED | NOT RUN
Evidence:
Known limits and remaining gates:
```

A failed required gate blocks release. Manual checks stay pending until performed. A fix should include its confirmed cause or clearly labelled hypothesis, the corrective change, prevention for the failure class and a regression test that can actually fail when the defect is reintroduced.
