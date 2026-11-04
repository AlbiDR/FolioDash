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

**Concurrency limitation:** these are detection/reconciliation improvements, not an atomic compare-and-swap. Another device can still write after the final read and before the append. Direct Sheets API storage has no shared service lock in this design. Do not claim this release makes simultaneous cross-device financial writes safe. A properly verified serialization/conditional-write mechanism needs a further architecture decision before that guarantee. Real Google write/read-back and interactive-device proof are not supplied by unit tests.

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
