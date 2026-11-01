# FolioDash

A private portfolio tracker designed for Mac and Android through one installable web application.

**Stage: architecture draft.** No application, backend, hosting, database or deployment has been created. The existing Google Sheets application remains separate and unchanged.

**Selected direction:** GitHub-managed frontend, user-owned private Google Sheets records, and an authenticated Apps Script service. The interface lives in FolioDash, not sheet dashboards; a separate database provider is not required. The browser uses Google authorisation, not a GitHub secret, for live access. Read the [Google-backed architecture](docs/architecture/google-sheets-backend.md) first for the scope and unverified connection gates.

FolioDash should turn bank statements and explicitly recorded cash movements into understandable portfolio history. Normal use must not require AI, scripts, developer tools or manual dashboard repairs.

## Start here

- [Documentation map](docs/README.md)
- [CleanStack Architecture - Authoritative Design Reference](docs/architecture/cleanstack.md)
- [GitHub + Google Sheets + Apps Script architecture](docs/architecture/google-sheets-backend.md)
- [Decision register](docs/architecture/decision-register.md)
- [Web quality and verification contract](docs/operations/web-quality.md)

The Google-backed direction is selected; its runtime connection and controls are not yet proven. Framework, exact Google deployment/auth model, source retention, sessions and licensing remain open in the decision register. Normal Google-readable workbook storage is not FolioDash end-to-end encryption.

## Privacy boundary

This repository holds code, design documents and synthetic fixtures only. Real statements, holdings, account identifiers, screenshots, backups and credentials do not belong here, even if the repository is private. A future public demonstration must use synthetic data and separate storage from the personal application.

The ignore rules are an accidental-inclusion guard, not a security control or permission to commit otherwise-sensitive files. Repository history and built artifacts must also be inspected before any publication.

## Implementation boundary

This documentation does not authorize creating cloud resources, uploading financial data, publishing the site, connecting bank accounts or choosing unresolved security policies. There are no build or test commands yet; do not report proposed verification gates as implemented or passing.
