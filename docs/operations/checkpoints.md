# Checkpoints

A checkpoint is the total value of the portfolio's funds on a day between two statements. It is **value only**: it includes any money paid in or taken out, and it has no gain, percentage or return. It never changes a statement, a figure or the ledger.

Decision: FD-026 (the owner's private register).

## What the person sees

- **Record a checkpoint** on the Checkpoints screen (`#checkpoints`, reached from the Portfolio screen, from the empty-portfolio card and from Your data): a date no later than today, an amount in Italian notation and an optional note of at most 120 characters that cannot start with a formula character.
- **The Performance chart** draws one diamond per day: the latest checkpoint of that day, with a note when several share it. Diamonds are never joined to each other or to the statement lines, and the chart still opens on the latest statement.
- **The list** on the Checkpoints screen shows every active checkpoint, newest first. **Withdraw** takes one off the chart after a confirmation; a correction is a withdrawal followed by a new checkpoint, which may use the same date. Both stay in the log.
- After a failed integrity check (an altered, missing or incomplete log) the chart draws no markers, while the screen keeps listing the device copy.
- The signed-out demo shows two sample checkpoints so the screen and the chart can be seen.

## Where the data lives

- A hidden tab `_FolioDash checkpoints` in the person's own spreadsheet, one command per row (`schema`, `payload`, `checksum`). Commands are `add` (id, date, cents, note) and `void` (id, target). The log is append-only.
- Developer metadata under its own key `foliodash.checkpoints`: a `records-v1` marker on the tab and an `enabled-v1` anchor on the ledger tab. A missing records tab with its anchor is reported as damaged and is never recreated, so a deleted log cannot be silently replaced by an empty one. The ledger and the work expenses ignore this key, and this feature ignores theirs.
- The same id with identical content counts once, so a retried save cannot duplicate it. The same id with different content makes the log damaged. A log is readable up to 4,500 commands; adding stops at 1,500 `add` commands (sized so a whole log, with every note at its longest and fully escaped and every withdrawal, still fits the device copy); a withdrawal is accepted whenever its target is still active, and withdrawing something already withdrawn writes nothing.

## Safe saving

1. The unsent command is written to the device as a **receipt** and read back before anything is sent. If the device cannot keep it, nothing is sent.
2. The receipt sits in its own key per workbook, separate from the history copy, so another window refreshing its copy cannot erase it.
3. Every save runs inside one exclusive Web Locks section. A browser without Web Locks, or a lock another window holds, refuses the save; reading still works.
4. While any receipt exists for the workbook, no window can save or withdraw. **Check outcome** only reads Google; it never sends the save again.
5. A confirmed command is persisted in the history copy and read back before its receipt is removed. Any failure keeps the receipt. A device copy is never replaced by an older view of the log, so a window that read earlier cannot overwrite what another saved.
6. An outcome known not to have appended anything (a withdrawal that turned into a no-op, or a refusal before any write) first records that on the receipt, then clears it through a saved copy; a later check finishes the cleanup without needing the command to exist in Google. A timeout or lost answer is never treated that way; it stays unknown.
7. A receipt that cannot be read is treated as an unresolved save, never as an empty one: nothing can be saved and the record is left untouched.
8. Before every append the log is read again and must still hold every checkpoint this device knows, including what another window stored in the shared device copy; otherwise nothing is sent. Forget or an account change during the reads or while waiting for the lock cancels the save before anything is sent or stored.
9. A withdrawal of something another device already withdrew writes nothing, but this window's list and device copy catch up at once. An absent log stays uninitialised through a failed first save, so the workbook never becomes unwritable.
10. Forget this device, sign-out and an account change cancel in-flight work and attribute nothing to the new state.

## Recovery and privacy

- Checkpoints are **not** restored when a workbook is recreated from this device. Copies bound to another workbook are kept, read only and copyable as text, and are never overwritten by the replacement workbook. Only Forget this device removes them.
- Copies, receipts and the lock name carry the build's storage prefix, so the synthetic acceptance build can never see, change or forget ordinary checkpoints.
- Amounts hide immediately with the privacy toggle, in the chart, the readout, the table and the list; the preserved copy's text view and its copy leave amounts out while they are hidden.

## Evidence and open items

Checked with synthetic data only: the log format and its failure paths on the Google test double, the device store and lock, the session (ambiguous saves, reload, two windows, workbook change and restart, Forget, storage refusal, an unreadable receipt, a stale window, a known checkpoint missing from Google), the chart markers, the rendered interaction audit, and a rendered checkpoint journey (`npm run audit:checkpoints`) that drives the real screen and session in Chrome with the real Web Locks API: invalid and valid saves, several checkpoints on a day, withdrawal with confirmation, a lost answer, a reload, a delayed arrival, a refusal, an unreadable receipt, a deleted log, a replaced workbook and privacy.

**Not verified:** behaviour against real Google (initialisation, hidden tab, concurrent appends), Web Locks across real browser windows, how the chart looks with markers on a phone and a physical device, and CI rendering on the first run.
