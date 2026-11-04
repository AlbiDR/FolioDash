import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { type HistoryStatement, parseHistory, planAttach, planHistory, runHistory } from "../../../../applications/HistoryImport";
import { formatDateLong } from "../../../../core/IsoDate";
import type { LedgerState } from "../../../../core/Ledger";
import type { RecordResult, RemoteSave } from "../../../../applications/ImportModel";

type Phase =
  | { readonly name: "idle" }
  | { readonly name: "problem"; readonly message: string }
  | { readonly name: "ready"; readonly statements: readonly HistoryStatement[]; readonly alreadyRecorded: number; readonly toSave: readonly HistoryStatement[] }
  | { readonly name: "attaching" }
  | { readonly name: "attach-stopped"; readonly failure: RecordResult; readonly commandId: string; readonly statements: readonly HistoryStatement[] }
  | { readonly name: "saving"; readonly saved: number; readonly total: number }
  | { readonly name: "done"; readonly saved: number; readonly total: number; readonly attached: number }
  | { readonly name: "stopped"; readonly saved: number; readonly statement: HistoryStatement; readonly failure: RecordResult; readonly statements: readonly HistoryStatement[] }
  | { readonly name: "checked"; readonly message: string };

function describeFailure(failure: RecordResult): string {
  switch (failure.status) {
    case "not-saved":
      return `${failure.message} Nothing from this statement was recorded.`;
    case "stale":
      return "The ledger in the spreadsheet changed while this ran. Nothing from this statement was recorded.";
    case "rejected":
      return `The service did not accept this statement: ${failure.messages.join(" ")} Nothing from it was recorded.`;
    case "damaged":
      return `${failure.message} Do not record anything until the ledger is restored.`;
    case "saved-not-reloaded":
      return "This statement was recorded, but the ledger could not be read back.";
    case "unknown":
      return failure.message;
    case "recorded":
      return "";
  }
}

export function HistoryView(props: {
  readonly ledger: LedgerState;
  /** Present once a spreadsheet is connected. Without it nothing can be saved. */
  readonly save?: RemoteSave;
  readonly onLedger: (next: LedgerState) => void;
}): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [fileName, setFileName] = useState("");

  function plan(statements: readonly HistoryStatement[], ledger: LedgerState): void {
    const planned = planHistory(ledger, statements);
    setPhase(planned.ok ? { name: "ready", statements, alreadyRecorded: planned.alreadyRecorded, toSave: planned.toSave } : { name: "problem", message: planned.message });
  }

  async function choose(file: File): Promise<void> {
    setFileName(file.name);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setPhase({ name: "problem", message: "The file could not be read." });
      return;
    }
    const parsed = parseHistory(text);
    if (!parsed.ok) setPhase({ name: "problem", message: parsed.message });
    else plan(parsed.statements, props.ledger);
  }

  async function start(save: RemoteSave, statements: readonly HistoryStatement[], toSave: readonly HistoryStatement[]): Promise<void> {
    let latest = props.ledger;
    let attached = 0;
    try {
      // Months saved earlier may be missing their bank statement. Attach those first, in one step, then save the new months.
      if (props.ledger.snapshots.length > 0 && statements.some((statement) => statement.source !== undefined)) {
        setPhase({ name: "attaching" });
        const have = await save.statementDates();
        if (have === null) {
          setPhase({ name: "problem", message: "Your Google Sheet could not be read to check which bank statements are stored, so nothing was changed. Try again." });
          return;
        }
        const items = planAttach(props.ledger, statements, have);
        if (items.length > 0) {
          const commandId = save.newCommandId();
          const attachedResult = await save.attach(items, commandId, props.ledger.revision);
          if (attachedResult.status !== "recorded") {
            setPhase({ name: "attach-stopped", failure: attachedResult, commandId, statements });
            return;
          }
          latest = attachedResult.ledger;
          attached = items.length;
          props.onLedger(latest);
        }
      }
      setPhase({ name: "saving", saved: 0, total: toSave.length });
      const run = await runHistory<RecordResult>(
        async (item, expectedRevision) => {
          const result = await save.record({ date: item.date, statement: item.statement, commands: item.commands, ...(item.source === undefined ? {} : { source: item.source }) }, item.commandId, expectedRevision);
          return result.status === "recorded" ? { ok: true, ledger: result.ledger } : { ok: false, failure: result };
        },
        latest,
        toSave,
        (saved, total) => {
          setPhase({ name: "saving", saved, total });
        },
      );
      latest = run.ledger;
      props.onLedger(run.ledger);
      setPhase(run.stopped === null ? { name: "done", saved: run.saved, total: toSave.length, attached } : { name: "stopped", saved: run.saved, statement: run.stopped.statement, failure: run.stopped.failure, statements });
    } catch {
      props.onLedger(latest);
      setPhase({ name: "problem", message: "Something went wrong. Nothing more was sent. Reload, connect again, and choose the file again to resume." });
    }
  }

  async function checkAttach(save: RemoteSave, commandId: string, statements: readonly HistoryStatement[]): Promise<void> {
    setPhase({ name: "checked", message: "Checking your spreadsheet…" });
    try {
      const result = await save.check(commandId);
      if (result.status === "recorded") {
        props.onLedger(result.ledger);
        plan(statements, result.ledger);
      } else if (result.status === "not-recorded") {
        setPhase({ name: "checked", message: "The spreadsheet shows the bank statements were not attached. Choose the file again to try again." });
      } else if (result.status === "saved-not-reloaded") {
        setPhase({ name: "checked", message: "The bank statements were attached, but the ledger could not be read back. Choose the file again." });
      } else {
        setPhase({ name: "checked", message: result.message });
      }
    } catch {
      setPhase({ name: "checked", message: "The spreadsheet could not be checked. Try again shortly." });
    }
  }

  async function check(save: RemoteSave, statement: HistoryStatement, statements: readonly HistoryStatement[]): Promise<void> {
    setPhase({ name: "checked", message: "Checking your spreadsheet…" });
    try {
      const result = await save.check(statement.commandId);
      if (result.status === "recorded") {
        props.onLedger(result.ledger);
        plan(statements, result.ledger);
      } else if (result.status === "not-recorded") {
        setPhase({ name: "checked", message: "The spreadsheet shows that statement was not recorded. Choose the file again to resume from there." });
      } else if (result.status === "saved-not-reloaded") {
        setPhase({ name: "checked", message: "That statement was recorded, but the ledger could not be read back. Connect again on the Connection page, then choose the file again." });
      } else {
        setPhase({ name: "checked", message: result.message });
      }
    } catch {
      setPhase({ name: "checked", message: "The spreadsheet could not be checked. Try again shortly." });
    }
  }

  const busy = phase.name === "saving";
  return (
    <section aria-labelledby="history-heading" class="import">
      <h2 id="history-heading">Import history</h2>
      <p>
        Saves a whole history file to your connected spreadsheet, one statement at a time, in order. Each statement is
        checked with the same rules as a single import, and each save is read back. It can be repeated safely: it
        resumes after what the spreadsheet already holds.
      </p>
      {props.save === undefined && (
        <p class="notice" role="status">
          Connect to your spreadsheet on the Connection page first. Nothing can be saved until then.
        </p>
      )}
      <div class="field">
        <label for="history-file">History file (.json)</label>
        <input
          id="history-file"
          type="file"
          accept=".json,application/json"
          disabled={busy || props.save === undefined}
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (file !== undefined) void choose(file);
            input.value = "";
          }}
        />
      </div>

      {phase.name === "problem" && (
        <div class="review-problem" role="alert">
          <h3>This cannot be imported</h3>
          <p>{phase.message}</p>
        </div>
      )}
      {phase.name === "ready" && (
        <div class="review-adjustments" role="status">
          <h3>Ready</h3>
          <p>
            {fileName} holds {phase.statements.length} statements, from {formatDateLong(phase.statements[0]?.date as never)} to{" "}
            {formatDateLong(phase.statements[phase.statements.length - 1]?.date as never)}. Your spreadsheet already holds{" "}
            {phase.alreadyRecorded}; {phase.toSave.length} new {phase.toSave.length === 1 ? "month" : "months"} will be saved.
          </p>
          {phase.statements.some((statement) => statement.source !== undefined) && (
            <p>
              Each month in this file carries its exact bank statement. Any month your spreadsheet holds without its statement gets it attached, in one
              step. The figures already saved do not change, and a statement that does not reproduce its month is refused.
            </p>
          )}
          {phase.toSave.length === 0 && !(phase.alreadyRecorded > 0 && phase.statements.some((statement) => statement.source !== undefined)) ? (
            <p>Nothing to do: the spreadsheet already holds this whole history.</p>
          ) : (
            props.save !== undefined && (
              <button type="button" class="primary" onClick={() => void start(props.save as RemoteSave, phase.statements, phase.toSave)}>
                {phase.toSave.length > 0 ? `Save ${String(phase.toSave.length)} new ${phase.toSave.length === 1 ? "month" : "months"} and attach bank statements` : "Check and attach bank statements"}
              </button>
            )
          )}
        </div>
      )}
      <div aria-live="polite" class="status">
        {phase.name === "attaching" && <p>Checking which bank statements are stored, and attaching the missing ones… Keep this page open.</p>}
        {phase.name === "saving" && (
          <div>
          <p>
            Saving… {phase.saved} of {phase.total} saved. Keep this page open.
          </p>
          <div class="history-progress" role="progressbar" aria-label="Statements confirmed saved" aria-valuemin={0} aria-valuemax={Math.max(1, phase.total)} aria-valuenow={phase.saved} style={{ "--completion": `${String((phase.saved / Math.max(1, phase.total)) * 100)}%` }} />
          </div>
        )}
        {phase.name === "done" && (
          <p>
            Done: {phase.attached > 0 ? `${String(phase.attached)} bank statements attached, ` : ""}
            {phase.saved} {phase.saved === 1 ? "month" : "months"} saved to your spreadsheet and read back. The Overview now shows the ledger the spreadsheet
            holds.
          </p>
        )}
      </div>
      {phase.name === "stopped" && (
        <div class="review-problem" role="alert">
          <h3>Stopped after {phase.saved} saved</h3>
          <p>
            Statement dated {formatDateLong(phase.statement.date)}: {describeFailure(phase.failure)} Nothing after it was attempted.
          </p>
          {phase.failure.status === "unknown" && props.save !== undefined && (
            <>
              <p>Do not start again yet. Checking reads your spreadsheet and writes nothing.</p>
              <button type="button" onClick={() => void check(props.save as RemoteSave, (phase as { statement: HistoryStatement }).statement, phase.statements)}>
                Check what happened
              </button>
            </>
          )}
          {phase.failure.status !== "unknown" && <p>Choose the file again to resume from what the spreadsheet holds.</p>}
        </div>
      )}
      {phase.name === "attach-stopped" && (
        <div class="review-problem" role="alert">
          <h3>The bank statements were not attached</h3>
          <p>{describeFailure(phase.failure)}</p>
          {phase.failure.status === "unknown" && props.save !== undefined ? (
            <>
              <p>Do not start again yet. Checking reads your spreadsheet and writes nothing.</p>
              <button type="button" onClick={() => void checkAttach(props.save as RemoteSave, phase.commandId, phase.statements)}>
                Check what happened
              </button>
            </>
          ) : (
            <p>Choose the file again to try again.</p>
          )}
        </div>
      )}
      {phase.name === "checked" && (
        <div class="review-adjustments" role="status">
          <p>{phase.message}</p>
        </div>
      )}
    </section>
  );
}
