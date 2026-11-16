# Checkpoints

A checkpoint is the total value of the portfolio's funds on a day between two statements. It is **value only**: it includes any money paid in or taken out, and it has no gain, percentage or return. It never changes a statement, a figure or the ledger.

Decision: FD-026 (the owner's private register).

## What the person sees

- **Record a checkpoint** on the Checkpoints screen (`#checkpoints`, reached from the Portfolio screen): a date no later than today, an amount in Italian notation and an optional note of at most 120 characters that cannot start with a formula character.
- **The Performance chart** draws one diamond per day: the latest checkpoint of that day, with a note when several share it. Diamonds are never joined to each other or to the statement lines, and the chart still opens on the latest statement.
- **The list** on the Checkpoints screen shows every active checkpoint, newest first. **Withdraw** takes one off the chart after a confirmation; a correction is a withdrawal followed by a new checkpoint, which may use the same date. Both stay in the log.
- The signed-out demo shows two sample checkpoints so the screen and the chart can be seen.

## Where the data lives

- A hidden tab `_FolioDash checkpoints` in the person's own spreadsheet, one command per row (`schema`, `payload`, `checksum`). Commands are `add` (id, date, cents, note) and `void` (id, target). The log is append-only.
- Developer metadata under its own key `foliodash.checkpoints`: a `records-v1` marker on the tab and an `enabled-v1` anchor on the ledger tab. A missing records tab with its anchor is reported as damaged and is never recreated, so a deleted log cannot be silently replaced by an empty one. The ledger and the work expenses ignore this key, and this feature ignores theirs.
- The same id with identical content counts once, so a retried save cannot duplicate it. The same id with different content makes the log damaged. A log is readable up to 20,000 commands; adding stops at 5,000 `add` commands; a withdrawal is accepted whenever its target is still active, and withdrawing something already withdrawn writes nothing.

## Safe saving

1. The unsent command is written to the device as a **receipt** and read back before anything is sent. If the device cannot keep it, nothing is sent.
2. The receipt sits in its own key per workbook, separate from the history copy, so another window refreshing its copy cannot erase it.
3. Every save runs inside one exclusive Web Locks section. A browser without Web Locks, or a lock another window holds, refuses the save; reading still works.
4. While any receipt exists for the workbook, no window can save or withdraw. **Check outcome** only reads Google; it never sends the save again.
5. A confirmed command is persisted in the history copy and read back before its receipt is removed. Any failure keeps the receipt.
6. An outcome known not to have appended anything (a withdrawal that turned into a no-op, or a refusal before any write) clears its receipt through a saved copy. A timeout or lost answer is never treated that way; it stays unknown.
7. Forget this device, sign-out and an account change cancel in-flight work and attribute nothing to the new state.

## Recovery and privacy

- Checkpoints are **not** restored when a workbook is recreated from this device. Copies bound to another workbook are kept, read only and copyable as text, and are never overwritten by the replacement workbook. Only Forget this device removes them.
- Copies, receipts and the lock name carry the build's storage prefix, so the synthetic acceptance build can never see, change or forget ordinary checkpoints.
- Amounts hide immediately with the privacy toggle, in the chart, the readout, the table and the list.

## Evidence and open items

Checked with synthetic data only: the log format and its failure paths on the Google test double, the device store and lock, the session (ambiguous saves, reload, two windows, workbook change and restart, Forget, storage refusal), the chart markers, and the rendered interaction audit.

**Not verified:** behaviour against real Google (initialisation, hidden tab, concurrent appends), Web Locks across real browser windows, how the chart looks with markers on a phone and a physical device, and CI rendering on the first run.
