import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { planExcelHistory, type ExcelHistoryEntry, type ExcelHistoryReview } from "../../../../applications/ExcelHistory";
import { runHistory, type HistoryStatement } from "../../../../applications/HistoryImport";
import type { RecordResult, RemoteSave } from "../../../../applications/ImportModel";
import type { LedgerState } from "../../../../core/Ledger";
import { formatDateLong, parseIsoDate, type IsoDate } from "../../../../core/IsoDate";
import { applyImport, statementDateIssue } from "../../../../core/ImportPlan";
import { Amount } from "../../presentation/privacy/privacy";
import { CashQuestions, type CashReviewDraft } from "./CashQuestions";

type Stage = "dates" | "questions" | "confirm" | "saving" | "stopped" | "done";
type Failure = Exclude<RecordResult, { status: "recorded" }>;
type DatedEntry = ExcelHistoryEntry & { readonly date: IsoDate };

export function ExcelHistoryView(props: {
  readonly review: ExcelHistoryReview;
  readonly ledger: LedgerState;
  readonly save?: RemoteSave;
  readonly onRecord: (ledger: LedgerState) => void;
  readonly onLock: (locked: boolean) => void;
}): JSX.Element {
  const [entries, setEntries] = useState(props.review.entries);
  const [stage, setStage] = useState<Stage>("dates");
  const [ordered, setOrdered] = useState<readonly DatedEntry[]>([]);
  const [base, setBase] = useState(props.ledger);
  const [preview, setPreview] = useState(props.ledger);
  const [statements, setStatements] = useState<readonly HistoryStatement[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const drafts = useRef<Record<string, CashReviewDraft>>({});
  const [saved, setSaved] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const plan = planExcelHistory(entries, props.ledger);
  const locked = stage !== "dates" && stage !== "done";

  useEffect(() => { props.onLock(locked); }, [locked, props.onLock]);
  useEffect(() => () => { props.onLock(false); }, [props.onLock]);
  useEffect(() => { heading.current?.focus(); }, [stage, reviewIndex]);
  useEffect(() => {
    if (!locked) return;
    const leave = (event: BeforeUnloadEvent): void => { event.preventDefault(); };
    const navigate = (event: MouseEvent): void => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor === null || anchor.getAttribute("href")?.startsWith("#") !== true) return;
      if (anchor.getAttribute("href") === "#main-content" || anchor.getAttribute("href") === window.location.hash) return;
      // Keep the reviewed selection and command receipts mounted during a financial save/recovery.
      event.preventDefault();
      event.stopPropagation();
      setMessage("Finish this import or use the return button below before leaving this screen.");
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", navigate, true);
    };
  }, [locked]);

  function change(id: string, patch: Partial<ExcelHistoryEntry>): void {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }

  function begin(): void {
    if (!plan.ok || props.review.problems.length > 0) return;
    setOrdered(plan.entries);
    setBase(props.ledger);
    setPreview(props.ledger);
    setStatements([]);
    drafts.current = {};
    setReviewIndex(0);
    setSaved(0);
    setMessage("");
    setStage("questions");
  }

  function previous(): void {
    const index = stage === "confirm" ? ordered.length - 1 : reviewIndex - 1;
    let state = base;
    for (const statement of statements.slice(0, index)) {
      const applied = applyImport(state, statement.statement, statement.date, statement.commands, statement.commandId);
      if (!applied.ok) return;
      state = applied.state;
    }
    setPreview(state);
    setReviewIndex(index);
    setStage("questions");
  }

  async function saveRemaining(save: RemoteSave): Promise<void> {
    if (busy.current) return;
    if (props.ledger.revision !== base.revision) {
      setMessage("Your saved history changed after this review. Return to statement selection and review against the latest history before saving.");
      return;
    }
    busy.current = true;
    setStage("saving");
    setMessage("");
    const offset = saved;
    try {
      const result = await runHistory<Failure>(async (statement, revision) => {
        try {
          const outcome = await save.record(statement, statement.commandId, revision);
          return outcome.status === "recorded" ? { ok: true, ledger: outcome.ledger } : { ok: false, failure: outcome };
        } catch {
          return { ok: false, failure: { status: "unknown", message: "The save response was lost. Check what happened before continuing." } };
        }
      }, base, statements.slice(offset), (count) => { setSaved(offset + count); });
      setBase(result.ledger);
      props.onRecord(result.ledger);
      setFailure(result.stopped?.failure ?? null);
      setStage(result.stopped === null ? "done" : "stopped");
    } finally {
      busy.current = false;
    }
  }

  async function check(save: RemoteSave): Promise<void> {
    const statement = statements[saved];
    if (statement === undefined || busy.current) return;
    busy.current = true;
    setChecking(true);
    setMessage("Checking your spreadsheet without writing…");
    try {
      const outcome = await save.check(statement.commandId);
      if (outcome.status === "recorded") {
        setBase(outcome.ledger);
        props.onRecord(outcome.ledger);
        setSaved(saved + 1);
        setFailure(null);
        setStage(saved + 1 === statements.length ? "done" : "stopped");
        setMessage("The statement was saved and read back. You can continue with the remaining statements.");
      } else if (outcome.status === "not-recorded") {
        setFailure({ status: "not-saved", message: "The spreadsheet confirms that this statement was not recorded. You can resume safely." });
        setMessage("");
      } else if (outcome.status === "saved-not-reloaded") {
        setFailure({ status: "saved-not-reloaded" });
        setMessage("");
      } else setMessage(outcome.message);
    } catch {
      setMessage("The spreadsheet could not be checked. Nothing more was sent. Try checking again when connected.");
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }

  const current = ordered[reviewIndex];
  const uncertain = failure?.status === "unknown" || failure?.status === "saved-not-reloaded";
  return (
    <section class="review" aria-labelledby="excel-history-heading">
      <h3 id="excel-history-heading" ref={heading} tabIndex={-1}>
        {stage === "dates" ? "Check your statements" : stage === "questions" ? `Review statement ${String(reviewIndex + 1)} of ${String(ordered.length)}` : stage === "done" ? "Your history is ready" : "Review and save your history"}
      </h3>
      {message !== "" && <p class="notice" role="status">{message}</p>}
      <div class="status" data-busy={checking} aria-live="polite">{checking && <p>Checking the interrupted save. Nothing more is being written.</p>}</div>
      {stage === "dates" && <>
        <p>All files were checked locally. Select the statements to include and check every date. They will be reviewed oldest first. This selection step does not save anything.</p>
        <p class="hint">One statement per calendar month is currently supported. If you have more than one export for a month, select the one you want to use.</p>
        <p class="hint">For a workbook with several statements, a full date in each sheet name is proposed (YYYY-MM-DD or DD-MM-YYYY). Otherwise enter it below. The workbook's creation date is never applied to all its sheets.</p>
        {props.review.problems.length > 0 && <div class="review-problem" role="alert"><h4>Choose the files again to resolve these problems</h4><ul>{props.review.problems.map((problem, index) => <li key={index}>{problem}</li>)}</ul></div>}
        {props.review.notices.length > 0 && <div class="notice notice-warning"><h4>Sheets not included</h4><p>Check that none of these sheets contain statements you need.</p><ul>{props.review.notices.map((notice, index) => <li key={index}>{notice}</li>)}</ul></div>}
        {props.ledger.snapshots.at(-1) !== undefined && <button type="button" onClick={() => {
          const latest = props.ledger.snapshots.at(-1)?.date;
          setEntries((current) => current.map((entry) => {
            const date = parseIsoDate(entry.date);
            return date !== null && statementDateIssue(date, latest) !== null ? { ...entry, selected: false } : entry;
          }));
        }}>Exclude statements from months already recorded or earlier</button>}
        {entries.map((entry) => <fieldset key={entry.id}>
          <legend>{entry.fileName} / {entry.sheet.name}</legend>
          <label><input type="checkbox" checked={entry.selected} onChange={(event) => { change(entry.id, { selected: event.currentTarget.checked }); }} /> Include this statement</label>
          <div class="field"><label for={`batch-date-${entry.id}`}>Statement date</label><input id={`batch-date-${entry.id}`} type="date" value={entry.date} disabled={!entry.selected} onInput={(event) => { change(entry.id, { date: event.currentTarget.value }); }} /></div>
          {entry.sheet.outcome.ok ? <p>{entry.sheet.outcome.statement.funds.length} funds. Funds subtotal: <Amount cents={entry.sheet.outcome.statement.fundsSubtotal} />.</p> : <div class="review-problem"><ul>{entry.sheet.outcome.issues.map((issue, index) => <li key={index}>{issue.cell === null ? "" : `${issue.cell}: `}{issue.message}</li>)}</ul><p>Choose a fresh bank export, or exclude this statement.</p></div>}
        </fieldset>)}
        {!plan.ok && <div class="review-problem" role="status"><ul>{plan.messages.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        <p class="hint" aria-live="polite">{entries.filter(entry => entry.selected).length} of {entries.length} statements selected.</p>
        <button type="button" class="primary" disabled={!plan.ok || props.review.problems.length > 0} onClick={begin}>Review selected statements in date order</button>
      </>}
      {stage === "questions" && current?.sheet.outcome.ok && <>
        <p>{current.fileName} / {current.sheet.name}. Statement date: {current.date}. {reviewIndex} reviewed; nothing saved yet.</p>
        {current.sheet.outcome.statement.adjustments.length > 0 && <details><summary>Checked readings from this sheet</summary><ul>{current.sheet.outcome.statement.adjustments.map((item, index) => <li key={index}>{item.cell}: {item.message}</li>)}</ul></details>}
        <CashQuestions key={current.id} statement={current.sheet.outcome.statement} date={current.date} ledger={preview} createRevision={() => crypto.randomUUID()} source={{ sheetName: current.sheet.name, sheet: current.sheet.raw }} onRecord={() => undefined}
          {...(drafts.current[current.id] === undefined ? {} : { initialDraft: drafts.current[current.id] })}
          onDraft={(draft) => { drafts.current[current.id] = draft; }}
          onReview={(request, next) => {
            setStatements((previous) => [...previous.slice(0, reviewIndex), { ...request, commandId: crypto.randomUUID() }]);
            setPreview(next);
            setReviewIndex(reviewIndex + 1);
            if (reviewIndex + 1 === ordered.length) setStage("confirm");
          }} />
      </>}
      {(stage === "confirm" || stage === "saving" || stage === "stopped" || stage === "done") && <>
        <p>{statements.length} statements reviewed. {saved} saved and checked. Each statement is saved separately; if saving stops, earlier confirmed statements remain saved.</p>
        <ol>{statements.map((statement, index) => <li key={statement.commandId}>{formatDateLong(statement.date)}: {statement.statement.funds.length} funds, <Amount cents={statement.statement.fundsSubtotal} />. {index < saved ? "Saved and checked." : "Not yet confirmed saved."}</li>)}</ol>
        {stage === "confirm" && <>
          <p>Confirm to save these statements, including their bank-sheet contents and your reviewed cash decisions, to your connected Google spreadsheet.</p>
          {props.save === undefined ? <p class="notice notice-warning">Connect to Google before saving. No history has been saved.</p> : <button type="button" class="primary" onClick={() => { void saveRemaining(props.save as RemoteSave); }}>Confirm and save {statements.length} statements</button>}
        </>}
        {stage === "saving" && <div class="status" data-busy="true" role="status"><p>Saving and checking statement {Math.min(saved + 1, statements.length)} of {statements.length}. Keep this page open.</p><div class="history-progress" role="progressbar" aria-label="Statements confirmed saved" aria-valuemin={0} aria-valuemax={Math.max(1, statements.length)} aria-valuenow={saved} style={{ "--completion": `${String(saved / Math.max(1, statements.length) * 100)}%` }} /></div>}
        {stage === "stopped" && <div class="review-problem" role="alert">
          <h4>Import paused after {saved} confirmed saves</h4>
          {failure?.status === "unknown" && <p>{failure.message} Do not retry this save until its outcome is checked.</p>}
          {failure?.status === "saved-not-reloaded" && <p>This statement was saved, but its history could not be read back. Check again before continuing.</p>}
          {failure?.status === "not-saved" && <p>{failure.message}</p>}
          {failure?.status === "stale" && <p>Another device changed your history. Nothing from the stopped statement was saved. Return to selection and review the remaining statements against the updated history; reconnect in Your data if Google could not be checked.</p>}
          {failure?.status === "rejected" && <ul>{failure.messages.map((item, index) => <li key={index}>{item}</li>)}</ul>}
          {failure?.status === "damaged" && <p>{failure.message} Do not save more until your history is recovered.</p>}
          {uncertain && props.save !== undefined && <button type="button" disabled={checking} onClick={() => { void check(props.save as RemoteSave); }}>{checking ? "Checking the save…" : "Check what happened"}</button>}
          {(failure === null || failure.status === "not-saved") && props.save !== undefined && <button type="button" onClick={() => { void saveRemaining(props.save as RemoteSave); }}>Resume remaining statements</button>}
        </div>}
        {stage === "done" && <><p role="status">All selected statements are saved to your spreadsheet and checked. Your portfolio is ready to view.</p><a class="primary link-button" href="#overview">View your portfolio</a></>}
      </>}
      {((stage === "questions" && reviewIndex > 0) || stage === "confirm") && <button type="button" onClick={previous}>Previous statement (keep answers)</button>}
      {stage !== "dates" && stage !== "saving" && !uncertain && <button type="button" onClick={() => { setStage("dates"); setMessage("Returned to statement selection. Reviewed answers will need to be entered again. Confirmed saves remain in your spreadsheet; exclude those dates before continuing."); }}>{stage === "done" ? "Import more statements" : "Return to statement selection (reset answers)"}</button>}
    </section>
  );
}
