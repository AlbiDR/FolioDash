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

Technical records receive readable headers, fixed widths and one frozen header row. Their values, checksums, append history and concurrency named ranges are preserved. Organization never deletes record rows, financial tabs or other personal tabs. It does not remove old numbered tabs whose ownership is unknown.

## Organize spreadsheet

Your data replaces the vague **Tidy my sheet** action with **Organize spreadsheet** and describes its scope before the click. The action reads and validates portfolio history and sources, checks the expense store, then submits all rebuilt views, formatting and ordering in one Sheets `batchUpdate`. Damaged/unavailable history stops before layout submission. Expense history is not initialized by maintenance. Statementless months remain explicitly counted.

The previous implementation rebuilt only portfolio views through separate requests and could incorrectly say nothing changed after one succeeded and another failed. The new action submits one batch and reports an unconfirmed result if the response is lost. Repeating a derived-view rebuild is safe; this is not permission to retry financial commands.

Sheet-scoped developer metadata remains the ownership authority, including after a tab is renamed. An unmarked tab with the canonical title is adopted only when a formula-preserving read exactly matches the generated values, ignoring trailing empty cells and rows. A differing tab stops the batch and is named in the result, with instructions to rename it in Google Sheets to preserve it before regenerating. A copied/conflicting ownership marker also stops the batch. No numbered fallback view is created. The application does not infer authority to erase a tab from its name alone.

This deliberately leaves conflicting old tabs for review. It does not claim to have diagnosed or removed the owner's existing duplicates, or prove every source of their creation. Work-expense record initialization retains its separate safety behaviour when an unrelated tab occupies the records title; maintenance never initializes records.

## Verification and limits

Synthetic provider checks cover repeated runs without tab growth, exact legacy-view adoption, conflicting unmarked tabs, renamed/ambiguous ownership, lost responses, tab order and colours, expense inclusion, record-value preservation, refused atomic batches and integrity failure before submission. Existing financial, source-retention and expense correction tests continue to apply.

The provider fixture models ordering with Google's before-the-move index convention. Production requests use documented [sheet properties](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/sheets) and [developer metadata](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.developerMetadata). Synthetic provider tests do not prove actual Google formatting, merged/wrapped row heights, filter interaction, quota capacity or multi-device view races. A concurrent financial save may make a generated view temporarily older; financial records remain authoritative and the next view refresh rebuilds it.

Live Google, the owner's workbook, two-account, simultaneous-device and physical-device acceptance were not performed for this change. No private financial workbook was read or modified. Original-source retention (FD-004), backup/retention (FD-009), licensing (FD-011) and other existing acceptance gates remain open.

Local verification: `npm run verify` passed on macOS with Node 26.13.0, including 831 tests in 65 files, repository/contributor/punctuation checks, all TypeScript targets, lint, Pages composition tests, production build, PWA checks and Apps Script bundle verification. `git diff --check` passed. CI on Node 22/24 and deployment are separate evidence; no browser or live Google formatting acceptance is asserted by these checks.
