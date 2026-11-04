<img src="src/interfaces/web/public/icons/icon.svg" width="64" height="64" alt="" />

# FolioDash

Your fund portfolio and the everyday cost of work, in one responsive web application backed by your own Google spreadsheet.

**In active development.** Local workflows are implemented, and a synthetic Google portfolio flow has been exercised. Full release and physical-device acceptance remain pending.

[Try locally](#try-locally) · [Capabilities](#capabilities) · [Data and privacy](#data-and-privacy) · [Development](#development) · [Documentation](#documentation)

## Try locally

Use Node.js **22.18.0 or newer** and npm. CI checks Node 22 and 24.

```sh
git clone https://github.com/AlbiDR/FolioDash.git
cd FolioDash
npm ci --ignore-scripts
npm run dev
```

Open the URL printed by Vite. Portfolio and Expenses start with invented records; no Google setup is needed. Demo expense edits reset on reload. The interface uses English labels and Italian/EUR number formatting.

Mac and Android are the intended platforms; the [PWA guide](docs/operations/pwa.md) records installation evidence and remaining device checks.

For Google access, use an existing public OAuth client ID with the local origin authorised. Enter it under **Your data > Advanced: Google client ID**, or supply `VITE_GOOGLE_CLIENT_ID` when starting or building the app. See [Repository configuration](docs/operations/repository-configuration.md) for hosted configuration.

For provider tests, follow the isolated [synthetic onboarding procedure](docs/operations/onboarding-acceptance.md). Ordinary sign-in can reconnect an existing FolioDash workbook.

## Capabilities

| Journey | Current implementation |
|---|---|
| Portfolio | Value, net invested and gain; allocation and history charts; individual funds and month-by-month detail |
| Import | Supported Fideuram XLSX exports, separately or in a workbook with a statement per sheet. Review dates, holdings and cash movements, then confirm. Manual entry is also available |
| Expenses | Five fields for outbound commute, lunch, inbound commute, dinner and other expenses; daily, weekly, monthly and annual reports with retained corrections. Works without a portfolio import |
| Your data | Google connection, source-replay health checks, device recovery and expense backup/restore |

Imports append **one statement per calendar month**, in chronological order. Other bank layouts and earlier-history insertion are unsupported. Files are parsed locally; confirmed saves retain extracted statements and reviewed cash decisions in the private workbook. A history import saves statement by statement, preserving confirmed saves if interrupted. See [Excel history](docs/operations/importing-history.md).

Expense entry covers today and earlier Monday-Friday workdays, using a separate log in the same workbook. Complete expense correction-history backup and confirmed restoration into a never-initialised expense store are implemented. **Portfolio JSON export is not implemented**, and portfolio device recovery omits original statements. See [Work expenses](docs/operations/work-expenses.md) for definitions and recovery limits.

### Evidence and remaining gates

| Area | Recorded evidence | Still pending |
|---|---|---|
| Local application | Automated verification; local production UI checks recorded for [dashboard](docs/design/dashboard-coherence.md) and [expenses](docs/operations/work-expenses.md) | Complete browser and accessibility acceptance |
| Google portfolio flow | [One-account synthetic create, save, read-back and source replay](docs/operations/onboarding-acceptance.md) from an Android emulator at a local origin | Deployed-origin, two-account and simultaneous-device proof |
| Work expenses | [Storage/session tests and local Chrome interactions](docs/operations/work-expenses.md) | Live Google expense writes, physical devices and screen-reader review |
| Installation and hosting | [Desktop Chrome PWA checks](docs/operations/pwa.md); [existing Pages deployment](docs/operations/github-actions.md) | Physical Android/WebAPK installation and complete release acceptance |

## Data and privacy

FD-017 selects direct browser-to-Google access with user authorisation and `drive.file`. GitHub holds source and deployment configuration; the private Google workbook holds committed records. Apps Script code and its manual deployment workflow remain pending replacement acceptance. See the [Google-backed architecture](docs/architecture/google-sheets-backend.md) and later [decision amendments](docs/architecture/decision-register.md).

The workbook is authoritative. Plain device copies support faster reads and offline viewing. Signing out or choosing **Forget this device** clears local records without deleting the workbook. Financial saves require a Google connection; uncertain outcomes are checked before continuing. Device copies and Google-readable records do not provide FolioDash end-to-end encryption.

One pure kernel calculates with exact EUR cents. Under `legacy-parity-v1`, year to date starts at the January statement. Percentages that depend on cash timing are estimates; no returns are annualised, time-weighted or money-weighted. See [FD-007](docs/architecture/decision-register.md#fd-007-financial-policy-questions).

Keep real financial files, account identifiers, private screenshots, backups and credentials outside the repository, fixtures, logs and builds. GitHub secrets serve deployment/CI. Original-file archival, retention duration, session/privacy review and supported-device acceptance remain open.

## Development

The current stack is TypeScript, Preact, Vite and SVG charts using `d3-array`, `d3-scale` and `d3-shape`. Financial rules and use cases stay independent of the UI framework.

```sh
npm run verify
npm run audit:dependencies
```

`verify` checks repository boundaries, contributor and punctuation policies, types, lint, tests, production/PWA output and the retained Apps Script bundle. The separate dependency audit fails on moderate or greater severity. Workflow edits also require `npm run verify:workflows`.

Pages publishes the artifact produced by CI after both Node versions pass. [GitHub Actions](docs/operations/github-actions.md) documents the pipeline and deployment guards.

For a local production preview, run `npm run build`, then `npm run preview`. The ignored web artifact is `dist/web/`.

```text
src/core/                 Pure financial values and calculations
src/applications/         Use cases, ports and typed outcomes
src/adapters/             Google, browser storage and XLSX integrations
src/interfaces/web/       App composition, features, presentation and UI
src/interfaces/server/    Retained Apps Script service
tests/                    Cross-layer tests and synthetic fixtures
config/                   Tool configuration
scripts/                  Build and verification utilities
docs/                     Architecture, decisions, design and operations
```

Read the [working agreement](AGENTS.md) and [contribution guide](.github/CONTRIBUTING.md) before changing the project. **Licensing is undecided (FD-011); external contributions cannot be accepted yet.**

## Documentation

| To understand | Read |
|---|---|
| Documentation and its authoritative owners | [Documentation map](docs/README.md) |
| Boundaries, financial invariants and repository structure | [CleanStack Architecture](docs/architecture/cleanstack.md) |
| Selected directions and unresolved decisions | [Decision register](docs/architecture/decision-register.md) |
| Accessibility, chart and release requirements | [Web quality contract](docs/operations/web-quality.md) |

The existing Google Sheets project remains separate. Open decisions and live acceptance gates retain their documented approval requirements.
