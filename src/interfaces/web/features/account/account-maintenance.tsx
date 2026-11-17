import type { JSX } from "preact";
import { Result } from "./account-result";
import type { AccountShared } from "./use-account-controller";

export function AccountHistoryRecovery(p: { readonly shared: AccountShared }): JSX.Element {
  const { x } = p.shared;
  const {
    state,
    pending,
    pendingChange,
    busy,
    confirmHistoryRestore,
    setConfirmHistoryRestore,
    historyRestoreMessage,
    restoreHistory,
    checkHistoryRestore,
    signedOut,
  } = x;
  return (
    <>
      {!signedOut &&
        state.workbook !== null &&
        (state.recoveryTarget != null || pendingChange !== null || historyRestoreMessage !== null) && (
          <section class="account-section" aria-labelledby="account-recover-history-heading">
            <h2 id="account-recover-history-heading" class="card-title">
              Restore the previous history
            </h2>
            <p>
              Restore the portfolio and bank statements from before the most recent earlier-history insertion. Changes
              made since then will no longer appear in the current portfolio. Work expenses are not changed.
            </p>
            {state.recoveryTarget != null && pendingChange === null && (
              <>
                <label class="check">
                  <input
                    type="checkbox"
                    checked={confirmHistoryRestore}
                    disabled={busy}
                    onChange={(event) => {
                      setConfirmHistoryRestore(event.currentTarget.checked);
                    }}
                  />{" "}
                  I understand that this replaces the current portfolio history.
                </label>
                <button
                  type="button"
                  disabled={busy || !confirmHistoryRestore || state.sheet !== "ok"}
                  onClick={() => {
                    void restoreHistory();
                  }}
                >
                  {pending === "restore-history" ? "Restoring…" : "Restore previous history"}
                </button>
              </>
            )}
            {pendingChange !== null && (
              <>
                <p>A previous history change needs checking before another portfolio save.</p>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => {
                    void checkHistoryRestore();
                  }}
                >
                  {pending === "restore-history" ? "Checking…" : "Check what happened"}
                </button>
              </>
            )}
            <Result message={historyRestoreMessage} />
          </section>
        )}
    </>
  );
}

export function AccountHealth(p: { readonly shared: AccountShared }): JSX.Element {
  const { x } = p.shared;
  const { state, pending, busy, checkMessage, verify, signedOut } = x;
  return (
    <>
      {!signedOut && state.workbook !== null && (
        <section class="account-section account-health" aria-labelledby="account-health-heading">
          <h2 id="account-health-heading" class="card-title" tabIndex={-1}>
            Verify your history
          </h2>
          <p class="card-subtitle">
            Checks your saved records and replays attached bank statements against your figures. Manually entered
            statements have no bank document to replay. This check does not change your Google Sheet or device copy.
          </p>
          <button type="button" disabled={busy} onClick={() => void verify()}>
            {pending === "verify" ? "Checking your history…" : "Check my history"}
          </button>
          <Result message={checkMessage} />
        </section>
      )}
    </>
  );
}

export function AccountOrganize(p: { readonly shared: AccountShared }): JSX.Element {
  const { x } = p.shared;
  const { state, pending, busy, tidyMessage, tidy, signedOut } = x;
  return (
    <>
      {!signedOut && state.workbook !== null && (
        <section class="account-section account-maintenance" aria-labelledby="account-maintenance-heading">
          <h2 id="account-maintenance-heading" class="card-title" tabIndex={-1}>
            Organize your spreadsheet
          </h2>
          <p class="card-subtitle">
            Your spreadsheet is maintained automatically after saves and checked for layout upgrades when you connect.
            Use this action to rebuild all views now.
          </p>
          {state.organization !== undefined && (
            <p role="status" class="hint">
              {state.organization.message}
            </p>
          )}
          <p class="hint">
            Tabs are ordered: portfolio, work expenses, newest bank statement first, then your other tabs and hidden
            records. Matching duplicate bank tabs are consolidated from retained statements. Unrecognised or edited tabs
            are preserved for review. Financial records and exact imported sources are kept.
          </p>
          <button type="button" disabled={busy} onClick={() => void tidy()}>
            {pending === "tidy" ? "Organizing your spreadsheet…" : "Organize spreadsheet"}
          </button>
          <Result message={tidyMessage} />
        </section>
      )}
    </>
  );
}

export function AccountRestore(p: { readonly shared: AccountShared }): JSX.Element {
  const { props, x } = p.shared;
  const { state, pending, busy, confirmRestore, setConfirmRestore, restore, statements, canRestore } = x;
  return (
    <>
      {canRestore && (
        <div class="card">
          <h3 class="card-title">Restore your Google Sheet</h3>
          <p class="card-subtitle">
            {state.sheet === "missing" ? "Your sheet cannot be opened." : "Your sheet is empty."} This device still has{" "}
            {statements} {statements === 1 ? "statement" : "statements"}.
          </p>
          <p>
            Restoring writes the copy on this device{" "}
            {state.sheet === "missing" ? "into a new Google Sheet" : "back into your empty Google Sheet"}, then reads it
            back and checks it. The portfolio copy holds figures but not original bank statements, so those statements
            need to be imported again.{" "}
            {props.expenseCommands
              ? "The saved expense correction history on this device is also recovered into a replacement workbook; existing expense records are preserved."
              : "This device has no saved expense correction history to restore. Downloaded expense backups are restored separately below."}{" "}
            Checkpoints are not restored into a replacement workbook: this device keeps them, read only, on the{" "}
            <a href="#checkpoints">Checkpoints screen</a>.
          </p>
          <label class="check">
            <input
              type="checkbox"
              disabled={busy}
              checked={confirmRestore}
              onChange={(event) => {
                setConfirmRestore(event.currentTarget.checked);
              }}
            />{" "}
            Yes, restore my Google Sheet from this device
          </label>
          <button type="button" class="primary" disabled={busy || !confirmRestore} onClick={() => void restore()}>
            {pending === "restore" ? "Restoring and checking…" : "Restore from this device"}
          </button>
        </div>
      )}
    </>
  );
}
