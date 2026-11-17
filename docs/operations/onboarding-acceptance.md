# Synthetic onboarding acceptance

Status: **Local acceptance build and generated fixtures implemented on 2026-11-04. The synthetic Google create/save/read-back/replay flow passed from the Android emulator. Emulator checks are recorded below; physical Android and WebAPK packaging are separate gates.**

## Isolation before Google access

The ordinary app searches the Google account for its existing FolioDash workbook. An incognito window or fresh device alone does not isolate a synthetic test from that workbook.

Use the dedicated local acceptance build when a separate test account is unavailable. It shares the production parser, financial kernel, session and Google API paths, with explicit differences at the composition boundary:

- Google discovery and creation use title `FolioDash SYNTHETIC ACCEPTANCE` and app-property key `foliodash-synthetic-acceptance` instead of the ordinary workbook identity. The fallback name search is also isolated. Restoration preserves this identity.
- The ledger cache uses `foliodash.synthetic-acceptance.ledger.v1`, so it does not load, replace or clear the normal portfolio cache.
- A visible synthetic-acceptance banner identifies the build. The normal build disables this mode at compile time; `verify:pwa` rejects synthetic identity/cache markers in production JavaScript.
- The existing public OAuth client ID and `drive.file` permission are reused. There is no new OAuth client, secret, scope, deployment or public test-data endpoint. Workbook selection is an application safeguard, not a new OAuth security boundary: the existing client retains the Google permissions previously granted to it.

Tests cover distinct workbook discovery, creation, name fallback, session connection and cache clearing/corruption with an ordinary workbook/cache already present. They use invented data and a stand-in for Google. They do not establish live provider behavior.

## Prepare the local run

```sh
npm run build:fixtures
npm run build:acceptance
npm run preview:acceptance
```

The preview is local at `http://localhost:4173/`. Supply the existing public Google client ID through `VITE_GOOGLE_CLIENT_ID` when building, or through the existing Advanced setup in Your data. The origin must already be authorized for that client. Do not create keys, change consent/scopes or publish the app to make a check pass.

Fixtures are generated under ignored `dist/acceptance/onboarding/`, outside the production `dist/web/` artifact. They contain invented holdings and identifiers from the existing synthetic test fixtures. No real financial file is read. XLSX entries use DEFLATE compression so the device exercises the real decompression path.

| Selection | Purpose |
|---|---|
| `individual/` (three XLSX files) | Actual Android multiple-file selection and three-month import |
| `combined/synthetic-history.xlsx` | One workbook with three dated statements deliberately out of order and a Notes sheet |
| `validation/synthetic-missing-date.xlsx` | February needs an explicit date; the November container date must not be used |
| `validation/synthetic-duplicate-month.xlsx` | Two January dates must block review until one is excluded |
| `validation/synthetic-invalid-formula.xlsx` | A formula-bearing statement must be refused |
| `expected-results.json` | Invented inputs and independent expected totals |

For a connected Android emulator, reverse local port 4173 and transfer only this generated directory into a clearly named Downloads folder. Files copied with ADB need indexing by Android's Downloads/media provider before the native picker lists them. Index only these generated files; absence from Recent is not proof that the app rejected a workbook.

## Financial and recovery acceptance

Use either the three individual files or the combined workbook for the first save; they represent the same history. Enter opening net invested of **1.000,00** for each of the two funds, then explicitly answer **No** to cash movements in February and March.

| Statement | Funds value | Net invested | Gain |
|---|---:|---:|---:|
| 2026-01-31 | 2.850,00 EUR | 2.000,00 EUR | 850,00 EUR |
| 2026-02-28 | 2.900,00 EUR | 2.000,00 EUR | 900,00 EUR |
| 2026-03-31 | 3.000,00 EUR | 2.000,00 EUR | 1.000,00 EUR |

Before saving, verify chronological order, dates, selected sheets and retained answers when moving backward. Confirm that Google connection does not navigate away from the review. If Google requests credentials or fresh permissions, the owner completes or explicitly approves that step; never collect credentials in the chat or logs.

After explicit confirmation, require all three saves to be acknowledged and read back. Reload and synchronize; the three months, figures and stored sources must remain intact. Run Check my history in Your data. Re-select the equivalent input format and verify that recorded months cannot be duplicated. Check an offline reload, reconnect and a read from another supported device before claiming cross-device support. A forced network interruption must be reconciled through Check what happened before resuming; never retry an uncertain financial write merely to finish a test.

Do not delete or alter an existing workbook, revoke access, change sharing, or clear a real device copy during cleanup. Test-workbook deletion is a separate explicit action. Keep account emails, workbook IDs, tokens, real screenshots and private exports out of repository evidence.

## Evidence ledger

Observed environment: Android Emulator running Android 16 / API 36, Chrome 133.0.6943.137. The browser runs the production-compiled local acceptance build through ADB port reversal. This is an actual Android runtime in an emulator, not a physical device.

| Check | Result |
|---|---|
| Fixture generation and deterministic interpretation/financial expectations | PASS in automated tests |
| Acceptance identity/cache isolation with an ordinary workbook already present | PASS against the in-memory Google stand-in |
| Combined workbook selected through Android's native Documents picker | PASS: three dates proposed, Notes explicitly excluded, no preflight errors or page overflow |
| Multiple-file selection through the native picker | PASS: three compressed XLSX exports selected together, independently dated and parsed without errors or overflow |
| Opening amounts and cash review on Android | PASS: Android keyboard accepted Italian amounts; opening values and explicit No-movement answers reached final confirmation with zero saves and no page overflow |
| Google sign-in from the emulator | PASS after owner sign-in; subsequent account selection reused existing consent |
| Synthetic workbook discovery/creation, save and read-back | PASS: synthetic discovery and creation returned HTTP 200; three ledger append calls returned HTTP 200; three months read back with expected values and invested amounts |
| Reload, Google synchronization and source-replay health check | PASS: three months retained after reload, explicit sync reported healthy, and 3 of 3 months rebuilt exactly from saved sources |
| Equivalent combined workbook after saving individual exports | PASS: recorded months blocked review; exactly three successful ledger append calls in the run |
| Offline reload | PASS: Android Chrome reported offline, loaded the cached app and retained all three synthetic months; network access restored afterwards |
| Physical phone, installed WebAPK and live HTTPS-origin behavior | NOT RUN |

The localhost run does not prove that Chrome's WebAPK service can package or update an app from the intended deployment origin. No cloud publication is authorized or performed by this procedure.

## Defect found by the live proof

The first save failed before committing because the import preparer returned parser fund objects with extra exact-decimal fields containing BigInt values. Structural TypeScript compatibility did not remove those fields. The strict canonical JSON writer correctly refused them. Read-only command-outcome checks confirmed that the statement was not recorded; the write was not blindly retried.

The preparer now explicitly maps each fund to its public review fields (`isin`, `name`, `marketValue`). Exact source cells are still retained separately. Canonical JSON validation and financial calculations are unchanged. A regression test takes generated compressed Excel files through the real direct-commit/checksum/source-storage path and validates all three read-back sources against the Google stand-in. The corrected build then passed the live three-month Google flow described above.

Live API evidence retained only sanitized operation/status metadata: discovery used the synthetic identity, creation used the synthetic title, one workbook was addressed, three append calls succeeded and no HTTP failures were observed in the successful run. Tokens, account details, workbook IDs and raw request/response bodies were not retained in repository evidence. The ordinary portfolio cache was absent throughout this emulator run. This is one-account local-origin evidence, not a two-account isolation or simultaneous-write guarantee.

## Fresh account with manual November values, 2026-11-15

The owner's priority journey is a person discovering the published site with no FolioDash workbook and no device copy, connecting Google, and entering their first November 2026 statement manually. Excel history is optional. A successful first-month baseline must not require previous monthly statements, an existing workbook, Apps Script setup or manually created ledger tabs.

The automated session regression in `src/interfaces/web/app/session/session-suites/starting-and-device-copy.test.ts` takes the actual manual statement preparer through first connection, workbook creation, direct commit and a fresh-device read. Invented inputs are two funds valued at 1.300,00 and 900,00 EUR on 2026-11-15, with explicitly supplied opening net invested of 1.000,00 EUR each. It asserts one workbook, one saved statement, 2.200,00 EUR total value, preserved opening balances, a hidden ledger, a visible readable view and identical remote history on the second device with an empty cache. A second connection must reuse the workbook. This uses FakeGoogle; it does not prove deployed Google consent, API behavior, real-account isolation or rendered manual-entry usability.

Live acceptance for the exact scenario:

1. Use a separate Google test account that has never connected to FolioDash, in a fresh browser profile. Open the public site, choose Continue with Google and complete Google's own consent screen. No credentials are entered into FolioDash. Record whether access is permitted without developer/test-user setup.
2. Confirm the app opens Update your portfolio with an empty personal history. Choose Enter manually. Use valuation date 2026-11-15 and invented funds/values only; no real account or financial records belong in public evidence.
3. Continue to movements and review. For the first statement, supply net invested **as of that valuation date**, separately from market value. This is a starting balance, not a new contribution made on that date. Do not guess it from the valuation. Missing opening amounts must prevent confirmation.
4. Confirm once. Require an acknowledged save, a matching portfolio baseline and exactly one new FolioDash workbook in that test account. The workbook must contain its hidden technical ledger and readable portfolio view. A manually entered statement has no attached bank-source document; that limitation must not imply the financial record failed to save.
5. Reload, sync and check the date, both funds, 2.200,00 EUR value and 2.000,00 EUR net invested. Open a second fresh profile and reconnect the same test account; require the same workbook and values with no new workbook or duplicate statement.
6. With only a first valuation, period-to-period performance has no previous observation. An unavailable monthly return is expected; fabricated historical points or a false return are failures. Add a later statement only as a separately reviewed test.
7. Review denial, closed sign-in and lost-acknowledgement handling without blindly repeating an uncertain financial save. Preserve the entered review and use the original-command outcome check.

Current evidence: the manual November session regression passed locally with the existing 69 session tests. The earlier Android-emulator live Excel proof remains evidence only for its named local-origin/account/Excel route. Fresh-account consent and this exact manual journey from the deployed origin remain pending until observed. The browser plugin connection was unavailable in this session, so owner-observed steps must be distinguished from direct automated browser evidence. Do not record account details, tokens or workbook IDs in this document.


### Account-switch defect found during the fresh-account check

On 2026-11-15 the owner reported that Use a different Google account still displayed the original statements after sign-in. Source inspection confirmed that this action opened the chooser but then called refresh against the former workbook, retaining the former device copy on failure. This observation blocks acceptance of the fresh-account manual journey; the previous passing synthetic first-save test did not exercise account switching.

The explicit switch now clears the prior portfolio/expense copies, remembered access and account hint, invalidates older reads/sign-ins, cancels queued derived views and announces the reset to other windows before opening the chooser. It then discovers or creates the selected account's workbook. Cancelling the chooser leaves the old data hidden. This clears device state without deleting either workbook or revoking the old account's Google grant. Ordinary Reconnect with Google retains the existing workbook/copy on cancellation as before.

An explicit chooser cannot reuse an already-running quiet sign-in token. If that request is still active, the chooser fails without accepting its result; the person can retry when it finishes. A financial operation suspended before submission checks the account generation again and submits nothing if the account changed. Already-submitted writes retain their unknown-outcome handling.

Synthetic regressions cover two separately routed Google accounts, an old workbook shared with the new account, no requests to the old workbook under the new token, cleared portfolio and expense caches before sign-in, cancellation, delayed old-account refresh, prevention of a suspended old-account save and refusal to reuse a quiet sign-in for the chooser. These tests replace an earlier misleading account-switch test that used the same account/token/workbook throughout. The fresh-account live check must be repeated on the deployed fix; the owner's report is direct live evidence of the defect, not yet of its resolution.

Local verification of the account-switch correction: `npm run verify` passed all 903 tests in 72 files, all TypeScript targets, strict lint, policy checks and web/PWA/Apps Script builds. The production-renderer audit passed 43 journey assertions and 553 control samples; it does not exercise real signed-in account switching. Dependency audit reported zero vulnerabilities. The corrected live fresh-account/manual journey remains pending owner confirmation.

### Fresh-account observation and manual removal wording, 2026-11-15

After deployment of the account-switch correction, the owner reported Statements saved: 0, Last checked against Google: just now, and Healthy: every record passed its checks on the fresh account. This is owner-observed live evidence of the corrected connection/empty-history state. The first manual save and reload remain pending.

Before continuing the manual entry, the owner found Not held on this date confusing on a newly added fund. New rows now use a secondary Remove fund action: it removes only that draft row, with a notice saying nothing has been saved and an Undo removal action. A previously recorded holding instead uses Mark as no longer held, with a linked explanation that a full sale/proceeds review follows before saving. Its notice explicitly preserves saved history. Accessible action names identify the fund. Both actions retain the existing draft-only removal and explicit financial review; no sale or history change is inferred by removing a row.

The revised action inherits shared hover/focus/press/release feedback; row arrival, the animated removal notice and undo/restoration feedback use the existing motion system and reduced-motion handling. Rendered assertions cover the new-row label, absence of sale wording in its removal notice, and restoration of the row and field focus through Undo. The known-holding rendered branch, actual screen-reader behavior and physical-device feedback remain OPEN until separately observed.

Local verification for the removal-wording refinement: `npm run verify` passed 903 tests in 72 files and all required static/build checks. The source control inventory was regenerated and reviewed. The production Chrome interaction audit passed 46 journey assertions and 553 control samples across 18 states, including the new draft-removal/undo checks. These are synthetic renderer checks, not a completed live first-save journey.


### Direct live inspection and history explanation follow-up, 2026-11-15

After restoring the built-in Browser connection, direct read-only inspection of the deployed app and linked Google workbook confirmed one saved statement dated 2026-11-01, the two expected synthetic funds, 2.200,00 EUR fund value, 2.000,00 EUR net invested and 200,00 EUR gain. This is the date actually entered by the owner, rather than the 2026-11-15 example above. The visible FolioDash view and hidden _FolioDash ledger were present; Google reported the workbook saved and private. A temporary XLSX export outside the repository passed the canonical ledger parser/checksums with one META, SNAPSHOT, TIMELINE and COMMIT record, zero trailing rows and no source records. App update/reload followed by a fresh Google check retained the same figures and healthy ledger status. No financial records or sharing settings were edited. The cropped synthetic view and export stayed outside the repository; account details and workbook IDs are excluded from evidence.

Check my history correctly found no bank source to replay but incorrectly described the missing document only as an old-entry/restoration case. The UI now explains that manual entries also have no attached bank document. A source-free valid ledger says Saved records are valid and explains the replay limit, without a misleading zero-of-one replay headline. Mixed histories retain their replay coverage and genuine source mismatches/unreadable documents remain failures. Existing records do not encode why a source is absent, so the message lists possible reasons rather than inventing manual-entry provenance.

The history-check pipeline now joins simultaneous checks into one in-flight read/replay, discards results if the account/workbook changed and fetches again on a later explicit check. Failures clear the in-flight operation; no result cache, write retry, extra scope or storage migration is introduced. Session regressions verify shared-request identity, one instead of two concurrent ledger reads, a new read on the next check and rejection of a delayed old-account result. The pure financial and replay rules are unchanged.

Local verification of the combined history explanation, history-check pipeline and money-review refinement: `npm run verify` passed 907 tests in 72 files plus all static/build gates. Workflow validation passed actionlint 1.7.12 across all six workflows. The regenerated source inventory classifies 166 control templates. The production Chrome audit passed 56 journey assertions and 596 control samples across 20 states. The dependency audit reported zero vulnerabilities. Provider reads, source integrity checks, canonical replay and explicit save/reconciliation rules remain enabled; no live financial record was modified by these checks.
