import type { JSX } from "preact";
import type { Dispatch, StateUpdater } from "preact/hooks";
import type { SessionState } from "../../../applications/session/session-model";
import type { IsoDate } from "../../../core/values/iso-date";
import type { ExpenseCommand, ExpenseDay } from "../../../core/expenses/work-expenses";
import { describeConnect } from "../features/account/account-text";
import { ExpensesView } from "./app-views";
import type { ExpenseSessionState } from "./session/expense/expense-session-core";
import type { Session } from "./session/session";

export function ExpensesRoute(props: {
  data: SessionState;
  expenseData: ExpenseSessionState;
  expenseDemo: readonly ExpenseDay[];
  setExpenseDemo: Dispatch<StateUpdater<readonly ExpenseDay[]>>;
  expenseDemoHistory: readonly ExpenseCommand[];
  setExpenseDemoHistory: Dispatch<StateUpdater<readonly ExpenseCommand[]>>;
  expenseConnectMessage: string;
  setExpenseConnectMessage: Dispatch<StateUpdater<string>>;
  setExpenseLocked: Dispatch<StateUpdater<boolean>>;
  setHidden: (hidden: boolean) => void;
  today: IsoDate;
  session: Session;
}): JSX.Element {
  const {
    data,
    expenseData,
    expenseDemo,
    setExpenseDemo,
    expenseDemoHistory,
    setExpenseDemoHistory,
    expenseConnectMessage,
    setExpenseConnectMessage,
    setExpenseLocked,
    setHidden,
    today,
    session,
  } = props;
  return (
    <ExpensesView
      days={data.mode === "signed-out" ? expenseDemo : expenseData.days}
      conflicts={data.mode === "signed-out" ? [] : expenseData.conflicts}
      history={data.mode === "signed-out" ? expenseDemoHistory : expenseData.commands}
      today={today}
      mode={data.mode}
      ready={data.mode === "signed-out" || expenseData.ready}
      pending={data.mode !== "signed-out" && expenseData.pending}
      onCheckPending={() => session.expenses.checkPending()}
      message={expenseConnectMessage || expenseData.message}
      onDirtyChange={setExpenseLocked}
      onRevealAmounts={() => {
        setHidden(false);
      }}
      onRefresh={() => session.expenses.refresh()}
      onConnect={async () => {
        const result = await session.connect();
        if (result.status === "connected") {
          setExpenseConnectMessage("");
          await session.expenses.refresh();
        } else {
          const described = describeConnect(result);
          setExpenseConnectMessage(`${described.title}. ${described.body}`);
        }
      }}
      onSave={async (request) => {
        if (data.mode !== "signed-out") return session.expenses.save(request);
        const entry = expenseDemo.find((day) => day.date === request.date);
        if ((entry?.revision ?? null) !== request.expectedRevision)
          return {
            status: "conflict",
            days: expenseDemo,
            message: "The demo day changed. Review it before saving again.",
          };
        const id = crypto.randomUUID();
        const days = [
          ...expenseDemo.filter((day) => day.date !== request.date),
          { date: request.date, amounts: request.amounts, revision: id },
        ].sort((a, b) => a.date.localeCompare(b.date));
        setExpenseDemoHistory((current) => [...current, { ...request, id }]);
        setExpenseDemo(days);
        return { status: "saved", days, viewUpdated: true };
      }}
    />
  );
}
