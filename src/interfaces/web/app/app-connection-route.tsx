import type { JSX } from "preact";
import type { Dispatch, StateUpdater } from "preact/hooks";
import type { SessionState } from "../../../applications/session/session-model";
import { describeConnect } from "../features/account/account-text";
import { rememberClientId } from "../../../adapters/browser/connection/client-id";
import { AccountView, ExpenseDataTools } from "./app-views";
import { browserPrivacyStorage } from "./app-model";
import type { CheckpointSessionState } from "./session/checkpoint/checkpoint-session-core";
import type { ExpenseSessionState } from "./session/expense/expense-session-core";
import type { Session } from "./session/session";

export function ConnectionRoute(props: {
  data: SessionState;
  expenseData: ExpenseSessionState;
  checkpointData: CheckpointSessionState;
  now: number;
  clientConfigured: boolean;
  setClientId: Dispatch<StateUpdater<string>>;
  setExpenseLocked: Dispatch<StateUpdater<boolean>>;
  session: Session;
}): JSX.Element {
  const { data, expenseData, checkpointData, now, clientConfigured, setClientId, setExpenseLocked, session } = props;
  return (
    <>
      <AccountView
        key={data.workbook?.id ?? "signed-out"}
        state={data}
        now={now}
        clientConfigured={clientConfigured}
        build={__APP_BUILD__}
        expenseCommands={expenseData.commands.length}
        checkpointCount={
          checkpointData.active.length +
          checkpointData.preserved.reduce((total, entry) => total + entry.active.length, 0)
        }
        revisionSave={session.save}
        actions={{
          connect: () => session.connect(),
          refresh: () => session.refresh(),
          reconnect: (options) => session.reconnect(options),
          restore: () => session.restoreFromDevice(),
          verify: () => session.verifyHistory(),
          tidy: () => session.tidySheet(),
          forget: () => {
            session.forget();
          },
          setClientId: (text) => {
            const kept = rememberClientId(text, browserPrivacyStorage);
            if (kept) setClientId(text.trim());
            return kept;
          },
        }}
      />
      {data.mode !== "signed-out" && (
        <ExpenseDataTools
          days={expenseData.days.length}
          commands={expenseData.commands.length}
          conflicts={expenseData.conflicts.length}
          initialized={expenseData.initialized}
          ready={expenseData.ready && data.mode === "online" && data.sheet === "ok"}
          pending={expenseData.pending}
          connected={data.mode === "online" && data.sheet === "ok"}
          message={expenseData.message}
          onLock={setExpenseLocked}
          onExport={() => session.expenses.exportBackup()}
          onPreview={(text) => {
            const history = session.expenses.previewBackup(text);
            return history === null
              ? null
              : {
                  days: history.days.length,
                  commands: history.commands.length,
                  conflicts: history.conflicts.length,
                };
          }}
          onRestore={(text) => session.expenses.restoreBackup(text)}
          onCheck={() => session.expenses.checkPending()}
          onSync={async () => {
            if (session.state.mode !== "online" || session.state.sheet !== "ok") {
              const result = await session.refresh();
              if (result.status !== "connected") {
                const described = describeConnect(result);
                throw new Error(`${described.title}. ${described.body}`);
              }
            }
            await session.expenses.refresh();
            if (!session.expenses.state.ready)
              throw new Error(
                session.expenses.state.message ||
                  "Your expense records could not be checked. Keep the backup selected and check again.",
              );
          }}
        />
      )}
    </>
  );
}
