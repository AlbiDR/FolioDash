# Repository configuration: variables, secrets, environments and the public-release gate

Status: **Draft: nothing described here has been created.**  
Created: 2026-11-01  
Scope: GitHub repository settings, Actions configuration and the checks before the repository becomes public. Related decisions: FD-011 (licence), FD-014 (deployment model), FD-016 (Apps Script sync).

## 1. Principle

The owner intends to make this repository public. Treat every file, commit, pull request, issue and workflow log as public from the first commit, because history cannot be reliably unpublished. Private values live only in GitHub secrets or on the owner's machine. Secrets are never committed, echoed, passed on a command line or placed in a frontend build (see [Google-backed architecture §2](../architecture/google-sheets-backend.md#2-essential-correction-github-secrets-are-not-a-runtime-bridge)).

## 2. Configuration contract (planned)

Names use `UPPER_SNAKE_CASE`. Each item is created only when the workflow that needs it exists. The owner enters secret values; an assistant never handles them. No item below exists yet.

| Name | Kind | Scope | Purpose | Created when |
|---|---|---|---|---|
| `APPS_SCRIPT_SCRIPT_ID` | Variable | Environment `apps-script-deploy` | Identifies the script project to push to. A locator, not a credential, but it names the owner's project, so it is not committed (`.clasp.json` stays ignored and is generated in CI) | First synthetic push |
| `APPS_SCRIPT_DEPLOYMENT_ID` | Variable | Environment `apps-script-deploy` | Deployment to update, so the API executable keeps its identifier | First synthetic deploy |
| `CLASPRC_JSON` | Secret | Environment `apps-script-deploy` only, never repository-wide | The clasp login token (FD-016) | After the protections in §3 are active |

Public OAuth client IDs are public by design and belong in reviewed public configuration, not in secrets (Google-backed architecture §2).

## 2a. Policy files in the repository

| File | Purpose |
|---|---|
| `.github/allowed-contributors.json` | The only humans whose attribution is accepted; GitHub no-reply addresses only, never a personal address |
| `scripts/verify-contributors.mjs` | Fails on any author or co-author that is not approved, or whose metadata names an AI system or automation. Dependency-free, so it needs no tooling decision |
| `.github/workflows/contributor-policy.yml` | Runs that check on pushes to `main`, pull requests and manual dispatch |
| `.github/CODEOWNERS` | Review ownership of `.github/`, `docs/architecture/` (CleanStack and the register) and `scripts/` |
| `.github/pull_request_template.md` | Includes the conformance check against CleanStack and the decision register |
| `.github/SECURITY.md`, `.github/CONTRIBUTING.md` | Short, and they point to the docs rather than repeat them |

CODEOWNERS and the attribution check only enforce anything once branch protection requires them (§4). Adapted from the Playlist Tidy project; its licence headers, typography check and deployment workflows were deliberately not copied.

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
