# Starting a portfolio from Excel history

Status: **Implemented locally, with synthetic automated and headless Chrome checks on 2026-11-04. A synthetic Google save/read-back/replay run passed from the Android emulator on 2026-11-04; physical-device and deployed-origin acceptance remain NOT RUN. See [acceptance evidence](onboarding-acceptance.md).**

## User journey

A new user connects Google, then chooses bank Excel files on Import. Both Bank statements and Whole history accept multiple `.xlsx` exports or a workbook containing a bank statement on each sheet. Whole history always uses the complete history review. A single file with several sheets also enters that review automatically. A single-sheet file retains the existing single-statement review, and manual entry remains available.

The import screen also offers Google connection in place, so a person who chooses files first can connect without navigating away from the review. A denied or failed connection keeps the review visible. Real OAuth behavior is still a separate acceptance gate.

No prepared JSON is required. Importing an existing FolioDash JSON history remains available under an advanced disclosure on Whole history. A JSON export/backup action is still not implemented; accepting JSON does not imply a complete portable backup workflow.

1. **Read locally.** Each file uses the existing bounded XLSX reader and Fideuram interpreter. Original XLSX bytes are not uploaded. Invalid files and recognizable holdings sheets that fail validation are reported. Unrecognized sheets, including notes, are listed explicitly as not included.
2. **Check the selection and dates.** Each recognized sheet has its own include control and editable date. A full date in a sheet name can propose its date: `YYYY-MM-DD`, `DD-MM-YYYY` or `DD.MM.YYYY`. A multi-sheet workbook's creation/modification date is never assigned to its individual statements, even if only one sheet is recognized. A standalone bank export keeps the existing file-date proposal. All proposals require review.
3. **Resolve preflight problems.** Missing dates, duplicate dates, invalid selected sheets and previously recorded months block review. The current kernel permits one statement per calendar month, appended after the latest saved month; multiple observations within a month and inserting earlier history are not introduced here. The same canonical date check is used for preflight and financial application. Users explicitly exclude unwanted exports; a bulk control excludes months on or before the latest recorded month. Nothing is silently merged or overwritten.
4. **Review in date order.** The app sorts selected statements oldest first. The existing cash questions collect opening net invested, contributions, full withdrawal proceeds, distributions, switches, closures and reopenings as required by the canonical kernel. These facts are not inferred from changes in market value. Each review step prepares local state only. Previous statement retains entered answers; later steps revalidate against the revised local preview.
5. **Confirm the complete history.** The final screen lists the selected statements and explains that saving includes their sheet contents and reviewed cash decisions in the user's private Google spreadsheet. No financial writes occur before this confirmation.
6. **Save and read back.** Statements use the existing remote-save port in order, with a distinct retained command ID for each statement and the revision returned by the preceding save. The whole selection is not one transaction. Earlier confirmed statements remain saved if a later statement stops.

## Interruption and recovery

- A known failure before commit can resume with the same command ID. Confirmed statements are not sent again.
- A lost response or a saved statement whose ledger could not be reloaded stops the sequence. Check what happened reads the command outcome without writing. Only a recorded/read-back result or a confirmed not-recorded result allows continuation.
- A stale revision requires a new review against current history. Rejected or damaged history stops the run and offers no automatic retry.
- The original revision is checked again before sending a reviewed selection or resuming it. Background/session changes cannot silently rebase the reviewed financial decisions.
- While reviewing, saving or reconciling an uncertain outcome, the Excel selector and competing import method are disabled. Internal navigation and hash-route changes preserve the active review, and the advanced JSON importer is unavailable. Browser unload protection requests the browser's normal leave-page prompt. Closing or reloading anyway discards the in-memory draft; no durable draft or background continuation is claimed.
- Returning to selection explicitly resets the review. Previously confirmed saves stay in the spreadsheet and must be excluded from the next selection. The bulk exclusion control helps resume a reselected set of files after reloading current history.

## Bounds and evidence

The selection is provisionally bounded to 240 files, 60 MiB of compressed input, 240 recognized statements and 300,000 retained cells. Files are parsed sequentially to bound peak decompression; each file also retains the XLSX reader's existing archive/XML limits. These are local safeguards, not measured Android capacity guarantees under FD-012.

`npm run verify` includes synthetic coverage for full-date extraction, independent file dates, combined-workbook metadata exclusion, ignored-sheet disclosure, malformed/formula sheets, chronological ordering, duplicate/missing dates, existing months, explicit exclusions, and selection size/cell bounds. Existing kernel, history runner and commit tests remain the financial/saving contract checks.

Local browser evidence used the actual ImportView, CashQuestions and ExcelHistoryView in headless Chrome, synthetic XLSX files built by the test fixture writer, and a remote-save stand-in using the real financial kernel. It exercised:

- Multiple original exports and a workbook with three statements, including a missing date and duplicate-date correction.
- Zero writes through all cash review steps, answers retained through previous/next navigation, and one final confirmation.
- A lost acknowledgement after commit, an unknown outcome before commit, a known failure on the second statement, saved-but-not-reloaded and stale-history outcomes. Outcome checks and continuation preserved command IDs and did not duplicate confirmed writes.
- Internal route-change protection and release of that protection after returning to selection.
- Preflight and cash-review layout at 320, 390 and 1440 CSS pixels, and completed-history layout at 320, 390, 430, 844 and 1440 pixels, with no page-level horizontal overflow.

This is simulated browser/save evidence. It does not prove live Google authorization, concurrent real-device writes, quotas, Android file selection/WebAPK behavior, iOS behavior, or support for other banks' layouts. Before release, repeat the flow with synthetic files through the real Google connection on supported Mac and Android devices, including denied/expired consent, offline interruption and recovery.
