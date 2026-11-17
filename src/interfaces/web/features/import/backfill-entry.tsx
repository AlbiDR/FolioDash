import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type {
  ImportPreparer,
  RecordRequest,
  RecordResult,
  RemoteSave,
  ReviewStatement,
} from "../../../../applications/import/import-model";
import type { StatementSource } from "../../../../applications/ledger/ledger-service";
import type { FundCommand } from "../../../../core/statements/import-plan";
import { prepareBackfill } from "../../../../core/statements/backfill";
import { formatDateLong, monthSerial, parseIsoDate } from "../../../../core/values/iso-date";
import { EMPTY_LEDGER, type LedgerState } from "../../../../core/portfolio/ledger";
import { computeMetrics } from "../../../../core/portfolio/metrics";
import { CashQuestions } from "./cash-questions";
import type { CashReviewDraft } from "./cash-answers";
import { prepareManualStatement, type ManualRow } from "./manual-statement";
import type { DraftRow, Stage } from "./backfill-types";
import { BackfillDone } from "./backfill-done";
import { BackfillMore } from "./backfill-more";
import { BackfillPreview } from "./backfill-preview";
import { BackfillValuesForm } from "./backfill-values-form";

/** Guided review of an earlier manual statement and the former opening month. */
export function BackfillEntry(props: {
  readonly ledger: LedgerState;
  readonly workbookId: string;
  readonly save: RemoteSave;
  readonly prepare: ImportPreparer;
  readonly onRecord: (next: LedgerState) => void;
  readonly onLock: (locked: boolean) => void;
}): JSX.Element {
  const [original, setOriginal] = useState(() => props.ledger);
  const [originalWorkbookId, setOriginalWorkbookId] = useState(() => props.workbookId);
  const first = original.snapshots[0];
  const [rows, setRows] = useState<readonly DraftRow[]>([{ id: 1, name: "", isin: "", amount: "" }]);
  const [date, setDate] = useState("");
  const [stage, setStage] = useState<Stage>("values");
  const phase = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    phase.current?.focus({ preventScroll: true });
  }, [stage]);
  useEffect(() => {
    if (pendingFocus.current === null) return;
    document.getElementById(pendingFocus.current)?.focus({ preventScroll: true });
    pendingFocus.current = null;
  }, [rows]);
  const [problem, setProblem] = useState("");
  const [early, setEarly] = useState<readonly RecordRequest[]>([]);
  const [earlyLedger, setEarlyLedger] = useState<LedgerState>(EMPTY_LEDGER);
  const [mode, setMode] = useState<"manual" | "file">("manual");
  const [fileStatement, setFileStatement] = useState<{ statement: ReviewStatement; source: StatementSource } | null>(
    null,
  );
  const [reading, setReading] = useState(false);
  const [boundary, setBoundary] = useState<readonly FundCommand[]>([]);
  const [boundaryDraft, setBoundaryDraft] = useState<CashReviewDraft | null>(null);
  const [candidate, setCandidate] = useState<LedgerState | null>(null);
  const [commandId, setCommandId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [operation, setOperation] = useState<"save" | "restore">("save");
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const [savedRevision, setSavedRevision] = useState<string | null>(null);
  const priorMetrics = computeMetrics(original);
  const candidateMetrics = candidate === null ? [] : computeMetrics(candidate);
  const chosen = parseIsoDate(date);
  const manual = prepareManualStatement(rows);
  const selectedStatement = mode === "file" ? fileStatement?.statement : manual.ok ? manual.statement : undefined;
  const boundaryStatement: ReviewStatement | null =
    first === undefined
      ? null
      : {
          funds: original.funds.flatMap((fund) => {
            const holding = first.holdings[fund.isin];
            return holding?.status === "active"
              ? [{ isin: fund.isin, name: fund.name, marketValue: holding.value }]
              : [];
          }),
          fundsSubtotal: first.fundsSubtotal,
          total: null,
          categories: [],
          adjustments: [],
        };
  function update(id: number, field: keyof ManualRow, value: string): void {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }
  async function chooseFile(file: File): Promise<void> {
    setReading(true);
    setFileStatement(null);
    setProblem("");
    try {
      const result = await props.prepare({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        read: async () => new Uint8Array(await file.arrayBuffer()),
      });
      if (result.status !== "reviewed" || result.sheets.length !== 1) {
        setProblem("Choose a workbook containing exactly one supported statement.");
        return;
      }
      const sheet = result.sheets[0];
      if (sheet === undefined || !sheet.outcome.ok) {
        setProblem("The bank statement could not be read. Choose a supported, complete export.");
        return;
      }
      setFileStatement({ statement: sheet.outcome.statement, source: { sheetName: sheet.name, sheet: sheet.raw } });
      setDate(sheet.dateCandidate ?? result.dateCandidate?.date ?? "");
    } catch {
      setProblem("The bank statement could not be read.");
    } finally {
      setReading(false);
    }
  }
  function nextValues(event: Event): void {
    event.preventDefault();
    if (chosen === null || first === undefined || monthSerial(chosen) >= monthSerial(first.date)) {
      setProblem("Choose a month before your earliest saved statement.");
      return;
    }
    const last = earlyLedger.snapshots.at(-1);
    if (last !== undefined && monthSerial(chosen) <= monthSerial(last.date)) {
      setProblem("Enter earlier statements in chronological order, one per month.");
      return;
    }
    if (mode === "manual" && (!manual.ok || rows.length === 0)) {
      setProblem(manual.ok ? "Add at least one fund." : manual.errors.join(" "));
      return;
    }
    if (mode === "file" && fileStatement === null) {
      setProblem("Choose a bank statement first.");
      return;
    }
    setProblem("");
    setStage("opening");
  }
  function finishReview(request: RecordRequest): void {
    if (early.length === 0) return;
    const prepared = prepareBackfill(original, early, request.commands, "preview");
    if (!prepared.ok) {
      setProblem(prepared.message);
      return;
    }
    setBoundary(request.commands);
    setCandidate(prepared.ledger);
    setProblem("");
    setStage("preview");
  }
  function settle(result: RecordResult): void {
    if (result.status === "recorded") {
      props.onRecord(result.ledger);
      props.onLock(false);
      setSavedRevision(operation === "save" ? result.ledger.revision : null);
      setStage("done");
      setProblem("");
    } else if (result.status === "unknown" || result.status === "saved-not-reloaded") {
      setStage("unknown");
      setProblem(result.status === "unknown" ? result.message : "The change was saved but could not be reloaded.");
    } else {
      props.onLock(false);
      setStage(result.status === "stale" ? "restart" : "preview");
      setProblem(
        result.status === "rejected"
          ? result.messages.join(" ")
          : result.status === "stale"
            ? "Your history changed. Start the review again using the latest data."
            : result.message,
      );
    }
  }
  async function save(): Promise<void> {
    if (early.length === 0 || props.save.backfill === undefined || stage !== "preview") return;
    const id = commandId ?? props.save.newCommandId();
    setOperation("save");
    setCommandId(id);
    setProblem("");
    setStage("saving");
    props.onLock(true);
    try {
      settle(await props.save.backfill(early, boundary, id, original.revision, originalWorkbookId));
    } catch {
      setStage("unknown");
      setProblem("The result is unknown. Check it before trying again.");
    }
  }
  async function check(): Promise<void> {
    if (commandId === null) return;
    setStage("saving");
    try {
      const result = await props.save.check(commandId, originalWorkbookId);
      if (result.status === "recorded" || result.status === "saved-not-reloaded") {
        settle(result);
        return;
      }
      if (result.status === "not-recorded") {
        props.onLock(false);
        setCommandId(null);
        if (operation === "restore") {
          setSavedRevision(null);
          setStage("done");
          setProblem("The recovery did not occur. Open Your data to review the current history before trying again.");
        } else {
          setStage("restart");
          setProblem("The change did not occur. Start a new review against the checked spreadsheet.");
        }
        return;
      }
      setStage("unknown");
      setProblem(result.message);
    } catch {
      setStage("unknown");
      setProblem("The spreadsheet could not be checked. Try again shortly.");
    }
  }
  async function recover(): Promise<void> {
    if (savedRevision === null || props.save.recoverRevision === undefined || restoring || !confirmRecovery) return;
    setRestoring(true);
    props.onLock(true);
    const id = props.save.newCommandId();
    setOperation("restore");
    setCommandId(id);
    try {
      const result = await props.save.recoverRevision(original.revision, id, savedRevision, originalWorkbookId);
      if (result.status === "recorded") {
        props.onRecord(result.ledger);
        props.onLock(false);
        setProblem("");
        setSavedRevision(null);
      } else if (result.status === "unknown" || result.status === "saved-not-reloaded") {
        setStage("unknown");
        setProblem("The recovery result is unknown. Check it before trying again.");
      } else {
        props.onLock(false);
        setProblem(
          result.status === "rejected"
            ? result.messages.join(" ")
            : result.status === "stale"
              ? "Your history changed. Recovery was not performed."
              : result.message,
        );
      }
    } catch {
      setStage("unknown");
      setProblem("The recovery result is unknown. Check it before trying again.");
    } finally {
      setRestoring(false);
    }
  }
  return (
    <section class="manual-entry backfill-entry" aria-labelledby="backfill-heading">
      <h3 id="backfill-heading">Add an earlier statement</h3>
      <p>
        Enter the earlier values and review the money movements up to your first saved month. Nothing changes until you
        confirm.
      </p>
      <div class="backfill-phase" key={stage} ref={phase} tabIndex={-1}>
        {stage === "values" && (
          <BackfillValuesForm
            nextValues={nextValues}
            mode={mode}
            setMode={setMode}
            reading={reading}
            chooseFile={chooseFile}
            fileStatement={fileStatement}
            date={date}
            setDate={setDate}
            rows={rows}
            setRows={setRows}
            update={update}
            pendingFocus={pendingFocus}
          />
        )}
        {stage === "opening" && chosen !== null && selectedStatement !== undefined && (
          <>
            <button
              type="button"
              onClick={() => {
                setStage("values");
              }}
            >
              Back to values
            </button>
            <CashQuestions
              statement={selectedStatement}
              date={chosen}
              ledger={earlyLedger}
              createRevision={() => "preview"}
              onRecord={() => {}}
              {...(mode === "file" && fileStatement !== null ? { source: fileStatement.source } : {})}
              onReview={(request, ledger) => {
                setEarly((current) => [...current, request]);
                setEarlyLedger(ledger);
                setStage("more");
              }}
            />
          </>
        )}
        {stage === "more" && (
          <BackfillMore
            setRows={setRows}
            setDate={setDate}
            setFileStatement={setFileStatement}
            setBoundaryDraft={setBoundaryDraft}
            setStage={setStage}
          />
        )}
        {stage === "boundary" && first !== undefined && boundaryStatement !== null && (
          <>
            <button
              type="button"
              onClick={() => {
                setStage("more");
              }}
            >
              Back to earlier months
            </button>
            <p>Now review what happened between the earlier statement and {formatDateLong(first.date)}.</p>
            <CashQuestions
              statement={boundaryStatement}
              date={first.date}
              ledger={earlyLedger}
              createRevision={() => "preview"}
              onRecord={() => {}}
              onReview={finishReview}
              onDraft={setBoundaryDraft}
              {...(boundaryDraft === null ? {} : { initialDraft: boundaryDraft })}
            />
          </>
        )}
        {stage === "preview" && candidate !== null && (
          <BackfillPreview
            priorMetrics={priorMetrics}
            candidateMetrics={candidateMetrics}
            early={early}
            candidate={candidate}
            setStage={setStage}
            save={save}
          />
        )}
        {stage === "saving" && <p role="status">Checking your spreadsheet…</p>}
        {stage === "unknown" && (
          <>
            <p>Do not submit this change again until its outcome is checked.</p>
            <button
              type="button"
              onClick={() => {
                void check();
              }}
            >
              Check what happened
            </button>
          </>
        )}
        {stage === "restart" && (
          <button
            type="button"
            onClick={() => {
              setOriginal(props.ledger);
              setOriginalWorkbookId(props.workbookId);
              setRows([{ id: 1, name: "", isin: "", amount: "" }]);
              setDate("");
              setEarly([]);
              setEarlyLedger(EMPTY_LEDGER);
              setBoundary([]);
              setBoundaryDraft(null);
              setCandidate(null);
              setCommandId(null);
              setProblem("");
              setStage("values");
            }}
          >
            Start a new review
          </button>
        )}
        {stage === "done" && (
          <BackfillDone
            savedRevision={savedRevision}
            confirmRecovery={confirmRecovery}
            setConfirmRecovery={setConfirmRecovery}
            restoring={restoring}
            recover={recover}
          />
        )}
        {problem !== "" && (
          <p class="field-error" role="alert">
            {problem}
          </p>
        )}
      </div>
    </section>
  );
}
