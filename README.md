# FolioDash

A private portfolio tracker designed for Mac and Android through one installable web application.

**Stage: local application with automated verification.** The repository contains the portfolio UI, pure financial kernel, synthetic tests and Google adapters. Live integration and device support still require the evidence recorded in the decision register. The existing Google Sheets application remains separate.

**Selected direction:** GitHub-managed frontend and user-owned private Google Sheets records. FD-017 selects direct browser-to-Google access; the earlier Apps Script service remains until its replacement passes live proof. The interface lives in FolioDash, not sheet dashboards; a separate database provider is not required. The browser uses Google authorisation, not a GitHub secret, for live access. Read the [Google-backed architecture](docs/architecture/google-sheets-backend.md) first for the scope and unverified connection gates.

FolioDash should turn bank statements and explicitly recorded cash movements into understandable portfolio history. Normal use must not require AI, scripts, developer tools or manual dashboard repairs.

## Start here

- [Documentation map](docs/README.md)
- [CleanStack Architecture - Authoritative Design Reference](docs/architecture/cleanstack.md)
- [GitHub + Google Sheets + Apps Script architecture](docs/architecture/google-sheets-backend.md)
- [Decision register](docs/architecture/decision-register.md)
- [Web quality and verification contract](docs/operations/web-quality.md)
- [Repository policy and checks](docs/operations/repository-policy.md)
- [Growth assessment and synthetic benchmark](docs/operations/scalability.md)

The decision register records selected tooling and later amendments as well as remaining authentication, deployment, retention and licensing questions. Implementation alone does not settle an open decision. Normal Google-readable workbook storage is not FolioDash end-to-end encryption.

## Privacy boundary

This repository holds code, design documents and synthetic fixtures only. Real statements, holdings, account identifiers, screenshots, backups and credentials do not belong here, even if the repository is private. A future public demonstration must use synthetic data and separate storage from the personal application.

The ignore rules are an accidental-inclusion guard, not a security control or permission to commit otherwise-sensitive files. Repository history and built artifacts must also be inspected before any publication.

## Implementation boundary

This documentation does not authorize creating cloud resources, uploading financial data, publishing the site, connecting bank accounts or choosing unresolved security policies. Run `npm ci --ignore-scripts`, then `npm run verify` for repository policy, contributor and punctuation policy, types, lint, tests, production build, PWA checks and the Apps Script bundle check. Run `npm run audit:dependencies` separately for the dependency security gate. Use `npm run dev` to run locally. CI runs verification on Node 22 and 24. For workflow changes, also run `npm run verify:workflows`; see the [GitHub Actions system](docs/operations/github-actions.md) for checked artifacts, triggers and deployment guards. These checks do not replace live Google, deployed-browser or physical-device verification.
