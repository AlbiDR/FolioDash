# GitHub frontend, Google Sheets records, Apps Script service

Decision IDs: **FD-013** (selected architectural direction), **FD-014** (proposed runtime connection)  
Status: **Direction selected by the owner; protocol and deployment not implemented or verified**  
Created: 2026-11-01  
Parent authority: [CleanStack Architecture](cleanstack.md)

## 1. Decision and scope

FolioDash uses GitHub for reviewed source and intended static frontend delivery, the user's private Google spreadsheet for financial records, and Google Apps Script for the application service. The dashboards, charts, review screens and navigation belong to FolioDash, not spreadsheet cells.

No independent database/server provider is required by this direction. Google Sheets and Apps Script **are the backend**; this is not a backend-free application. A standard Google Cloud configuration may still be required for OAuth/API access. No cloud resources or deployments are authorised merely by this document.

The user's direction replaces the previous assumption of an unspecified separate cloud database. Framework, exact OAuth scopes, connection/deployment ownership, source retention, support limits and operational proofs remain explicit decisions/gates.

## 2. Essential correction: GitHub secrets are not a runtime bridge

GitHub Actions secrets are available to authorised workflow jobs, not privately callable by a user's browser. Building a secret into JavaScript, HTML, JSON, a URL or a downloadable artifact exposes it to the visitor. A static site cannot keep a service-account key or universal Apps Script password confidential. GitHub Pages serves static assets; it is not an authenticated server-side proxy. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

The intended separation is:

| Item | Owner/location | Browser visibility |
|---|---|---|
| Source, tests, static UI | GitHub repository/build | Delivered frontend code is inspectable |
| Public OAuth client ID and deployment identifier | Reviewed public configuration | Expected; these are not access credentials |
| User Google access token | Short-lived authenticated browser session | Required by the authorised client; not a shared secret |
| Optional deployment credential | Restricted CI secret store | Never emitted into frontend artifacts |
| Imports, ledger and cash records | User-owned private Google workbook | Returned only through authenticated authorised access |

Actions may test/build/deploy code. They must not fetch bank data to build a dashboard, publish private exports, hold every user's Google refresh token, or serve as a per-interaction financial request queue. Workflow redaction is not a guarantee against credential leakage. [GitHub Actions security](https://docs.github.com/en/actions/reference/security/secure-use)

## 3. Logical data path

```text
GitHub source -> reviewed build -> static FolioDash PWA
                                      | user grants Google access
                                      v
                               Google authorisation
                                      |
                                      v
                        Authenticated Apps Script service
                                      |
                                      v
                      User's private Google spreadsheet
                        bank imports + committed ledger

Private financial responses return to the user's device, not to GitHub.
```

The Google identity/deployment mechanism must establish the caller independently of request fields. Every handler validates input and access to the connected workbook. A sheet ID or deployment URL is a locator, not authorisation.

### 3.1 Proposed connection to prove first

The leading candidate is a browser Google OAuth client calling an **Apps Script API executable** through the authenticated `scripts.run` API. Reads and commands both use this narrow service so the browser does not directly edit ledger ranges.

Google documents requirements for this route: an API-executable deployment, an appropriately scoped user OAuth token, a common **standard** Google Cloud project for script and OAuth client, and the Apps Script API enabled. The execution API does not support service accounts. These requirements mean connecting an arbitrary copied/bound script is not automatically sufficient. [Google execution guide](https://developers.google.com/apps-script/api/how-tos/execute)

Do not assume browser-to-Apps-Script access works merely because an authenticated command-line call succeeds. Browser-origin handling, token consent/expiry, consumer versus Workspace accounts and actual execution permissions are mandatory proof gates.

Two deployment ownership options remain open under FD-014:

- **One centrally maintained API executable:** preferred candidate for simple user onboarding. It must operate with each caller's authorised access and verified workbook binding, never a developer-owned universal financial identity. Code-delivery/operator trust remains material.
- **User-managed script deployment:** greater ownership separation but additional setup and updates; a common OAuth project requirement may make third-party onboarding impractical. Do not promise a one-click install without proving it.

Choose one before implementing connection/setup screens. Do not create both service models speculatively.

### 3.2 Routes not silently substituted

- A publicly readable `pubhtml`/CSV/JSON export is not an acceptable private financial API.
- An anonymous execute-as-owner web app protected by a password embedded in the PWA is forbidden. Google distinguishes execute-as-developer from execute-as-accessing-user, with different authority. Never forward the script owner's OAuth token to the browser. [Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- A normal `fetch()` to a protected `/exec` URL is not assumed to solve Google login, redirects or CORS. Content Service uses redirects; JSONP is inappropriate for sensitive data. No `no-cors`, JSONP, disabled browser security or public-sheet workaround may satisfy the gate. [Content Service](https://developers.google.com/apps-script/guides/content)
- `google.script.run` is not a generic API available to arbitrary GitHub-hosted pages. Serving the frontend through Apps Script HTML Service changes the hosting/sandbox/PWA architecture and requires a separate decision. [HTML Service restrictions](https://developers.google.com/apps-script/guides/html/restrictions)
- Direct Sheets API access with user OAuth is a possible read-only alternative, not an approved client-side financial-write path. It would need its own coherent-read and scope design.

If the selected route fails its live proof, report the exact limitation and revisit FD-014. Do not introduce an unapproved proxy provider or weaken the privacy boundary to make it work.

## 4. Workbook is storage, not the interface

The workbook should remain simple for a person to recognise, but **imports alone cannot recover contributions, withdrawals, opening net invested or corrections**. Those facts are not contained in valuation numbers.

Proposed minimum roles, not final tab names or a migration to run now:

| Role | Contents | Authority |
|---|---|---|
| Bank import tabs | Approved imported source representation, statement date and provenance | Evidence; not automatically confirmed financial history |
| Technical ledger | Committed valuations, opening balances, cash movements, lifecycle, corrections and command receipts | Financial source of truth |
| Technical metadata | Schema/policy version, workbook identity and revision/index information | Supporting state; never enough to reconstruct missing history |

No dashboard/chart/helper-table tabs are required for the new interface. Hidden/protected technical tabs reduce accidents; they are not a security barrier against workbook owners/editors. Missing or corrupt ledger data stops financial writes; the service must not silently reinitialise it from current bank values.

Existing legacy `_Portfolio Ledger` records may be migration input. New technical names and schema are versioned and mapped deliberately; do not rename, delete or adopt live tabs as part of documentation work.

All data stays private in the user's Google account unless the user deliberately shares it. FolioDash must not publish the sheet, require sharing it with the developer, or copy portfolio records into a developer-owned central workbook.

## 5. Imports and confirmation

The desired complete workflow remains in the PWA:

1. Select a bank XLSX locally; parse and validate it without sending it to GitHub.
2. Review the candidate date, identities, subtotal, fund changes and opening/cash inputs.
3. Confirm against a known committed workbook revision.
4. Apps Script revalidates semantics and authorisation, records approved evidence and commits history through the protocol in section 7.
5. Refresh projections from the acknowledged committed revision; other devices read the same workbook.

Full original XLSX upload to Drive is not implicit. The exact evidence representation and unnecessary bank/account fields retained in native import tabs remain FD-004 decisions. A converted Google sheet is not a byte-identical backup of an XLSX file; file-byte and semantic fingerprints have separate versioned meanings.

A compatibility path may select a bank tab that the user manually imported into the workbook. It still needs preview, cash inputs and explicit commit. Merely adding/editing a bank tab must never silently change the confirmed performance history.

Reconstructed early history remains labelled reconstructed. The existing workbook and snapshots are not discarded, and historical inputs are not re-entered manually by default.

## 6. Financial logic and service contract

The pure kernel and reporting policies remain those in the parent ADR. Shared source is built for the browser and Apps Script runtime as appropriate, rather than maintaining one formula set in web components and another in `.gs` files. Apps Script runtime compatibility must be tested; framework/Node APIs do not belong in the kernel.

Browser calculations support responsive previews and views; the trusted Apps Script command path independently validates the same canonical rules before publishing a commit. Google-managed readable records do **not** provide FolioDash E2EE.

The proposed service exposes operations by purpose, not arbitrary spreadsheet ranges:

| Operation | Required outcome |
|---|---|
| Connect/check workbook | Authorised caller-bound identity, schema, compatibility and capabilities |
| Read portfolio | Coherent committed revision, policy and bounded records |
| Inspect candidate import | Typed validation findings and expected-revision review context |
| Commit import | Idempotent acknowledgement or typed conflict/failure |
| Read command outcome | Resolve a timeout without blindly importing again |
| Correct/restore | Explicitly reviewed, versioned and recoverable change |
| Export backup | Complete authorised ledger and declared evidence coverage |

Every remotely callable handler checks its boundary independently. Accepting an arbitrary function name, caller-supplied account identifier, cell range or sheet ID must not bypass the workbook binding. Audit the actual callable surface of the chosen deployment, including generated helpers.

Server state must be caller-scoped, not a single globally selected spreadsheet. Apps Script distinguishes user-scoped properties from properties shared by a script; the binding/key strategy must prove its identity semantics in the selected deployment. Do not use a shared property to hold the last user's workbook. [Properties Service](https://developers.google.com/apps-script/guides/properties)

## 7. Commit publication and concurrent access

Google Sheets is not a relational database with multi-request transactions. This design preserves **atomic publication of a coherent financial revision**, not a claim that every preceding cell write rolls back on error.

Proposed protocol, to verify under fault injection:

1. Authenticate/authorise; acquire the appropriate service-side lock with a bounded wait.
2. Read and validate the latest committed revision; check expected revision and account-scoped idempotency receipt.
3. Validate the candidate, reviewed evidence and all affected financial/lifecycle invariants.
4. Write a staged immutable revision payload and its checksums; read/verify the necessary written content before publication.
5. Publish one complete commit record using a defined write primitive. Readers accept only a valid committed revision with a complete, matching payload; staged/uncommitted rows are not financial history.
6. Return the durable command/revision receipt. If acknowledgement is lost, reconcile that command ID before retrying.

The final publication primitive, coherent-read checks and timeout behaviour are proof obligations, not assumed database guarantees. A reader must not silently display an older revision if a newer committed marker is damaged. A malformed staged tail may be ignored as uncommitted only under the explicitly tested format rules.

Locking coordinates participating script executions, not manual spreadsheet edits or unrelated scripts. Check evidence and committed-state integrity around mutation; unsupported external edits stop writes and lead to a recoverable diagnosis. Document lock scope: Apps Script document locks may not exist in a standalone/web execution; a script-wide lock can serialize users and become a bottleneck. Never assume a per-workbook distributed lock from a client-side mutex. [LockService](https://developers.google.com/apps-script/reference/lock/lock-service)

Keep data writes batched and formatting out of the service's hot path. No repeated chart rebuilding, sheet resizing, source-file rewriting or UI generation occurs on import. Exact parser and commit limits are measured, named and enforced.

## 8. What "live" means

The app reads committed Google data on connect/open, after a confirmed write, on explicit refresh, and on foreground/reconnect using a bounded freshness policy. A lightweight revision check can avoid repeatedly transferring all history.

This is **not** promised real-time push. Default monthly use does not need continuous polling; two devices may temporarily show different cached revisions. Display last successful check, committed revision and a refresh/sync state.

New bank tabs and manual source edits are unreviewed input, not automatic performance updates. A changed evidence fingerprint is surfaced for review instead of silently changing ledger values. Event triggers cannot be assumed to detect every manual/API change; the actual consistency path must work without that assumption.

An optional account-scoped offline cache remains a convenience copy. Writes and corrections need online authorisation. Expired tokens preserve review input and request reauthorisation before a command can continue. Google's browser token model uses user-granted access tokens; session/token lifetime handling requires explicit implementation. [Google token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)

## 9. Privacy, hosting and operational limits

- Financial records are stored in Google, not made inherently safe by GitHub hosting. Google account security, workbook sharing, authorised script code, token handling and deployed frontend integrity remain trust boundaries.
- Audit any existing workbook sharing and **Publish to web** settings before calling the dataset private. Adding an authenticated FolioDash interface does not revoke an older public spreadsheet publication; changing that setting needs an explicit authorised action.
- This is not operator-blind storage: the user authorises application code to process Google data, and a compromised frontend or script release can misuse that authority. Do not promise that a private repository, hidden tabs or user-owned storage makes malicious updates harmless.
- No user token, original statement, extracted portfolio or workbook ID is emitted into public build artifacts, logs, URLs or shared demo configuration. Store connection choices privately/account-scoped; locators are not secrets but can still reveal personal context.
- GitHub Free Pages requires a public source repository; private-repository Pages requires an eligible plan. A private repository does not make a deployed Pages site private. Review code visibility, plan and authentication before publication. [Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- A dedicated app origin is preferable. If a shared `github.io` origin is used, its cross-project storage/service-worker trust boundary must be documented and tested; another path is not another origin.
- Google identity may require an explicitly approved Google-hosted authentication loader and CSP exception. This is a narrow provider integration, not permission for arbitrary CDN/analytics scripts.
- Request only the approved scopes and disclose their real reach. Sheets scopes apply at spreadsheet-file level, not a single hidden tab. Verify whether per-file selection can satisfy the chosen Apps Script route instead of promising narrower access than the SDK requests. [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes)
- Apps Script/Google APIs have quotas, runtimes and concurrent-execution limits. No promise of unlimited free access, instantaneous imports or a production SLA follows from avoiding a separate database. [Google quotas](https://developers.google.com/apps-script/guides/services/quotas)
- Google version history and a live workbook are not a complete independently tested backup policy. Preserve portable export/restore, evidence coverage and deletion limits from the parent ADR.

The user's local `.Montly Exports` folder is private material outside the application/repository artifact contract. Its spelling/location is preserved; ignore rules guard against accidental inclusion and do not make the folder private by themselves.

## 10. Feasibility and release gates

**All gates below are NOT RUN.** Documentation is not deployment evidence.

| Gate | Required proof |
|---|---|
| G1 Hosting | Actual Pages plan/source visibility and origin policy are acceptable; no private data/credential in the production artifact |
| G2 Google auth | Real browser consent, allowed scopes, denial, expiry/regrant and correct caller identity on Mac and Android |
| G3 Runtime bridge | Deployed synthetic API executable is callable/readable from the real PWA origin without anonymous execution, secret embedding or CORS workarounds |
| G4 Workbook isolation | Two Google accounts, each private workbook: no access or binding leakage across users; tampered IDs and insufficient access fail closed |
| G5 Commit safety | Duplicate concurrent commands, two-device stale review, partial writes, manual changes, corrupt commit and lost acknowledgement are correctly reconciled |
| G6 Read freshness | Coherent reads survive racing commits; refresh/reconnect finds the latest confirmed revision and flags incompatible manual edits |
| G7 Import/migration | Bounded synthetic Excel input and read-only legacy migration preserve money, dates, cash provenance, lifecycle and policy |
| G8 Recovery | Complete portable restore, revoked access, deleted/corrupted workbook and service quota failures have tested non-destructive paths |
| G9 UX/performance | Real production chart rendering, responsive install/update flow and measured read/import latency, not spreadsheet-formatting timings |

Start with a synthetic workbook and one authenticated read through the actual proposed browser route. Prove G2/G3 before building the full dashboard. Add a single idempotent synthetic commit and G4/G5 next. Broader user support waits for real second-account onboarding, consent/review limits and a documented maintenance path.

No real financial upload, repository publication, Sheets modification, script deployment or Google Cloud provisioning has occurred through adopting this document.
