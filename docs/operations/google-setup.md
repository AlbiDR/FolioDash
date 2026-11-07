# Google setup for the first live proof (owner steps)

Status: **The route below is superseded by FD-017 (see the section above). It was performed once by the owner on 2026-11-01, with one synthetic spreadsheet. The Connection page's read-only `foliodashCheck` call then succeeded against Google (sign-in, `scripts.run`, spreadsheet access). Commit and read-back were not exercised. Google's console wording changes.**  
Order found in practice: the consent screen must exist before the script can be linked to the project, and the consent screen's scope list and test user are added afterwards. Creating a web client also generates a client secret that the browser flow never uses; it is not kept.  
Scope: what the owner does in their own Google account so FolioDash can make its first authenticated call to the Apps Script service, using a **synthetic** spreadsheet. This proves gates G2 and G3 of the [Google-backed architecture](../architecture/google-sheets-backend.md); it does not choose between the deployment models of FD-014.

## The current route (FD-017): sign in once, no script

### Synthetic direct-Google proof, 2026-11-04

The [isolated acceptance build](onboarding-acceptance.md) passed Google sign-in, synthetic workbook creation, three monthly commits and read-back from Chrome 133 on an Android 16 emulator at the existing local origin. An explicit reload/sync retained all three months; Check my history rebuilt 3 of 3 stored sources exactly. Both multiple Excel exports and a statement-per-sheet workbook passed the native Android picker. The first live attempt exposed a parser-to-review mapping defect; it was reconciled as not recorded, fixed and regression-tested before the successful run.

This supersedes the historical claim below that direct Google writes have never been exercised. It does not establish cross-device discovery, two-account isolation, simultaneous-save safety, a hosted-origin proof, physical Android/WebAPK behavior or production release readiness. Retained Apps Script removal remains separate follow-up work; no deployment, permissions or existing financial workbook were changed by this proof.

### Entry and write hardening (2026-11-03)

The Import screen now offers Excel and manual valuation entry. Manual entry pre-fills known active fund names/ISINs, requires fresh explicit market values and a valuation date, validates Italian cent amounts and identifiers, and uses the existing opening/cash/lifecycle review and final save. An explicitly confirmed empty portfolio proceeds to the normal closure/proceeds questions. Removing a fund from the entry does not delete its historical records.

Manual entries have no bank-source attachment; they must not be described as bank-verified evidence. Their figures remain in the ledger and readable summary. A corresponding bank source may later be attached through the existing reconciliation workflow. Drafts are in component memory, not promised recoverable across page reload/navigation. Interactive Mac/Android acceptance remains pending.

The manual-entry UX uses stable fund-row identities, existing-fund cards, live validated totals and undo for the last removed row. Going back from cash review retains its answers when values/date are unchanged; changed values start a fresh review. Method switches retain in-page drafts and are disabled while saving or reconciling an uncertain result. Successful entry resets to fresh values for the next observation. Competing Excel reads use a selection generation so an older result cannot replace a newer choice. Field/card layouts adapt to narrow screens; physical-device and live-Google acceptance remain separate from local headless-browser checks.

Before appending, the direct writer now compares complete ledger rows rather than only row count. After an acknowledged append it reads and validates the complete expected state; an unreadable/different result is uncertain, not a success or invitation to blindly retry. Unexpected write responses are uncertain too. Restore read-back compares complete financial state rather than just the number of months.

**Historical concurrency limitation (amended by FD-021 below):** these are detection/reconciliation improvements, not an atomic compare-and-swap. Another device can still write after the final read and before the append. Direct Sheets API storage has no shared service lock in this design. Do not claim this release makes simultaneous cross-device financial writes safe. A properly verified serialization/conditional-write mechanism needs a further architecture decision before that guarantee. Real Google write/read-back and interactive-device proof are not supplied by unit tests.

### Sign-in reliability (2026-11-05)

The later FD-021 change below supersedes the memory-only/reload limitation recorded in this subsection.

Token requests use `prompt: ""` so Google can reuse an existing session and grant instead of FolioDash forcing the default account picker. Google may still require sign-in, account selection or consent. This follows the [Google token client reference](https://developers.google.com/identity/oauth2/web/reference/js-reference) and [token model guide](https://developers.google.com/identity/oauth2/web/guides/use-token-model); it is not silent background authentication.

Concurrent actions share one token request, and concurrent connection attempts share one workbook discovery/creation. A token rejected with HTTP 401 is removed from session memory; the next user action requests fresh access. The rejected request is not automatically replayed. Financial writes retain their existing explicit confirmation and uncertain-outcome reconciliation.

Blocked pop-ups, closed windows, missing grants and sign-in timeout have separate recovery messages. Loading Google's script has a 15-second deadline and removes failed script elements before another attempt. An unanswered sign-in ends after two minutes; late responses cannot install a token. Forget this device also invalidates in-flight sign-in and connection results.

Access tokens remain only in memory. Reloading or reopening the app still requires a user-triggered reconnection; a long-lived login or refresh-token service would require a separate authentication and deployment decision. (Superseded by FD-021 and then FD-022 below: access is now kept on the device and renewed on the next click. A refresh-token service is still not adopted.) The workbook and checked device copy remain available through their existing recovery paths.

Local evidence: `GoogleIdentity.test.ts` uses a synthetic provider to exercise prompt configuration, granted scope checks, blocked/closed/throwing provider paths, timeout, late callback and script reload. `session.test.ts` covers shared connection/renewal, rejected-token recovery and forgetting during sign-in. Real Google consent/regrant behavior on Mac and Android remains NOT RUN for this change. No Google Cloud configuration or deployment was changed.

### Explicit reconnection and refresh outcomes (2026-11-05)

A reported repeat of "Google rejected the sign-in" without a Google window exposed two different paths behind the same message. A real Google HTTP 401 rejects the supplied access; separately, a refresh whose result was replaced by a newer read or account transition also returned `unauthorised` even when its Google response succeeded. The latter is a confirmed local defect, reproduced with an older manual read completing after a newer background read. It does not prove which path occurred on the owner's device.

Superseded reads now have a separate typed outcome and do not display an authentication error on Your data. A real 401 asks for reconnection. The Reconnect with Google action discards only the short-lived memory/tab access and requests Google account selection (`prompt: "select_account"`), even when the discarded access still looks valid locally. It retains the checked workbook binding, saved portfolio/expense copies, drafts and unresolved write receipts. It does not revoke the grant, delete records, submit a financial write or replay a refused request. Ordinary synchronization still reuses unexpired access and existing consent. If a recovery attempt fails while the connection state is otherwise stale, its result also exposes an explicit reconnect button.

Use Your data > Reconnect with Google and select the Google account that owns the FolioDash sheet. No device-copy reset or restoration is required to renew access. The button is available after loading the updated application; a previously loaded service-worker version may still need its normal Reload to update action after finishing any draft.

Evidence: `GoogleIdentity.test.ts`, `session.test.ts` and `accountText.test.ts` cover explicit account selection, replacement of valid persisted access, cancelled recovery with the identical saved history, real-401 renewal and the successful-read race. Local production UI checks use a fresh headless Chrome profile, a synthetic saved workbook and simulated Google responses; they verify the recovery button, account-selection request, unchanged copy, no writes and a narrow 390px error layout. The full `npm run verify` gate passed with 762 tests across 58 files; all seven production-UI recovery assertions passed. Local logs: `/tmp/foliodash-google-reconnect-verify.log`; the browser procedure is retained locally as `/tmp/foliodash-reconnect-browser.mjs`. These temporary paths are not durable CI artifacts. These are synthetic checks, not a real OAuth proof. Browser UI inspection on the owner's running app was unavailable, so the reported device's specific failure and real-provider reconnection remain unverified. No credentials or financial records were inspected or changed.

### Persistent tab session and two-device freshness (FD-021, 2026-11-05)

The owner's request for persistence and safer two-device use is recorded in [FD-021](../architecture/decision-register.md). Google access now survives a reload in the same tab through `sessionStorage`, bound to the OAuth client, granted `drive.file` scope and checked workbook. Its validity is capped at one hour minus a two-minute margin and never extended past Google's expiry. Blocked storage falls back to memory. It is not an indefinite login: closing the tab or expiry can require another user-triggered Google interaction. No refresh token or new scope is used. FD-022 below supersedes the tab-only storage. Same-origin JavaScript can read the tab session; Forget this device removes it, and an HTTP 401 invalidates it immediately.

Opening a saved session, returning to the foreground, coming back online and the visible-page minute timer check for changes. The session coalesces checks and spaces automatic attempts at least 30 seconds apart. Hidden/offline pages and edited import/expense drafts pause these automatic checks. They never open a Google popup, create a workbook or submit a financial draft. Portfolio and expense reads retain the checked copy on failure; the interface distinguishes checking, expired access and an unavailable Google connection. The last successful check stays visible. Browser requests have a 30-second deadline and bypass HTTP caches. Checks after an import conflict read the winning history while preserving the draft; another confirmation is still required.

Portfolio appends now claim a deterministic named-range ID for the exact predecessor rows and append typed rows in **one `spreadsheets.batchUpdate`**. The named range refers to the ledger header and contains a hash, not financial data. A second updated writer from the same predecessor encounters the duplicate ID; Google documents that as an error and documents atomic batch application. This inference is tested locally, not yet proven against real Google. A valid winning history is read after a refusal and reconciled with the canonical command logic; a lost/unreadable response remains unknown. The acknowledged save's checked row prefix remains valid if another legitimate revision arrives before read-back.

The guard requires **both devices to run the updated application**. An older client, direct manual edits or removal of markers bypasses its coordination. View maintenance preserves markers. One marker is retained per committed predecessor; ordinary retention policy remains open. Explicit restoration uses a separate single-use recovery marker; if that recovery marker already exists, no second append is allowed, and recovery may require a replacement workbook. Expense history continues to preserve concurrent sibling corrections and presents an explicit conflict instead of silently choosing one version. This is checked polling, not real-time push.

Local evidence: `npm run verify` exercises synthetic tab reload, expiry, client/workbook/scope isolation, denied storage, session invalidation, bounded scheduling, draft pause/cleanup, cross-device refresh, two writers released after the same final read (different and identical commands), atomic marker rollback, legitimate successor read-back, and existing expense correction/conflict/recovery cases. The full local suite passed with 753 tests across 58 files. A fresh headless Chrome profile also passed a one-off production-build check with simulated Google responses: connect, reload with no second OAuth request, automatic refresh and a 320px connection page without horizontal overflow. The browser check made no real Google requests. Real Google named-range/append race, deployed-origin reconnect, physical Mac/Android two-device editing and multi-day login are NOT RUN for this change. No cloud resources were provisioned and no real financial records were migrated.

### Remembered connection (FD-022, 2026-11-07)

The owner's top-priority request was that the connection stays on and the person is not asked to sign in every time. [FD-022](../architecture/decision-register.md) records the decision, its five layers and its limits.

**Why it did not stay on.** Each of these was observed in the code before the change, or comes from Google's documentation:

- Access lived only in `sessionStorage` and expires within the hour, so a new tab, an installed-app relaunch or a restart found nothing.
- Startup never tried to renew; it showed "Reconnect to Google" and waited for a trip to Your data.
- Reconnect always forced Google's account chooser (`select_account`) and no account hint was ever sent.
- Google's script was loaded only after the click, which can lose the user gesture its window needs.
- Nothing renewed access before it expired, so a save could straddle expiry.

**What Google allows.** The [token model guide](https://developers.google.com/identity/oauth2/web/guides/use-token-model) gives a browser-only app access that lasts a short time, no refresh token, and expects a new token from a user gesture. So no scheme can renew on a timer. FolioDash renews on the next click and names the remembered account (`hint` in the token client, `login_hint` in the request), which Google documents as skipping account selection.

**What the person sees.** Open the app: the saved copy shows at once and the chip reads "Saved on this device · tap to sync". The next tap anywhere renews access with a brief Google window that closes by itself when Google still has the session and grant, then checks for changes. If that fails twice, or the browser blocked the window, the chip becomes "Reconnect to Google" and stays one tap away on every screen. Your data adds "Use a different Google account". Forget this device removes the saved copy, access and remembered account and revokes the token.

**Owner step, not performed: publish the consent screen.** Google expires a grant after seven days when the consent screen is in **Testing** with the External audience, for any scope beyond sign-in identity ([Google's OAuth overview, refresh token expiration](https://developers.google.com/identity/protocols/oauth2)). That alone would ask the person to consent again every week. `drive.file` is classed non-sensitive ([Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)), and Google's [verification help](https://support.google.com/cloud/answer/13463073) states an app using only non-sensitive scopes need not complete verification. The current status was not inspected. Step 5 below, which says to keep the app in Testing, belongs to the superseded Apps Script route.

This is a one-time setting for the project behind the site's single OAuth client, made by the owner, not a step for each person. After publishing, anyone with a Google account can connect and approves the `drive.file` permission once on their first connect. While the app stays in Testing, only test users the owner adds by hand (up to 100) can sign in at all. Someone who runs their own copy of FolioDash needs their own project and client ID.

Steps, from Google's [audience](https://support.google.com/cloud/answer/15549945) and [branding](https://support.google.com/cloud/answer/10311615) help. Google's pages do not give an exact menu path or the wording of any confirmation, and the console changes, so follow what it shows:

1. Open the Cloud console for the FolioDash project and go to the Audience page of Google Auth Platform (Google links it as `console.developers.google.com/auth/audience`). The publishing status, Testing or In production, is shown there.
2. If it says Testing, choose **Publish app**. Google's audience help names that button as what sets the status to In production.
3. If the console asks for branding before it will publish, fill the Branding page (`console.developers.google.com/auth/branding`): app name, user support email and developer contact. Google's branding help says the homepage, privacy policy and terms links are required for all external production apps, and that the homepage must be on a domain you own and have verified. Whether **Publish app** enforces that for an app using only `drive.file` is not stated in Google's pages. **FolioDash has no privacy-policy page yet**, so if the console demands one, it has to be written and published first; that is its own task.
4. Expect to approve once more. Google's pages do not say whether grants made under Testing survive publishing. They describe the seven-day expiry only under Testing and do not say outright that it stops in production, so watch for about a week. A report from a Google forum, not Google's documentation, says an app moved to production kept the seven-day expiry until new OAuth credentials were created; treat that as an unconfirmed fallback.
5. Check the result on a real device: sign in, close the app, return after more than an hour and after more than a week, and note whether Google asks for consent. Record what happens here; none of it has been observed.

**Evidence, 2026-11-07.**

- Local verification: `npm run verify` passed with 820 tests in 65 files (767 in 59 before). New tests cover the renewal rules, the quiet renewal after a restart, renewal ahead of expiry, the ladder, the save guard, access shared between windows and forgetting from another window. Two deliberate breaks were caught: removing the pre-save margin failed the save-guard test, and dropping the account hint failed four tests. Both were reverted.
- Real browser, production build, Google's real script, a synthetic client ID, no sign-in completed, popups refused so nothing reached Google: a returning user's chip was a button; Google's script was preloaded; one click opened Google's window once, inside the gesture, with `login_hint` carrying the remembered account; a refused window moved the chip to "Reconnect to Google"; the next click requested `prompt=select_account` without the hint; the saved copy and hint survived; a signed-out visitor made no Google request; the 375px layout had no horizontal overflow and a 48px control.
- **NOT RUN:** a completed real Google sign-in or quiet renewal; whether Google's window auto-closes for a granted session; Android Chrome, the installed app and iOS; storage events between real windows; `about.get` under `drive.file` against real Google; behavior after several hours or days; the consent screen's actual status. These stay open until observed on a real device.

### Connection configuration

Decided by the owner on 2026-11-01 and **built and tested only against a stand-in for Google, not yet on real Google**. The browser signs the person in with the narrow `drive.file` permission, creates their spreadsheet itself, and reads and writes it through the Sheets API. There is no script to deploy per person and no unverified-app warning.

What the owner's Google Cloud project needs for this route:

1. **Enable two APIs** for the project: the Google Sheets API and the Google Drive API. Without them every call is refused.
2. **Add the `drive.file` scope** under Data Access on the consent screen. Google lists it as non-sensitive. The earlier `spreadsheets` scope is no longer used.
3. **Keep the OAuth web client** and add every address the app is served from as an authorised JavaScript origin: `http://localhost:4173` for local use and, once published, the GitHub Pages address.
4. **Give the site its client ID.** A hosted build reads the repository variable `VITE_GOOGLE_CLIENT_ID`. A build without one asks the person on the Your data screen (Advanced) and remembers it on that device.

To try it: open the app, choose Continue with Google, allow the permission, then import a synthetic statement from Import. Reload and the figures open instantly from the copy on the device; Sync now checks them against the sheet. The first live run must also confirm the three things documentation did not settle: that `drive.file` alone lets the Sheets API read and write the sheet the app created, that the sheet is found again by its tag on another device, and that text written raw stays text. The Apps Script service and its deploy workflow stay in place until that run passes, then they are removed.

The sections below describe the previous route (a shared or per-person script) and are kept until that removal.

## Ground rules

- Use a new, empty spreadsheet that holds no real data. Do not share it. The real ledger workbook is not touched until the owner authorises that separately.
- Nothing from this guide is committed to the repository: not the script ID, spreadsheet ID, Cloud project number or client ID. They are locators, not secrets, but they name the owner's accounts.
- Never copy a client secret, an access token or a refresh token into the repository, a chat, an issue or a log. The browser flow used here needs no client secret, so do not create or keep one.
- This guide assumes the simplest arrangement for a proof: the owner's own script, the owner's own Cloud project, and the owner as the only caller. A shared script for other people is a different arrangement and stays open under FD-014.

## Steps

### 1. A synthetic spreadsheet

1. In Google Sheets create a new blank spreadsheet and name it `FolioDash synthetic test`.
2. Copy the long ID from its address (the part between `/d/` and `/edit`). Keep it somewhere private.

### 2. A standard Google Cloud project

Google's API for running a script needs a **standard** Cloud project shared by the script and the calling app. The default project Apps Script creates for each script is not enough.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project named `FolioDash`.
2. Open **Project settings** and copy the **project number** (digits only, not the project ID).

### 3. Link the script to that project

1. Open the script project at script.google.com (the one the repository pushes to) and choose **Project Settings** on the left.
2. Under **Google Cloud Project**, choose **Change project**, enter the project number, and choose **Set project**.
3. Note that this cannot be switched back to a default project, and the script will ask you to authorise again.

### 4. Enable the APIs

1. In the Cloud console open **APIs & Services > Library**, find **Google Apps Script API**, and enable it for the `FolioDash` project.
2. Also confirm the Apps Script API is on in your personal settings at script.google.com/home/usersettings. It already was for `clasp`.

### 5. The consent screen

1. In **APIs & Services**, open the OAuth consent screen (Google may now label it **Google Auth Platform**) and configure it.
2. Name the app `FolioDash`. The name appears in the consent prompt, so keep it clear.
3. Choose the **External** audience and keep the app in **Testing**. Add your own Google account as a test user.
4. Add the scope `https://www.googleapis.com/auth/spreadsheets`. The token must cover **all** scopes listed under **Project OAuth scopes** on the script's Overview page, so check that list matches. The pushed manifest asks only for this one.
5. Expect an "unverified app" warning when you consent. That is normal for a personal test app.

### 6. An OAuth client for the browser

1. Open **Credentials**, choose **Create credentials > OAuth client ID**, and pick **Web application**.
2. Under **Authorised JavaScript origins** add `http://localhost:4173`, which is where the local build is served. The real site's address is added later, and a shared `github.io` origin has its own trade-offs (see the architecture document).
3. Create it and copy the **client ID**. It is public by design. Do not download or keep a client secret.

### 7. Deploy the script as an API executable

1. Run `npm run build:apps-script`, then push the build from the folder that holds the link file: `cd dist/apps-script`, then `clasp push --force`. (The first push is already done.)
2. In the script editor choose **Deploy > New deployment**. Click the gear next to **Select type**, choose **API Executable**, and set **Who has access** to **Only myself**.
3. Choose **Deploy** and note the **deployment ID**. After any later code change, push again and update the deployment to a new version.

### 8. What to send back

- The OAuth client ID from step 6.
- The script's deployment ID from step 7, and the spreadsheet ID from step 1. These are locators, not secrets.
- A note of anything that did not match this guide.

Do not send tokens, secrets or screenshots that show them.

## Trying it

The connection screen is built (it is the **Connection** page of the app) and has been tested only with fakes and in the browser without signing in. To try it once the steps above are done:

1. Run `npm run build`, then `npm run preview`. It serves the build at `http://localhost:4173`, which must match the authorised origin from step 6 exactly: `localhost` and `127.0.0.1` count as different origins.
2. Open the Connection page, paste the client ID, the script or deployment ID and the spreadsheet ID (you can paste the addresses), and choose **Connect and check**.
3. Google asks you to sign in and grant spreadsheet access. The app then calls the `foliodashCheck` operation, which only reads. On success it reports whether the ledger tab holds any statements; on any problem it says which step to look at.

The three IDs can be remembered in this browser if you tick the box. A sign-in token is held in memory for the call and never stored. Google's identity script is loaded only when you choose **Connect and check**, not when the page opens; it is the one third-party script the app loads, and it needs an explicit exception if a content security policy is added later.

## What Google's documentation says to expect

- The call runs as the person whose token it carries, so Google enforces access to the spreadsheet. Service accounts are not supported.
- Only plain values (strings, numbers, booleans, lists, objects) pass in and out, which is how the service is built.
- A call can run for up to six minutes. A token with 360 seconds or less left should be refreshed first.
- The Apps Script API reports a script error in the response body, and an API-level problem as an HTTP error before the script runs.
- Only the script's owner can use the development mode that runs unreleased code.

## Undoing it

Remove FolioDash's access at your Google account's third-party access page, delete the OAuth client, undeploy the API executable, and delete the synthetic spreadsheet. The Cloud project can be deleted from its settings.
