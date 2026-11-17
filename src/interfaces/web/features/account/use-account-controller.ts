import { useRef, useState } from "preact/hooks";
import type { ConnectOutcome } from "../../../../applications/session/session-model";
import { type Message, describeConnect, describeRestore, describeTidy, describeVerify } from "./account-text";
import type { AccountViewProps } from "./account-types";

/** The state and actions of the account screen. The sections only draw what this returns. */
export function useAccountController(props: AccountViewProps) {
  const { state, actions } = props;
  const [pending, setPending] = useState<"connect" | "sync" | "restore" | "restore-history" | "verify" | "tidy" | null>(
    null,
  );
  const [uncertainRecovery, setUncertainRecovery] = useState<string | null>(null);
  const pendingChange = uncertainRecovery ?? state.pendingRevision ?? null;
  const busy = pending !== null || pendingChange !== null;
  const forgetButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const connectionHeading = useRef<HTMLHeadingElement>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [checkMessage, setCheckMessage] = useState<Message | null>(null);
  const [tidyMessage, setTidyMessage] = useState<Message | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmHistoryRestore, setConfirmHistoryRestore] = useState(false);
  const [historyRestoreMessage, setHistoryRestoreMessage] = useState<Message | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  const [clientText, setClientText] = useState("");
  const [clientError, setClientError] = useState(false);

  async function run(action: () => Promise<ConnectOutcome>, kind: "connect" | "sync"): Promise<void> {
    if (busy) return;
    setPending(kind);
    setMessage(null);
    try {
      const outcome = await action();
      setMessage(outcome.status === "superseded" ? null : describeConnect(outcome));
    } catch {
      setMessage({
        good: false,
        title: "Something went wrong",
        body: "The result could not be confirmed. Check your spreadsheet and connection before trying again.",
      });
    } finally {
      setPending(null);
    }
  }

  async function restore(): Promise<void> {
    if (busy) return;
    setPending("restore");
    setMessage(null);
    try {
      const outcome = await actions.restore();
      const described = describeRestore(outcome);
      // A restore never carries checkpoints over, and it should not seem to: say where they stayed.
      setMessage(
        outcome.status === "restored" && (props.checkpointCount ?? 0) > 0
          ? {
              ...described,
              body: `${described.body} Your checkpoints were not restored. They stay on this device, read only, on the Checkpoints screen.`,
            }
          : described,
      );
      setConfirmRestore(false);
    } catch {
      setMessage({
        good: false,
        title: "Something went wrong",
        body: "Nothing on this device was changed. Try again.",
      });
    } finally {
      setPending(null);
    }
  }

  async function restoreHistory(): Promise<void> {
    const save = props.revisionSave;
    if (
      busy ||
      !confirmHistoryRestore ||
      state.workbook === null ||
      state.recoveryTarget == null ||
      save?.recoverRevision === undefined
    )
      return;
    const id = save.newCommandId();
    setPending("restore-history");
    setHistoryRestoreMessage(null);
    try {
      const result = await save.recoverRevision(state.recoveryTarget, id, state.ledger.revision, state.workbook.id);
      if (result.status === "recorded") {
        setConfirmHistoryRestore(false);
        setHistoryRestoreMessage({
          good: true,
          title: "Previous history restored",
          body: "The portfolio and its attached bank statements were restored and checked.",
        });
      } else if (result.status === "unknown" || result.status === "saved-not-reloaded") {
        setUncertainRecovery(id);
        setHistoryRestoreMessage({
          good: false,
          title: "Check the recovery",
          body: "The result is not confirmed. Check what happened before trying again.",
        });
      } else
        setHistoryRestoreMessage({
          good: false,
          title: "History not restored",
          body:
            result.status === "rejected"
              ? result.messages.join(" ")
              : result.status === "stale"
                ? "Your history changed. Review the latest data before restoring."
                : result.message,
        });
    } catch {
      setUncertainRecovery(id);
      setHistoryRestoreMessage({
        good: false,
        title: "Check the recovery",
        body: "The result is not confirmed. Check what happened before trying again.",
      });
    } finally {
      setPending(null);
    }
  }

  async function checkHistoryRestore(): Promise<void> {
    const save = props.revisionSave;
    if (pendingChange === null || save === undefined || state.workbook === null || pending !== null) return;
    setPending("restore-history");
    try {
      const result = await save.check(pendingChange, state.workbook.id);
      if (result.status === "recorded") {
        setUncertainRecovery(null);
        setConfirmHistoryRestore(false);
        setHistoryRestoreMessage({
          good: true,
          title: "History change confirmed",
          body: "The portfolio was read back and checked.",
        });
      } else if (result.status === "not-recorded") {
        setUncertainRecovery(null);
        setHistoryRestoreMessage({
          good: false,
          title: "History not restored",
          body: "The spreadsheet shows that the recovery was not recorded. You can review it again.",
        });
      } else
        setHistoryRestoreMessage({
          good: false,
          title: "Check the recovery",
          body:
            result.status === "cannot-tell"
              ? result.message
              : "The recovery was recorded but the spreadsheet could not be reloaded.",
        });
    } catch {
      setHistoryRestoreMessage({
        good: false,
        title: "Check the recovery",
        body: "The spreadsheet could not be checked. Try again shortly.",
      });
    } finally {
      setPending(null);
    }
  }

  async function verify(): Promise<void> {
    if (busy) return;
    setPending("verify");
    setCheckMessage(null);
    try {
      setCheckMessage(describeVerify(await actions.verify()));
    } catch {
      setCheckMessage({
        good: false,
        title: "Something went wrong",
        body: "The result could not be confirmed. Check your spreadsheet and connection before trying again.",
      });
    } finally {
      setPending(null);
    }
  }

  async function tidy(): Promise<void> {
    if (busy) return;
    setPending("tidy");
    setTidyMessage(null);
    try {
      setTidyMessage(describeTidy(await actions.tidy()));
    } catch {
      setTidyMessage({
        good: false,
        title: "Something went wrong",
        body: "The result could not be confirmed. Check your spreadsheet and connection before trying again.",
      });
    } finally {
      setPending(null);
    }
  }

  const signedOut = state.mode === "signed-out";
  const statements = state.ledger.snapshots.length;
  const canRestore =
    (state.sheet === "missing" || state.sheet === "emptied") && (statements > 0 || (props.expenseCommands ?? 0) > 0);
  return {
    state,
    actions,
    pending,
    pendingChange,
    busy,
    forgetButton,
    keepButton,
    connectionHeading,
    message,
    setMessage,
    checkMessage,
    tidyMessage,
    confirmRestore,
    setConfirmRestore,
    confirmHistoryRestore,
    setConfirmHistoryRestore,
    historyRestoreMessage,
    confirmForget,
    setConfirmForget,
    clientText,
    setClientText,
    clientError,
    setClientError,
    run,
    restore,
    restoreHistory,
    checkHistoryRestore,
    verify,
    tidy,
    signedOut,
    statements,
    canRestore,
  };
}

/** What each section of the screen receives: the screen props and the controller's state and actions. */
export interface AccountShared {
  readonly props: AccountViewProps;
  readonly x: ReturnType<typeof useAccountController>;
}
