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
npm run fixtures:onboarding
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
