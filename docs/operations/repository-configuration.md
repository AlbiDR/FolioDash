# Repository configuration: variables, secrets, environments and the public-release gate

Status: **Implemented Actions and configuration contract; release and live-product acceptance remain incomplete. Read-only GitHub inspection on 2026-11-05 confirmed an existing Pages deployment, a main-only Pages environment and an unprotected Apps Script environment. The workflow architecture and evidence limits are recorded in [GitHub Actions](github-actions.md).**
Created: 2026-11-01  
Scope: GitHub repository settings, Actions configuration and the checks before the repository becomes public. Related decisions: FD-011 (licence), FD-014 (deployment model), FD-016 (Apps Script sync).

## 1. Principle

The repository is public as confirmed by read-only inspection on 2026-11-05. Treat every file, commit, pull request, issue and workflow log as public, because history cannot be reliably unpublished. This status observation does not certify the historical release gate in section 5. Private values live only in GitHub secrets or on the owner's machine. Secrets are never committed, echoed, passed on a command line or placed in a frontend build (see [Google-backed architecture §2](../architecture/google-sheets-backend.md#2-essential-correction-github-secrets-are-not-a-runtime-bridge)).

### 1a. GitHub is the single source of truth for configuration (owner direction, 2026-11-01)

The owner wants every value that can change, whether a secret or a variable, to be changed in one place: the repository's GitHub settings. Nothing is configured by editing files, a console, or a person's browser. This holds with one limit that GitHub imposes: a running browser cannot read GitHub, so a changed value reaches the app by re-running a workflow, which rebuilds or redeploys it. The path is always: change it on GitHub, run the workflow, and the app and script follow.

- **Secrets** (never in a build, a log or a file): only the deployment credential, `CLASPRC_JSON`.
- **Variables** (public-by-design locators, set on GitHub and injected by the build): the OAuth client ID, the script and deployment IDs, and optionally the default spreadsheet ID. They end up readable in the delivered app, so they are not credentials. Google, not secrecy, protects the data.
- **Trade-off to decide:** baking the spreadsheet ID into a build that becomes public names the owner's spreadsheet to every visitor. Access is still enforced by Google, but the owner may prefer to keep it as something each person enters, as the Connection page does today.
- Anything the repository cannot hold (Google console settings) is recorded in [Google setup](google-setup.md) so it can be recreated; it is not a second source of truth for values.

The web build reads the public OAuth client ID from `VITE_GOOGLE_CLIENT_ID`. Changing it requires a new Deploy site or Verify run on current `main`, which checks and publishes the configured artifact. The retained Apps Script workflow is manual and owner-only on current `main`, using the `apps-script-deploy` environment. FD-017 selects direct Google access for new users; retaining that workflow does not reinstate Apps Script as the selected runtime route.

## 2. Configuration contract

Names use `UPPER_SNAKE_CASE`. Each item is created only when the workflow that needs it exists. The owner enters secret values; an assistant never handles them. As of 2026-11-01 these exist: variables `APPS_SCRIPT_SCRIPT_ID` and `APPS_SCRIPT_DEPLOYMENT_ID` (environment `apps-script-deploy`), variables `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_SCRIPT_ID` (repository), and the secret `CLASPRC_JSON` (environment `apps-script-deploy`). `VITE_GOOGLE_WORKBOOK_ID` does not exist, by the owner-decision note in 1a.

| Name | Kind | Scope | Purpose | Created when |
|---|---|---|---|---|
| `APPS_SCRIPT_SCRIPT_ID` | Variable | Environment `apps-script-deploy` | Identifies the script project to push to. A locator, not a credential, but it names the owner's project, so it is not committed (`.clasp.json` stays ignored and is generated in CI) | First synthetic push |
| `APPS_SCRIPT_DEPLOYMENT_ID` | Variable | Environment `apps-script-deploy` | Deployment to update, so the API executable keeps its identifier | First synthetic deploy |
| `VITE_GOOGLE_CLIENT_ID` | Variable | Repository (read by the web build) | The OAuth client ID the site signs people in with. Public by design | First hosted build |
| `VITE_GOOGLE_SCRIPT_ID` | Variable | Repository | **Obsolete under FD-017.** The direct route needs no script; the variable stays only until the Apps Script service is removed | Removal after the live proof |
| `VITE_GOOGLE_WORKBOOK_ID` | Variable | Repository, only if the owner decides in §1a | The default spreadsheet ID. Optional, see the trade-off in §1a | Owner decision |
| `CLASPRC_JSON` | Secret | Environment `apps-script-deploy` only, never repository-wide | The clasp login token (FD-016) | After the protections in §3 are active |

Public OAuth client IDs are public by design, so they are variables and never secrets (Google-backed architecture §2). Under §1a they are kept as GitHub variables, not committed files, so changing one is a settings change and a workflow run.

## 2a. Policy files in the repository

| File | Purpose |
|---|---|
| `.github/allowed-contributors.json` | The only humans whose attribution is accepted; GitHub no-reply addresses only, never a personal address |
| `scripts/verify-contributors.ts` | Fails on any author or co-author that is not approved, or whose metadata names an AI system or automation. Dependency-free, so it needs no tooling decision |
| `.github/workflows/verify.yml` | Runs contributor attribution through `npm run verify` on each supported Node version with complete history; no separate attribution workflow |
| `scripts/verify-workflows.ts` | Runs pinned, checksum-verified actionlint locally and in the workflow validation job; no npm dependencies required |
| `scripts/verify-punctuation.ts`, `scripts/punctuation.ts` | Fails on any em dash or en dash in any tracked text file, with its file, line and column. There is no exception: use a plain hyphen, a colon, a comma or a full stop. Dependency-free. It runs as part of `npm run verify` |
| `.github/CODEOWNERS` | Review ownership of `.github/`, `docs/architecture/` (CleanStack and the register) and `scripts/` |
| `.github/pull_request_template.md` | Includes the conformance check against CleanStack and the decision register |
| `.github/SECURITY.md`, `.github/CONTRIBUTING.md` | Short, and they point to the docs rather than repeat them |

Attribution failure blocks the dependent site deployment. CODEOWNERS and quality checks do not block direct pushes without required reviews/status checks (section 2b). Adapted from the Playlist Tidy project; its licence headers, typography check and deployment workflows were deliberately not copied.

## 2b. Workflow architecture (2026-11-05)

| Workflow or file | What it does |
|---|---|
| `verify.yml` | Single orchestrator: actionlint, one Node 22/24 verification and audit matrix, then Pages publication for current `main` push/manual runs. PR, scheduled and other-branch manual runs verify only |
| `deploy-pages.yml` | Reusable deployment only; consumes the checked Node 22 artifact in the caller's run after the entire matrix succeeds; never rebuilds |
| `codeql.yml` | Independent static analysis of TypeScript on pushes, pull requests, weekly and manual dispatch; uploads results to code scanning |
| `dependency-review.yml` | PR dependency review with the same moderate-or-greater vulnerability threshold as npm audit |
| `deploy-apps-script.yml` | Retained manual deployment, current `main` and owner only; verifies complete history and audits before any credential file or remote write |

[GitHub Actions](github-actions.md) owns triggers, the dependency graph, cancellation, artifact ownership, maintenance and verification limits.

Settings applied by the owner's request: secret scanning and push protection, Dependabot alerts, private vulnerability reporting, and the rule that every action must be pinned to a full commit SHA. A ruleset `Protect main` blocks deleting `main` and force-pushing to it; nobody is exempt.

**No scheduled Dependabot updates, by design:** the attribution policy rejects any commit authored by automation, and Dependabot's commits are bot-authored, so its pull requests fail it. Version updates are off (no `dependabot.yml`), alerts stay on, the weekly Verify run audits dependencies, and updates are made by hand (a pinned action is updated by editing its SHA). Dependabot security-update pull requests are turned off in the repository settings (owner, 2026-11-02) for the same reason.

**Not enforced, by choice:** required status checks and required pull requests. GitHub rejects a direct push to a branch that requires checks, so requiring them means every change goes through a pull request. The owner chose to keep direct pushes to `main` for now; the checks still run on every push and a failure is visible, but it does not block the push. Revisit when more than one person contributes.

## 3. Environment and workflow rules (proposed)

- Desired Apps Script protection: environment `apps-script-deploy` restricted to `main`, with the owner as required reviewer. Read-only inspection on 2026-11-05 found neither protection configured. The workflow enforces `main` and the owner as both original and rerun actor; this is a fallback, not environment protection. The existing `github-pages` environment does restrict deployment to `main`.
- Deploy workflows run only on `workflow_dispatch` or after merge to `main`. They never run on pull requests, and never use `pull_request_target` with code from a pull request.
- Default workflow token is read-only (already the case). A job raises permissions only for what it needs.
- Third-party actions are pinned to a full commit SHA. Dependencies are updated by reviewed pull requests.
- Logs never print secrets or tokens, and debug logging stays off.
- Fork pull requests get no secrets. Require approval before workflows run for outside contributors.
- Revoking a leaked clasp token is done in the Google account's third-party access settings, then the secret is replaced.

## 4. Historical plan constraint

The original private/free-plan constraint required an owner-only manual workflow until environment protections were available. The repository is now public, but the Apps Script environment remains unprotected. No repository or environment settings are changed by the Actions refactor. Adding required reviewers or branch rules needs its own explicit authority; the current owner-only workflow fallback remains in force.

## 5. Historical public-release gate (not certified by this audit)

These requirements were recorded before publication. The repository is now public; the Actions audit does not establish whether each historical requirement was satisfied, rewrite history or authorize a visibility change. Preserve the outstanding evidence rather than infer completion from visibility:

1. Licence chosen and added (FD-011).
1b. The history still contains a few real example values (amounts, a quantity and account-opening dates) in tests and comments committed before 2026-11-01 16:35. They were removed from the current files, but not from earlier commits. Rewrite or squash the history, and recreate the repository if needed, before it becomes public.
1a. Every commit uses the approved GitHub no-reply author address. The first commit used a personal address and must be rewritten before the switch.
2. Full history and current files scanned with a secret scanner, plus a manual check for real portfolio data, account identifiers and personal context.
3. `App Scripts/`, `.Montly Exports/` and other private folders confirmed absent from history.
4. Secret scanning and push protection enabled immediately after the switch.
5. Branch protection or a ruleset on `main`, the `apps-script-deploy` environment and fork-approval settings configured and checked.
6. Pages source, origin and plan decisions reviewed (FD-008).
7. Any credential that ever touched the repository, CI or a log is rotated. None is known to.

After the switch, every push is checked before it is made, because a mistake is public the moment it lands.
