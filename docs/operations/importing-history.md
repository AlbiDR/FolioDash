# Starting a portfolio from Excel history

Status: **Implemented locally, with synthetic automated and headless Chrome checks on 2026-11-04. A synthetic Google save/read-back/replay run passed from the Android emulator on 2026-11-04; physical-device and deployed-origin acceptance remain NOT RUN. See [acceptance evidence](onboarding-acceptance.md).**

## User journey

A new user connects Google, then chooses bank Excel files on Import. Both Bank statements and Whole history accept multiple `.xlsx` exports or a workbook containing a bank statement on each sheet. Whole history always uses the complete history review. A single file with several sheets also enters that review automatically. A single-sheet file retains the existing single-statement review, and manual entry remains available.

The import screen also offers Google connection in place, so a person who chooses files first can connect without navigating away from the review. A denied or failed connection keeps the review visible. Real OAuth behavior is still a separate acceptance gate.

No prepared JSON is required. Importing an existing FolioDash JSON history remains available under an advanced disclosure on Whole history. A JSON export/backup action is still not implemented; accepting JSON does not imply a complete portable backup workflow.

1. **Read locally.** Each file uses the existing bounded XLSX reader and Fideuram interpreter. Original XLSX bytes are not uploaded. Invalid files and recognizable holdings sheets that fail validation are reported. Unrecognized sheets, including notes, are listed explicitly as not included.
2. **Check the selection and dates.** Each recognized sheet has its own include control and editable date. A full date in a sheet name can propose its date: `YYYY-MM-DD`, `DD-MM-YYYY` or `DD.MM.YYYY`. A multi-sheet workbook's creation/modification date is never assigned to its individual statements, even if only one sheet is recognized. A standalone bank export keeps the existing file-date proposal. All proposals require review.
3. **Resolve preflight problems.** Missing dates, duplicate dates, invalid selected sheets and previously recorded months block review. This ordinary history importer permits one statement per calendar month, appended after the latest saved month. The separate earlier-history prototype below has its own full-history review; inserting between saved months and multiple observations within a month remain unsupported. The same canonical date check is used for ordinary preflight and financial application. Users explicitly exclude unwanted exports; a bulk control excludes months on or before the latest recorded month. Nothing is silently merged or overwritten.
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

## Money-movement review refinement, 2026-11-15

The shared manual/Excel review now distinguishes starting balances from later money movements. Its first statement asks for net invested on the valuation date: total paid in minus all money already received. Later statements show the actual review period and explain that price changes are already reflected in fund values. The global movement question is scoped to existing funds; new funds and full sales are reviewed separately.

The amount fields use Money added to this fund and Money received from this fund, with EUR units and help linked to each input. Help covers contributions, partial sales, cash distributions and switches, and explicitly asks for the whole amount received rather than just the profit. Full-sale fields use Total money received from the sale. The two directions remain separate; the interface does not net them or infer them from valuation changes.

When some funds had movements, No money moved for this fund explicitly fills both fields with zero for an unaffected fund. Blanks still block a complete preview. Changing the global choice retains entered draft amounts, but a No money moved preview ignores them under the existing canonical command rules. The confirmation summary uses plain-language states such as Starting balance, Still held and Fully sold instead of internal action names.

The movement pair reflows into two columns when there is room, stacks on a phone, and uses shared Presence reveal/collapse, field/button feedback and summary arrival motion. Reduced motion retains the same fields and immediate financial values. No financial calculations, command schemas, storage format, save confirmation or unknown-outcome reconciliation changed.

Synthetic browser coverage uses generated three-month history in a signed-out local production build, stops before any save, and exercises first-month opening amounts followed by second-month movements. Checks cover blank-answer refusal, separate 200-in/50-out with canonical net invested of 1.150,00 EUR, explicit zeroes for the other fund, toggling and retained drafts, hidden amounts excluded from a No-movement preview, control feedback on desktop/phone, 200% text overflow and reduced motion. New-fund/closure/reopening provider journeys, physical devices and screen readers remain separate acceptance work.

## Earlier-history prototype, 2026-11-16

Status: **implemented and locally verified; deployment is tracked separately.** The review can collect earlier manual statements or one supported bank statement per workbook, in chronological order, then explicitly review the interval to the former first month. It shows a before-and-after preview; one guarded revision records the reviewed prefix and revised source decisions. Duplicate months and insertion between saved months remain refused. If a later fund lifecycle cannot be replayed from the saved facts and decisions, preparation stops rather than inventing movements.

The version-2 ledger retains earlier committed rows and records the effective bank sources for each revision. Unchanged sources are referenced by committed row and checksum instead of copied in full on every later save. The released version-1 reader tested refuses the upgraded ledger but may show a generic damaged-sheet message rather than telling the user to update; the confirmation screen advises updating other devices. A version-1 revision appended after an upgrade is treated as damaged rather than silently accepted. A selected prior revision can be restored as a new revision, including its sources, only against the current reviewed revision. The recovery control warns that newer portfolio changes cease to be current. This does not settle the portable-backup, original-file retention, or retention-policy decisions.

A device retains a non-financial pending command receipt before submitting a revision change. If the reply is lost, the app checks the receipt; a missing command is not by itself proof of failure. When the predecessor fingerprint is available, a guarded no-financial-change revision can atomically claim that predecessor and fence the delayed request. The app only declares the original unrecorded after the fence is read back. The named-range race and fence rely on the same Google atomicity/uniqueness assumptions as FD-021; the synthetic provider tests do not prove them on Google. Other devices and unsupported old writers require separate care.

Local synthetic evidence so far includes canonical replay, source references and corruption, recovery, stale reviews, lost replies, a delayed write fenced before arrival, and a race against the released version-1 writer. The local Chromium audit reviews manual entry and the comparison on desktop and phone without saving. Authenticated Google insertion and recovery were subsequently checked as described below. Concurrent requests reaching the same Google claim, physical devices and assistive technologies remain unverified.

### Isolated Google acceptance, 2026-11-16

A local acceptance build using the separately named synthetic workbook was connected by the owner to the test Google account. Starting with an empty synthetic portfolio, a manually entered January 2026 statement was saved, a manual December was inserted and read back after reload, and the prior January revision was restored through the confirmation control. A generated bank workbook was then inserted as December; the user-reviewed date was set to 2025-12-31 for the synthetic case. History check replayed the attached December source exactly while identifying the manual January as having no bank document.

A second manual insertion for November changed the reviewed December and January net-invested and gain figures. The app saved all three months, and history check replayed the revised bank-source decisions. After restoring the prior two-month revision, history check again replayed the original bank source exactly. This was an authenticated Google read/write/read-back and recovery run in the isolated local acceptance build, not a deployed-origin or physical-device test. It does not prove simultaneous Google writer races, uncertain-write fencing under real network failures, or full original-XLSX retention. No normal FolioDash workbook was used in this test.

In the same isolated workbook, two local browser tabs reviewed changes against the same saved history and submitted them close together: a normal February append was recorded, and the earlier-history review was rejected as stale. The resulting three-month history was healthy and replayed its one attached source. This is evidence of the observed same-browser, real-Google outcome; the timing does not establish that both requests reached Google's atomic claim concurrently, and it is not a physical two-device proof.
