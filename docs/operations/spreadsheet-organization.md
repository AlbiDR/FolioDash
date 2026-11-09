# Spreadsheet organization

Implemented 2026-11-09 following the owner's request that the Google workbook be readable and consistently maintained as well as serving as storage. This refines FD-017/FD-019 presentation and the FD-020 generated-tab safeguards. It changes no financial definitions, source-retention decision, record schema or access scope.

## Readable workbook

The portfolio tab includes a workbook guide, latest totals, holdings and dated statement history, using the canonical `computeMetrics` results. Work expenses retains its daily entries, explicit partial/conflict states, weekly spending and annual recap, using the existing expense projection. Bank tabs retain their statement positions and existing typed date, amount, quantity, price and rate rules.

Generated views share Arial 10, navy headers, alternating pale rows, wrapped text, aligned numbers, explicit number formats, fitted column widths and automatically sized rows. Long portfolio/expense notices span the report width. Holdings and daily expense ranges have filter controls; bank source sections keep their existing subtotal structure. These are formatted ranges with basic filters, not Google named Table objects. Near-top table headings freeze with their preceding rows; deeper bank/portfolio tables freeze only the first two rows to avoid an oversized frozen pane.

Order and colours are maintained whenever a readable view is written:

1. Portfolio: navy.
2. Work expenses, when enabled: teal.
3. Bank statements, newest date first: blue.
4. Other personal tabs, retaining their relative order.
5. Hidden portfolio and enabled expense records: grey.

Technical records receive readable headers, fixed widths and one frozen header row. Their values, checksums, append history and concurrency named ranges are preserved. Organization never deletes record rows, financial tabs or other personal tabs. Source-backed Bank duplicates can be consolidated under the policy below; unrecognised contents are preserved.

## Organize spreadsheet

Your data replaces the vague **Tidy my sheet** action with **Organize spreadsheet** and describes its scope before the click. The action reads and validates portfolio history and sources, checks the expense store, then submits all rebuilt views, formatting and ordering in one Sheets `batchUpdate`. Damaged/unavailable history stops before layout submission. Expense history is not initialized by maintenance. Statementless months remain explicitly counted.

The previous implementation rebuilt only portfolio views through separate requests and could incorrectly say nothing changed after one succeeded and another failed. The new action submits one batch and reports an unconfirmed result if the response is lost. Repeating a derived-view rebuild is safe; this is not permission to retry financial commands.

Sheet-scoped developer metadata remains the ownership authority, including after a tab is renamed. An unmarked tab with the canonical title is adopted only when a formula-preserving read matches the generated values or a retained source representation. Comparison ignores leading/trailing display whitespace and trailing empty cells/rows; it does not ignore changed values or formulas. A differing tab stops the batch and is named in the result, with instructions to rename it in Google Sheets to preserve it before regenerating. Multiple ownership markers stop the batch unless they belong to source-backed Bank views and all copies match retained/generated contents. No numbered fallback view is created. The application does not infer authority to erase a tab from its name alone.

Conflicting unmarked contents are still left for review. The previous implementation could reuse a marked numbered view without reconciling its original; that gap is fixed as described below. This does not establish which build created the owner's live copies. Work-expense record initialization retains its separate safety behaviour when an unrelated tab occupies the records title; maintenance never initializes records.

## Verification and limits

Synthetic provider checks cover repeated runs without tab growth, exact legacy-view adoption, conflicting unmarked tabs, renamed/ambiguous ownership, lost responses, tab order and colours, expense inclusion, record-value preservation, refused atomic batches and integrity failure before submission. Existing financial, source-retention and expense correction tests continue to apply.

The provider fixture models ordering with Google's before-the-move index convention. Production requests use documented [sheet properties](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/sheets) and [developer metadata](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.developerMetadata). Synthetic provider tests do not prove actual Google formatting, merged/wrapped row heights, filter interaction, quota capacity or multi-device view races. A concurrent financial save may make a generated view temporarily older; financial records remain authoritative and the next view refresh rebuilds it.

Live Google, the owner's workbook, two-account, simultaneous-device and physical-device acceptance were not performed for this change. No private financial workbook was read or modified. Original-source retention (FD-004), backup/retention (FD-009), licensing (FD-011) and other existing acceptance gates remain open.

Local verification: `npm run verify` passed on macOS with Node 26.13.0, including 831 tests in 65 files, repository/contributor/punctuation checks, all TypeScript targets, lint, Pages composition tests, production build, PWA checks and Apps Script bundle verification. `git diff --check` passed. CI on Node 22/24 and deployment are separate evidence; no browser or live Google formatting acceptance is asserted by these checks.


## Consolidation and automatic maintenance amendment, 2026-11-09

The owner explicitly requested that the application consolidate the numbered Bank tabs and impose its own consistent formatting, and accepted automatic maintenance. This authorizes consolidation of verified, rebuildable Bank views, not financial-record deletion or changes to original evidence. It supersedes the earlier presentation policy that always left generated numbered copies in place.

For every Bank date with a retained, validated SOURCE record, the writer considers its canonical tab, numbered variants and ownership-marked view. One batched formula-preserving read checks all candidate contents against the current typed display and the retained raw source display. It prefers a verified canonical original, adopts its ownership marker if needed, and deletes redundant verified copies. A single ownership-marked generated copy may be replaced even when its values are stale: ownership already permits rebuilding that view. Multiple marked copies require content verification before any consolidation. A lone owned numbered view is renamed to its canonical title. Personal names on other owned views remain unchanged.

Consolidation, renaming, formatting and the full-layout completion marker are submitted atomically. Financial rows and predecessor named ranges are untouched. The checked SOURCE record remains the recovery path: **Organize spreadsheet** reconstructs the view. This is recovery of derived presentation, not restoration or replacement of financial history. Unmarked changes, formulas or extra data that do not match a retained/generated representation are never deleted; the result reports preserved candidates. A conflicting canonical title stops the batch. A lost response remains unconfirmed; the next maintenance run reads existing ownership and contents before doing anything else.

Bank presentation trims leading/trailing whitespace and non-breaking edge spaces, writes headings from the parser's canonical column labels, and assigns alignment by column meaning: text and identifiers left, subscription dates centre, numeric fields right, with middle vertical alignment. Identifiers stay text even when a source stored them as numbers. Price precision is three decimal places; average carrying price is four. The source's raw strings and formats remain exactly as retained in SOURCE records. Filled header styling spans the full data range, including blank heading cells. Column meaning, rather than a source cell's text/number encoding, owns the display.

A connection reads the spreadsheet's presentation-version marker with existing access. An absent or old version schedules one full organization after the normal quiet period, using fresh checked portfolio, source and expense records. The version is marked current only in the successful layout batch. Current versions avoid rewriting every month on each refresh. The check runs once per app session and is repeated on explicit reconnection; future presentation changes increment its version. Ordinary portfolio saves batch the summary and affected months together. Expense saves update their view and notify the shared session if projection maintenance failed. Failed maintenance remains pending for a later connection or save, without opening OAuth from background work, retrying financial commands or initializing expenses. Your data displays pending, organizing, current or needs-attention status. The manual action requests an immediate complete rebuild.

Maintenance and queued portfolio-view writes are serialized within an app session. Multi-device/manual-edit races are not a Google compare-and-swap guarantee: a racing structural change can refuse the batch, while financial records remain unchanged. Old installed clients can still perform their old behaviour until updated. Use the app's existing **Reload to update** control before assessing this version; do not erase the device copy.

The Google response reader also accepts an omitted default-valued sheet ID of zero, including its sheet-scoped metadata location, as documented by Google's sheet-operation samples. Synthetic checks cover this response shape, original raw bank tabs plus generated copies, a lone numbered owned view, formulas/changed values that must be preserved, atomic refusal, lost responses, automatic version upgrades, repeated connections without repeated rewrites, expense-view retries, and source/ledger/concurrency-marker preservation. These checks do not prove the state of the owner's live workbook.

Updated local verification: `npm run verify` passed on macOS / Node 26.13.0 with 841 tests in 65 files, including a local expense save paused against an in-flight full layout batch. If a local portfolio/expense save completes during organization, a fresh rebuild is queued after activity settles. Known expense corrections missing from Google stop maintenance before submission. This is local orchestration evidence, not simultaneous-device provider proof.

A fresh-profile headless Chromium check of the production interface, using only an invented local device copy and blocking external requests, confirmed the automatic-maintenance explanation and organizer control at 1280 pixels and at 320 pixels with 200% root text size; neither page had horizontal overflow. The screenshots stayed in ignored local acceptance output. This did not connect to Google or verify sheet rendering. `git diff --check` passed; CI and deployment remain separate runs.
