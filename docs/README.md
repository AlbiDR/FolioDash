# Documentation map

Each rule has one authoritative home. Other documents link to that home rather than maintain competing definitions.

| Document | Owns | Status |
|---|---|---|
| [CleanStack Architecture](architecture/cleanstack.md) | Product boundaries, dependency law, financial/data invariants, safety and governance | Draft for owner review |
| [Google-backed architecture](architecture/google-sheets-backend.md) | Selected GitHub/Sheets/Apps Script direction, service/data boundaries, credential correction and runtime proof gates | Direction selected; protocol proposed and unverified |
| [Work expenses tracker preparation](architecture/work-expenses-tracker.md) | Original parity scope, confirmed day semantics, workbook compatibility proposal and setup/view safeguards | Followed by authorised implementation; live expense proof pending |
| [Work expenses implementation](operations/work-expenses.md) | Current tracker journey, reporting definitions, checked Google records, complete correction backup/recovery and evidence | Implemented locally; provider and physical-device acceptance pending |
| [Fideuram XLSX layout v1](architecture/fideuram-xlsx-layout.md) | Observed bank export layout, cell formats, reconciliation relations and proposed bank-adapter rules | Observed layout reference; parser and synthetic fixtures implemented, live acceptance separate |
| [Decision register](architecture/decision-register.md) | Decisions, alternatives, approval state and implementation blockers | Google-backed direction selected; implementation details open |
| [Repository configuration](operations/repository-configuration.md) | GitHub variables, secrets, environments and the historical public-release gate | Existing Pages/main restriction inspected 2026-11-05; Apps Script environment has no protection; required checks/reviews remain absent |
| [GitHub Actions](operations/github-actions.md) | Workflow dependency graph, checked artifacts, cancellation, deployment guards and maintenance | Single verification pipeline and guarded deployment implemented; evidence and remaining gates recorded with the change |
| [Google setup](operations/google-setup.md) | Owner steps in the owner's Google account, the remembered-connection design (FD-022) and its evidence | Synthetic proof performed 2026-11-01 and 2026-11-04; remembered connection implemented locally 2026-11-07 with real renewal NOT verified; publishing the consent screen is an owner step not yet taken |
| [Installable app](operations/pwa.md) | Manifest, icons, service worker, offline behaviour and what is and is not verified | Built and checked in desktop Chrome (2026-11-02); not yet checked on Android or iOS |
| [Starting from Excel history](operations/importing-history.md) | Multiple bank exports, one-statement-per-sheet workbooks, date/cash review, confirmation and interrupted-save recovery | Implemented and checked locally with synthetic files; live Google and physical-device acceptance pending |
| [Synthetic onboarding acceptance](operations/onboarding-acceptance.md) | Generated device-test files, an isolated local Google-test build, expected financial results and live/emulator evidence | Synthetic Google create/save/read-back/replay passed on Android emulator; physical-device and deployed-origin acceptance pending |
| [Mobile dashboard layout](design/mobile-dashboard.md) | Mobile card hierarchy, disclosure, readable metrics and responsive verification | Implemented locally; physical-device checks pending |
| [Dashboard coherence](design/dashboard-coherence.md) | Product narrative, progressive bento hierarchy, consistent supporting workflows and detail refinement | Implemented and checked in the local production renderer; physical-device acceptance separate |
| [Work expenses experience plan](design/work-expenses-experience.md) | Consolidated product narrative, navigation, bento composition, daily journeys, motion and implementation sequence; includes a static layout study | Design rationale retained; followed by locally implemented tracker |
| [Microanimations and interactions](operations/interactions.md) | Original 92 interaction/motion touchpoints, shared surface feedback, allocation inspection and reduced-motion verification | Implemented locally; physical Android and screen-reader verification pending |
| [Lighthouse verification](operations/lighthouse.md) | Reproducible audit settings, startup loading changes and measured evidence | Full production audits reached 100 in all four categories on mobile and desktop; mobile Performance varied 98-100 across runs |
| [Repository policy](operations/repository-policy.md) | Executable root/import rules, current content ownership, commands and enforcement limits | Implemented with deliberate violation tests; live acceptance separate |
| [Growth assessment](operations/scalability.md) | Synthetic history benchmark, measured bottlenecks, engineering changes and remaining capacity limits | Local Node measurements; browser/provider capacity unverified |
| [Dependency maintenance](operations/dependencies.md) | Security override rationale, removal conditions and dependency verification | minimatch alert patched; audit fails on moderate or greater severity |
| [Web quality contract](operations/web-quality.md) | User journeys, accessible presentation, measurement methods and release evidence | Proposed acceptance requirements |

## Authority and amendment

The CleanStack ADR is the canonical architecture proposal. Once accepted, subordinate documents and implementation must conform to it. An amendment must identify affected rules, consequences, tests and migration needs. An accepted historical decision is superseded explicitly, not silently rewritten.

FD-013 amends the initial provider-neutral draft: the user selected Google Sheets and Apps Script as the backend, with the interface managed through GitHub. The linked Google-backed architecture owns that concrete storage/transport proposal; it supersedes the earlier expectation of a separate cloud database, not the financial/safety invariants. FD-014 records the still-unverified authenticated route. This is a design amendment, not an implemented deployment.

The following are different sources of truth, not competing ones:

- Reviewed repository: implementation, schema/migration definitions and design policy.
- User's private committed ledger: confirmed financial observations and cash inputs.
- Source evidence: provenance for an observation, subject to its declared confidence.
- Calculated views and device caches: rebuildable representations, never financial authority.

## Status vocabulary

- **Draft / proposed:** recommendation, not approved or implemented.
- **Accepted:** explicitly approved decision with date and rationale.
- **Implemented:** present in reviewed source; not necessarily verified in production.
- **Verified:** a named check passed with reproducible evidence and environment.
- **Blocked / not run:** required evidence or decision is missing; never means passed.
- **Superseded:** replaced by a linked, explicit decision; historical rationale remains.

Every future check report separates deterministic tests, browser simulation, deployed integration and manual-device evidence. Do not make one category stand in for another.
