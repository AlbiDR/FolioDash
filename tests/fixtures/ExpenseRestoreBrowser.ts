// Local browser harness: all records, workbook IDs and provider responses are synthetic.
import { h, render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { FakeGoogle } from "./FakeGoogle";
import { createWorkbook } from "../../src/adapters/google/GoogleWorkbook";
import { parseIsoDate } from "../../src/core/IsoDate";
import { toEuroCents, ZERO_CENTS } from "../../src/core/Money";
import { ExpenseSession } from "../../src/interfaces/web/app/expenseSession";
import { ExpenseDataTools } from "../../src/interfaces/web/features/expenses/ExpenseDataTools";

const donorGoogle = new FakeGoogle();
const google = new FakeGoogle();
let blockNextCheck = false;
/** The expense log tab is the only hidden tab recovery creates; the readable view tab is separate. */
const isHiddenLogCreation = (request: Record<string, unknown>): boolean => (request["addSheet"] as { properties?: { hidden?: boolean } } | undefined)?.properties?.hidden === true;

function Harness(props: { readonly session: ExpenseSession }) {
  const [, tick] = useState(0);
  useEffect(() => props.session.subscribe(() => { tick(value => value + 1); }), [props.session]);
  const state = props.session.state;
  return h(ExpenseDataTools, {
    days: state.days.length, commands: state.commands.length, conflicts: state.conflicts.length, initialized: state.initialized, ready: state.ready, connected: true, message: state.message, pending: state.pending,
    onExport: () => props.session.exportBackup(),
    onPreview: text => { const history = props.session.previewBackup(text); return history === null ? null : { days: history.days.length, commands: history.commands.length, conflicts: history.conflicts.length }; },
    onRestore: text => props.session.restoreBackup(text),
    onCheck: () => props.session.checkPending(),
    onSync: () => props.session.refresh(),
    onLock: () => undefined,
  });
}

async function sessionFor(provider: FakeGoogle, prefix: string, intercept: boolean): Promise<ExpenseSession> {
  const created = await createWorkbook(provider.client, provider.token);
  if (!created.ok) throw new Error("Synthetic workbook setup failed");
  let ids = 0;
  const session = new ExpenseSession({
    rest: async call => {
      try { return await provider.client(call); } catch (error) {
        if (intercept && blockNextCheck && call.url.includes(":batchUpdate")) { blockNextCheck = false; provider.faults.push({ match: /^GET .*\/values\//u, network: true }); }
        throw error;
      }
    },
    newId: () => `${prefix}-${String(++ids)}`,
    access: () => Promise.resolve({ ok: true as const, token: provider.token, workbook: created.value }),
  });
  await session.refresh();
  return session;
}

async function start(): Promise<void> {
  // A donor workbook supplies a real backup; the audited store starts empty.
  const donor = await sessionFor(donorGoogle, "synthetic-donor", false);
  const date = parseIsoDate("2026-11-03");
  const commute = toEuroCents(450);
  if (date === null || commute === null) throw new Error("Invalid synthetic setup");
  const saved = await donor.save({ date, amounts: [commute, ZERO_CENTS, ZERO_CENTS, ZERO_CENTS, ZERO_CENTS], expectedRevision: null });
  if (saved.status !== "saved") throw new Error("Synthetic donor save failed");
  const backup = donor.exportBackup();
  const session = await sessionFor(google, "synthetic-restore", true);
  const setupBatches = google.batches.filter(batch => batch.some(isHiddenLogCreation)).length;
  const root = document.getElementById("root");
  if (root === null) throw new Error("Synthetic mount missing");
  render(h(Harness, { session }), root);
  Object.assign(window, { syntheticRestore: {
    /** Selects the donor backup through the real file control, as a person would. */
    chooseBackup: (text: string = backup) => {
      const input = document.querySelector<HTMLInputElement>("input[type=file]");
      if (input === null) throw new Error("File control missing");
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], "foliodash-work-expenses.json", { type: "application/json" }));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    corruptedBackup: () => backup.replace("450", "451"),
    loseAnswerAndFirstCheck: () => { blockNextCheck = true; google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true }); },
    commands: () => session.state.commands.length,
    pending: () => session.state.pending,
    /** Recovery creates the log in one batch, so a second such batch would be a resubmission. */
    recoveryBatches: () => google.batches.filter(batch => batch.some(isHiddenLogCreation)).length - setupBatches,
    writes: () => google.calls.filter(call => /:batchUpdate$|:append$/u.test(call)).length,
  } });
}
void start().catch((error: unknown) => {
  const root = document.getElementById("root");
  if (root !== null) root.textContent = `Synthetic setup error: ${error instanceof Error ? error.message : "unknown"}`;
});
