# Repository configuration: variables, secrets, environments and the public-release gate

Status: **Draft. Created on 2026-11-01: environment `apps-script-deploy` (no protection rules, since the free private plan does not allow them), its variables `APPS_SCRIPT_SCRIPT_ID` and `APPS_SCRIPT_DEPLOYMENT_ID`, and the repository variables `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_SCRIPT_ID`. Not created: the secret `CLASPRC_JSON`, which the owner enters. The deploy workflow has not run, and no hosted web build reads the repository variables yet.**  
Created: 2026-11-01  
Scope: GitHub repository settings, Actions configuration and the checks before the repository becomes public. Related decisions: FD-011 (licence), FD-014 (deployment model), FD-016 (Apps Script sync).

## 1. Principle

The owner intends to make this repository public. Treat every file, commit, pull request, issue and workflow log as public from the first commit, because history cannot be reliably unpublished. Private values live only in GitHub secrets or on the owner's machine. Secrets are never committed, echoed, passed on a command line or placed in a frontend build (see [Google-backed architecture §2](../architecture/google-sheets-backend.md#2-essential-correction-github-secrets-are-not-a-runtime-bridge)).

### 1a. GitHub is the single source of truth for configuration (owner direction, 2026-11-01)

The owner wants every value that can change, whether a secret or a variable, to be changed in one place: the repository's GitHub settings. Nothing is configured by editing files, a console, or a person's browser. This holds with one limit that GitHub imposes: a running browser cannot read GitHub, so a changed value reaches the app by re-running a workflow, which rebuilds or redeploys it. The path is always: change it on GitHub, run the workflow, and the app and script follow.

- **Secrets** (never in a build, a log or a file): only the deployment credential, `CLASPRC_JSON`.
- **Variables** (public-by-design locators, set on GitHub and injected by the build): the OAuth client ID, the script and deployment IDs, and optionally the default spreadsheet ID. They end up readable in the delivered app, so they are not credentials. Google, not secrecy, protects the data.
- **Trade-off to decide:** baking the spreadsheet ID into a build that becomes public names the owner's spreadsheet to every visitor. Access is still enforced by Google, but the owner may prefer to keep it as something each person enters, as the Connection page does today.
- Anything the repository cannot hold (Google console settings) is recorded in [Google setup](google-setup.md) so it can be recreated; it is not a second source of truth for values.

This direction is recorded here; it is not an accepted decision. `.github/workflows/deploy-apps-script.yml` (manual, `main` only, environment `apps-script-deploy`) and `connectionDefaults.ts` (reads `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_SCRIPT_ID` at build time) implement it, but neither has run, and the web build has no hosted workflow yet.

## 2. Configuration contract (planned)

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
| `.github/workflows/contributor-policy.yml` | Runs that check on pushes to `main`, pull requests and manual dispatch |
| `scripts/verify-punctuation.ts`, `scripts/punctuation.ts` | Fails on any em dash or en dash in any tracked text file, with its file, line and column. There is no exception: use a plain hyphen, a colon, a comma or a full stop. Dependency-free. It runs as its own step in `.github/workflows/verify.yml` and as part of `npm run verify` |
| `.github/CODEOWNERS` | Review ownership of `.github/`, `docs/architecture/` (CleanStack and the register) and `scripts/` |
| `.github/pull_request_template.md` | Includes the conformance check against CleanStack and the decision register |
| `.github/SECURITY.md`, `.github/CONTRIBUTING.md` | Short, and they point to the docs rather than repeat them |

CODEOWNERS and the attribution check only enforce anything once branch protection requires them (§4). Adapted from the Playlist Tidy project; its licence headers, typography check and deployment workflows were deliberately not copied.

## 2b. Workflows and repository settings in force (2026-11-02)

| Workflow or file | What it does |
|---|---|
| `verify.yml` | Contributor-neutral quality gate: punctuation, typecheck, lint, tests, build, Apps Script bundle check and dependency audit, on Node 22 and 24. Runs on pushes to `main`, pull requests, weekly, manually, and as a reusable workflow |
| `deploy-pages.yml` | On every push to `main`: runs `verify.yml`, then builds and publishes `dist/web` to GitHub Pages. The OAuth client ID comes from the repository variable `VITE_GOOGLE_CLIENT_ID` |
| `contributor-policy.yml` | Attribution check over complete history |
| `codeql.yml` | CodeQL analysis of the TypeScript source on pushes, pull requests and weekly |
| `dependency-review.yml` | Fails a pull request that adds a dependency with a known high-severity vulnerability |
| `deploy-apps-script.yml` | Manual only, kept until the Apps Script service is removed |

Settings applied by the owner's request: secret scanning and push protection, Dependabot alerts and security updates, private vulnerability reporting, and the rule that every action must be pinned to a full commit SHA. A ruleset `Protect main` blocks deleting `main` and force-pushing to it; nobody is exempt.

**No scheduled Dependabot updates, by design:** the attribution policy rejects any commit authored by automation, and Dependabot's commits are bot-authored, so its pull requests fail it. Version updates are off (no `dependabot.yml`), alerts stay on, the weekly Verify run audits dependencies, and updates are made by hand (a pinned action is updated by editing its SHA). Dependabot security-update pull requests are still enabled in the repository settings and will fail the attribution check until the owner turns them off or exempts Dependabot in the policy.

**Not enforced, by choice:** required status checks and required pull requests. GitHub rejects a direct push to a branch that requires checks, so requiring them means every change goes through a pull request. The owner chose to keep direct pushes to `main` for now; the checks still run on every push and a failure is visible, but it does not block the push. Revisit when more than one person contributes.

## 3. Environment and workflow rules (proposed)

- One environment, `apps-script-deploy`, restricted to the `main` branch, with the owner as required reviewer.
- Deploy workflows run only on `workflow_dispatch` or after merge to `main`. They never run on pull requests, and never use `pull_request_target` with code from a pull request.
- Default workflow token is read-only (already the case). A job raises permissions only for what it needs.
- Third-party actions are pinned to a full commit SHA. Dependencies are updated by reviewed pull requests.
- Logs never print secrets or tokens, and debug logging stays off.
- Fork pull requests get no secrets. Require approval before workflows run for outside contributors.
- Revoking a leaked clasp token is done in the Google account's third-party access settings, then the secret is replaced.

## 4. Plan constraint

On the current free plan, a private repository cannot have branch protection, and protected environments with a required reviewer are unlikely to be available. Both are available once the repository is public, or on GitHub Pro. Therefore **`CLASPRC_JSON` is not created while the repository is private on the free plan**. Until then, deployment is a manual `clasp push` by the owner, or a `workflow_dispatch`-only job that refuses any actor but the owner.

## 5. Public-release gate (all NOT RUN)

Before changing visibility, with explicit owner authority (AGENTS.md):

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
