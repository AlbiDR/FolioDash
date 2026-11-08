# Privacy policy

Status: **Page added 2026-11-07 on the owner's instruction to leave the consent screen's Testing status. Not legal advice.** The text of record is the static page [`src/interfaces/web/public/privacy/index.html`](../../src/interfaces/web/public/privacy/index.html), shipped at `https://albidr.github.io/FolioDash/privacy/` by the site deployment and linked from the connect card, Your data and the README. It is not duplicated here, so there is one text to keep true. This document holds the evidence behind each claim and what is still open. Google's reason for it is in [Google setup](google-setup.md#remembered-connection-fd-022-2026-11-07).

## What was decided and what is still open

1. **Operator: decided.** `ADR`, with the GitHub handle `AlbiDR` (2026-11-07). Google requires an app to represent accurately who manages it.
2. **Contact: decided.** `aalbi97+foliodash@gmail.com` (2026-11-07), chosen knowing it is public in this repository's history and on the page. The `+foliodash` tag lets the owner filter mail to it; it does not hide the address behind it.
3. **Jurisdiction and legal basis: not researched.** The owner chose to proceed. The interface uses Italian and euro formatting, so EU rules may apply to the operator. The page states what the app does; it does not claim to meet any law.
4. **Google's wording: checked, with gaps.** Google's [User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), [policy compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance) and [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) pages were read on 2026-11-07. None gives a required sentence for a privacy policy, and the Limited Use rules are stated for Sensitive and Restricted scopes while `drive.file` is non-sensitive. The page states the same commitments in plain words. The Drive-specific policy and Google's OAuth policies page were not read.
5. **Domain: accepted by the console.** Google's brand verification page says the policy must be on the same domain as the app's home page and linked on the consent screen, with the domains verified in Google Search Console if the app goes through verification. On 2026-11-07 the console accepted `albidr.github.io` as an authorized domain and the policy address as the privacy link, and allowed publishing without a Search Console step. Google did ask once a logo was added on 2026-11-08: it required Search Console ownership of the home page (see `docs/operations/google-setup.md`). A custom domain remains a possible later choice.
6. **Publication authority: given and used.** The owner asked to complete leaving Testing (2026-11-07). The page is live at `https://albidr.github.io/FolioDash/privacy/` and is the consent screen's privacy link; the app was then published to production.

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
| Data sent to Google travels over HTTPS | Every Google endpoint in the bundle is an `https://` URL; the site's canonical address is `https://albidr.github.io/FolioDash/` |
| The device copy is not encrypted | FD-018: a plain copy, with encryption at rest and a passcode offered and not chosen; the Your data page says anyone using the unlocked browser could see it |
| GitHub hosts the static files | Pages deployment, [GitHub Actions](github-actions.md). What GitHub logs is governed by GitHub's own statement, which was not reviewed here |

## Keeping it true

Any later change to what the app collects or stores, such as analytics, a new scope, a server or a new storage key, updates the page and the table above first. The page promises to ask for agreement before Google data is used in a new way, so that change is not only an edit. The build checks that the page ships, contains no script, carries the contact, links back to the app, links only to expected sites and is linked from the app (`scripts/verify-pwa.ts`). The service worker serves it as itself rather than as the app (`standalonePageKey`).
