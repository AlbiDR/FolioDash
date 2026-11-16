// Local browser harness: all records, workbook IDs and provider responses are synthetic.
import { h, render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { FakeGoogle } from "./FakeGoogle";
import { createWorkbook } from "../../src/adapters/google/GoogleWorkbook";
import { parseIsoDate } from "../../src/core/IsoDate";
import { ExpenseSession } from "../../src/interfaces/web/app/expenseSession";
import { ExpensesView } from "../../src/interfaces/web/features/expenses/ExpensesView";
import { PrivacyProvider } from "../../src/interfaces/web/presentation/privacy/privacy";

const google = new FakeGoogle();
const today = parseIsoDate("2026-11-04");
let blockNextCheck = false;

function Harness(props: { readonly session: ExpenseSession }) {
  const [, tick] = useState(0);
  useEffect(() => props.session.subscribe(() => { tick(value => value + 1); }), [props.session]);
  const state = props.session.state;
  if (today === null) return null;
  return h(PrivacyProvider, { hidden: false, children: h(ExpensesView, {
    days: state.days, history: state.commands, conflicts: state.conflicts, today, mode: "online", ready: state.ready, message: state.message, pending: state.pending,
    onCheckPending: () => props.session.checkPending(),
    onSave: request => props.session.save(request),
    onRefresh: () => props.session.refresh(),
  }) });
}

async function start(): Promise<void> {
  const created = await createWorkbook(google.client, google.token);
  if (!created.ok) throw new Error("Synthetic workbook setup failed");
  let ids = 0;
  const session = new ExpenseSession({ rest: async call => {
    try { return await google.client(call); } catch (error) {
      if (blockNextCheck && call.url.includes(":append")) { blockNextCheck = false; google.faults.push({ match: /^GET .*\/values\//u, network: true }); }
      throw error;
    }
  }, newId: () => `synthetic-${String(++ids)}`, access: () => Promise.resolve({ ok: true as const, token: google.token, workbook: created.value }) });
  await session.refresh();
  const root = document.getElementById("root");
  if (root === null) throw new Error("Synthetic mount missing");
  render(h(Harness, { session }), root);
  Object.assign(window, { syntheticExpenses: {
    refuseNextWrite: () => { google.faults.push({ match: /:append$/u, status: 403 }); },
    loseNextAnswer: () => { google.faults.push({ match: /:append$/u, network: true, applyFirst: true }); },
    loseAnswerAndFirstCheck: () => { blockNextCheck = true; google.faults.push({ match: /:append$/u, network: true, applyFirst: true }); },
    commands: () => session.state.commands.length,
    pending: () => session.state.pending,
    appends: () => google.calls.filter(call => /:append$/u.test(call)).length,
  } });
}
void start().catch((error: unknown) => {
  const root = document.getElementById("root");
  if (root !== null) root.textContent = `Synthetic setup error: ${error instanceof Error ? error.message : "unknown"}`;
});
