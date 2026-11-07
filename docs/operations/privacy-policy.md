# Privacy policy (draft for owner review)

Status: **Draft. Not published, not linked from the app, and not legal advice.** Created 2026-11-07 because Google's branding help requires a privacy-policy link for external production apps (see [Google setup](google-setup.md#remembered-connection-fd-022-2026-11-07)). Nothing here goes live until the owner decides the open items and authorises publication.

## Open before this can be published

1. **Operator name.** The policy must say who runs FolioDash: a personal name, a handle or an entity. The repository owner is `AlbiDR`; whether to publish a real name is the owner's choice.
2. **Contact.** A way to reach the operator about privacy. It will be public, so choose an address meant to be. GitHub issues are public and unsuited to personal requests. No address has been chosen or invented here.
3. **Jurisdiction and legal basis.** Not researched. The interface uses Italian and euro formatting, so EU rules may apply to the operator; get advice if that matters. This draft states what the app does, not that it meets any law.
4. **Google's required wording.** The Limited Use sentence below is the form Google asks for under its API Services User Data Policy, written from memory of that policy. Check it against the [current policy](https://developers.google.com/terms/api-services-user-data-policy) before publishing. That page was not fetched.
5. **Where it is hosted.** Google's branding help says the homepage and policy must sit on a domain you own and have verified. Whether `albidr.github.io` can be verified and accepted is not confirmed. A custom domain would be a cost and a separate decision.
6. **Publication authority.** The working agreement requires explicit task authority to publish. A page added to the web app ships to the live site on the next push to `main`.

## Where each statement comes from

Every claim in the policy below, with the evidence it rests on. If the app changes, this table says what to re-check.

| Statement | Evidence |
|---|---|
| The browser talks to Google directly; FolioDash has no server of its own | `browserSession.ts` sends requests with `fetch` to Google only; decision FD-017 |
| Only Google's Drive and Sheets APIs, its sign-in script and a link to your own sheet are involved | Hosts found in the built bundle on 2026-11-07: `www.googleapis.com`, `sheets.googleapis.com`, `accounts.google.com`, `docs.google.com` (the "Open in Google Sheets" link). `script.googleapis.com` is not in the bundle |
| No analytics, advertising, tracking or cookies of FolioDash's own | Source search for analytics, tracker, beacon and cookie terms found none; no external fonts or stylesheets in `index.html` |
| One spreadsheet, seen only through the `drive.file` permission | FD-017; scope constant in `session.ts` |
| The account's email address is read once, to remember which account is yours | `AccountHint.ts` calls Drive's about endpoint for the email only; FD-022 |
| The monthly bank statement is saved as read, including the holder name and contract numbers, in your sheet and never in the device copy | FD-019 |
| Excel files are read in the browser | `ImportView.tsx` reads the chosen file with `file.arrayBuffer()` and parses it locally |
| The device keeps a copy of portfolio and expense records, Google access of at most an hour, the remembered account, display choices and cached app files | Storage keys `foliodash.ledger.v1`, `foliodash.expenses.v1`, `foliodash.google-session.v1`, `foliodash.account-hint.v1`, `foliodash.client.v1`, `foliodash.privacy.v1`, `foliodash.sidebar.v1`; service worker cache; FD-018, FD-022 |
| Forget this device removes the copies, Google access and remembered account, and asks Google to revoke the token if one is held | `Session.forgetDevice` clears the ledger and expense copies, the access store and the hint store, and calls `revoke` when a token is held |
| It does not remove display choices or a client ID you typed | `forgetDevice` does not touch `foliodash.privacy.v1`, `foliodash.sidebar.v1` or `foliodash.client.v1` |
| An expense backup is a file you download | `ExpenseDataTools.tsx` creates it with `URL.createObjectURL`; nothing is uploaded |
| Google's script loads when a connection exists or you connect, never for the demo | Observed in the browser pane on 2026-11-07: no Google request for a signed-out visitor, script preloaded for a remembered connection |
| GitHub hosts the static files | Pages deployment, [GitHub Actions](github-actions.md). What GitHub logs is governed by GitHub's own statement, which was not reviewed here |

## The policy text

The text below is what would be published. Square brackets are the open items above.

---

# FolioDash privacy policy

Last updated: [date of publication]

FolioDash is a personal dashboard for your investment statements and your work expenses. It runs in your web browser. It is operated by [operator name]. Contact: [contact].

## The short version

- Your data lives in a Google spreadsheet in your own Google Drive, and in a copy on your own device.
- FolioDash has no server. It does not collect, receive, store or sell your data, and its developer cannot see your portfolio or your expenses.
- FolioDash uses no analytics, no advertising and no tracking, and sets no cookies of its own.
- The demo uses invented data and needs no account.

## What FolioDash accesses in your Google account

- **One permission, `drive.file`.** It lets FolioDash create one spreadsheet in your Google Drive and read and write that spreadsheet. It does not let FolioDash see your other files.
- **Your account's email address.** FolioDash reads it once so it can tell Google which account to use next time, and Google does not ask you to choose again. It is kept only on your device.

FolioDash does not receive your name, contacts, email or any other Drive file.

## What is stored, and where

**In your Google spreadsheet:** your portfolio records (fund names, values, money in and out, and comments you enter), the monthly bank statements you import exactly as the bank file wrote them, and your work-expense entries. A bank statement can include your name and your contract or account numbers. The spreadsheet belongs to you. You decide whether to share, edit or delete it.

**On your device, in your browser's storage:** a copy of your portfolio and expense records, without the bank-statement identifiers; Google access that lasts at most an hour; the email address of the account to use; the Google client ID, only if you typed one; your display choices, such as hiding amounts; and a cached copy of the app's own files so it works offline.

**Files you choose:** Excel exports are read inside your browser. FolioDash does not upload the file. The statement as read is saved to your spreadsheet. If you download an expense backup, it is a file saved to your device and nowhere else.

## Who else is involved

- **Google** provides sign-in, Drive and Sheets, under [Google's privacy policy](https://policies.google.com/privacy). Google's sign-in script is loaded in your browser when you connect, or when you return with a saved connection. It is not loaded for the demo.
- **GitHub** hosts the app's files. Like any web host, it may log requests, such as your IP address, under [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- Nobody else. Nothing is shared with anyone, sold or used for advertising.

## Google user data

FolioDash's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. Information from Google is used only to provide FolioDash's features to you. It is not transferred to anyone else, not used for advertising and not read by people.

## Your choices

- **Forget this device** (on the Your data page) removes the saved copies, Google access and remembered account from this device and asks Google to cancel any access it holds. Your spreadsheet is not touched. Display choices and a client ID you typed stay until you clear this site's data in your browser.
- **Delete your data** by deleting the spreadsheet in your Google Drive. FolioDash holds nothing else to delete.
- **Withdraw permission** at any time at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Children

FolioDash is not directed at children.

## Changes

If this policy changes, the date above changes. Earlier versions are kept in the project's public history at github.com/AlbiDR/FolioDash.

## Contact

[contact]

---

## How it would be published

1. The owner settles the open items and says to publish.
2. The text becomes a static page in the web app's public folder, so it ships in the verified build and the offline cache, linked from Your data and the README.
3. The page's address goes on the consent screen's Branding page. Confirm the console accepts the domain; that is the unverified part.
4. Any later change to what the app collects, such as analytics, a new scope or a server, updates this document and the table above first.
