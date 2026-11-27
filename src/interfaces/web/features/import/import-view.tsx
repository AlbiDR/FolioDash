import { Presence } from "../../shared/ui/presence";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { type IsoDate, formatDateLong } from "../../../../core/values/iso-date";
import type { LedgerState } from "../../../../core/portfolio/ledger";
import { ManualEntry } from "./manual-entry";
import { BackfillEntry } from "./backfill-entry";
import { ExcelHistoryView } from "./excel-history-view";
import { Review, RecordedSummary } from "./import-review";
import { prepareExcelHistory, type ExcelHistoryReview } from "../../../../applications/import/excel-history";
import type {
  ImportFile,
  ImportPreparer,
  ImportReview,
  RemoteSave,
} from "../../../../applications/import/import-model";

type Phase =
  | { readonly name: "idle" }
  | { readonly name: "reading" }
  | { readonly name: "batch"; readonly review: ExcelHistoryReview }
  | { readonly name: "reviewed"; readonly review: ImportReview };

const JOURNEY_STEPS = ["Choose statements", "Review dates & movements", "Save & check"] as const;

export function ImportView(props: {
  readonly prepare: ImportPreparer;
  readonly ledger: LedgerState;
  readonly workbookId?: string;
  readonly createRevision: () => string;
  readonly onRecord: (next: LedgerState) => void;
  /** Present once a spreadsheet is connected; statements are then saved there instead of kept in this tab. */
  readonly save?: RemoteSave;
  readonly initialPhase?: Phase;
  readonly historyMode?: boolean;
  readonly onWorkflowLock?: (locked: boolean) => void;
}): JSX.Element {
  const [phase, setPhase] = useState<Phase>(props.initialPhase ?? { name: "idle" });
  const [sheetIndex, setSheetIndex] = useState(0);
  const [date, setDate] = useState("");
  const [method, setMethod] = useState<"file" | "manual" | "earlier">("file");
  const [manualStarted, setManualStarted] = useState(false);
  const [backfillStarted, setBackfillStarted] = useState(false);
  const [fileSaveLocked, setFileSaveLocked] = useState(false);
  const [manualSaveLocked, setManualSaveLocked] = useState(false);
  const [backfillSaveLocked, setBackfillSaveLocked] = useState(false);
  const saveLocked = fileSaveLocked || manualSaveLocked || backfillSaveLocked;
  const [batchLocked, setBatchLocked] = useState(false);
  const [recorded, setRecorded] = useState<IsoDate | null>(null);
  const recordedMessage = useRef<HTMLParagraphElement>(null);
  const reviewHeading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    props.onWorkflowLock?.(batchLocked || saveLocked);
  }, [batchLocked, saveLocked, props.onWorkflowLock]);
  useEffect(
    () => () => {
      props.onWorkflowLock?.(false);
    },
    [props.onWorkflowLock],
  );
  useEffect(() => {
    if (phase.name === "reviewed") reviewHeading.current?.focus();
  }, [phase]);
  useEffect(() => {
    if (recorded !== null) recordedMessage.current?.focus();
  }, [recorded]);
  const fileSelection = useRef(0);

  async function choose(files: readonly File[]): Promise<void> {
    const selection = ++fileSelection.current;
    setRecorded(null);
    setPhase({ name: "reading" });
    const wrapped: ImportFile[] = files.map((file) => ({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      read: async () => new Uint8Array(await file.arrayBuffer()),
    }));
    try {
      if (props.historyMode || wrapped.length > 1) {
        const review = await prepareExcelHistory(wrapped, props.prepare);
        if (selection === fileSelection.current) setPhase({ name: "batch", review });
        return;
      }
      const first = wrapped[0];
      if (first === undefined) return;
      const review = await props.prepare(first);
      if (review.status === "reviewed" && (review.sheets.length > 1 || (review.workbookSheetCount ?? 0) > 1)) {
        const batch = await prepareExcelHistory(wrapped, () => Promise.resolve(review));
        if (selection === fileSelection.current) setPhase({ name: "batch", review: batch });
        return;
      }
      if (selection !== fileSelection.current) return;
      setSheetIndex(
        Math.max(0, review.status === "reviewed" ? review.sheets.findIndex((entry) => entry.outcome.ok) : 0),
      );
      setDate(review.status === "reviewed" ? (review.dateCandidate?.date ?? "") : "");
      setPhase({ name: "reviewed", review });
    } catch {
      if (selection !== fileSelection.current) return;
      setPhase({ name: "reviewed", review: { status: "unreadable-file", message: "The file could not be read." } });
    }
  }

  const reviewed = phase.name === "reviewed";
  const reviewReady =
    reviewed && phase.review.status === "reviewed" && phase.review.sheets.some((entry) => entry.outcome.ok);
  const reviewProblems = reviewed && !reviewReady;
  const earlierAvailable =
    props.ledger.snapshots.length > 0 && props.workbookId !== undefined && props.save?.backfill !== undefined;
  return (
    <section aria-labelledby="import-heading" class="import">
      <h2 id="import-heading" class="import-heading">
        {props.historyMode
          ? "Choose your history files"
          : method === "manual"
            ? "Enter a statement"
            : method === "earlier"
              ? "Add earlier history"
              : "Choose bank statements"}
      </h2>
      <ol class="journey-steps" aria-label="Import process">
        {JOURNEY_STEPS.map((label, position) => {
          const number = position + 1;
          const step = saveLocked
            ? 3
            : method === "manual" || phase.name === "reviewed" || phase.name === "batch"
              ? 2
              : 1;
          return (
            <li
              key={label}
              aria-current={step === number ? "step" : undefined}
              data-done={step > number ? "true" : undefined}
            >
              <span>0{number}</span> {label}
              {step > number && <span class="visually-hidden">, completed</span>}
            </li>
          );
        })}
      </ol>
      <Presence show={recorded !== null}>
        {recorded !== null && (
          <p ref={recordedMessage} class="notice notice-success" role="status" tabIndex={-1}>
            Statement for {formatDateLong(recorded)}{" "}
            {props.save === undefined ? "recorded in this browser tab" : "saved to your spreadsheet and checked"}. You
            can choose another statement below.
          </p>
        )}
      </Presence>
      {!props.historyMode && (
        <div
          class="segmented range-selector motion-range-select entry-methods"
          role="group"
          aria-label="Entry method"
          style={{
            // The shared sliding selection, as in the period control: one pill moves to the chosen method.
            "--segment-count": earlierAvailable ? 3 : 2,
            "--segment-index": method === "file" ? 0 : method === "manual" ? 1 : 2,
          }}
        >
          <button
            type="button"
            disabled={saveLocked || batchLocked || phase.name === "reading"}
            aria-controls="file-entry-panel"
            aria-pressed={method === "file"}
            onClick={() => {
              setMethod("file");
            }}
          >
            Import Excel
          </button>
          <button
            type="button"
            disabled={saveLocked || batchLocked || phase.name === "reading"}
            aria-controls="manual-entry-panel"
            aria-pressed={method === "manual"}
            onClick={() => {
              setManualStarted(true);
              setMethod("manual");
            }}
          >
            Enter manually
          </button>
          {earlierAvailable && (
            <button
              type="button"
              disabled={saveLocked || batchLocked || phase.name === "reading"}
              aria-controls="earlier-entry-panel"
              aria-pressed={method === "earlier"}
              onClick={() => {
                setBackfillStarted(true);
                setMethod("earlier");
              }}
            >
              Add earlier history
            </button>
          )}
        </div>
      )}
      <div id="manual-entry-panel" class="entry-panel" hidden={method !== "manual"}>
        {manualStarted && (
          <ManualEntry
            ledger={props.ledger}
            createRevision={props.createRevision}
            onRecord={props.onRecord}
            onSaveLock={setManualSaveLocked}
            {...(props.save === undefined ? {} : { save: props.save })}
          />
        )}
      </div>
      <div id="earlier-entry-panel" class="entry-panel" hidden={method !== "earlier"}>
        {backfillStarted && props.save !== undefined && props.workbookId !== undefined && (
          <BackfillEntry
            ledger={props.ledger}
            workbookId={props.workbookId}
            save={props.save}
            prepare={props.prepare}
            onRecord={props.onRecord}
            onLock={setBackfillSaveLocked}
          />
        )}
      </div>
      <div id="file-entry-panel" class="entry-panel" hidden={method !== "file"}>
        <div class="field">
          <label for="statement-file">Bank statements (.xlsx)</label>
          <input
            id="statement-file"
            disabled={saveLocked || batchLocked || phase.name === "reading"}
            type="file"
            multiple
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-describedby="file-entry-help file-entry-privacy"
            onChange={(event) => {
              const input = event.currentTarget;
              const files = Array.from(input.files ?? []);
              if (files.length > 0) void choose(files);
              input.value = "";
            }}
          />
          <p class="hint" id="file-entry-help">
            Choose one or more Excel files exported by your bank, or one workbook with a statement on each sheet.
          </p>
          <p class="footnote" id="file-entry-privacy">
            Supported Fideuram holdings sheets are checked in this browser. The original Excel files are not uploaded;
            confirming an import saves the reviewed sheet contents and your decisions to your private Google
            spreadsheet.
          </p>
        </div>

        <div aria-live="polite" data-busy={phase.name === "reading"} class="status">
          <Presence show={phase.name === "reading"}>
            {phase.name === "reading" && (
              <p class="notice" data-busy="true">
                Reading and checking the file…
              </p>
            )}
          </Presence>
          <Presence show={reviewReady}>
            {reviewReady && <p class="notice notice-success">Review ready. Check the details below, then confirm.</p>}
          </Presence>
          <Presence show={reviewProblems}>
            {reviewProblems && (
              <p class="notice notice-warning">The file was checked. It has problems, described below.</p>
            )}
          </Presence>
        </div>

        {phase.name === "batch" && (
          <ExcelHistoryView
            key={fileSelection.current}
            review={phase.review}
            ledger={props.ledger}
            onRecord={props.onRecord}
            onLock={setBatchLocked}
            {...(props.save === undefined ? {} : { save: props.save })}
          />
        )}

        {phase.name === "reviewed" && (
          <div ref={reviewHeading} tabIndex={-1} role="region" aria-label="Statement review">
            {phase.review.status === "unreadable-file" ? (
              <div class="review-problem" role="alert">
                <h3>This file cannot be read</h3>
                <p>{phase.review.message}</p>
                <p>Choose the file exactly as the bank exported it.</p>
              </div>
            ) : (
              <Review
                review={phase.review}
                sheetIndex={sheetIndex}
                onSheet={setSheetIndex}
                date={date}
                onDate={setDate}
                onSaveLock={setFileSaveLocked}
                locked={saveLocked}
                ledger={props.ledger}
                createRevision={props.createRevision}
                {...(props.save === undefined ? {} : { save: props.save })}
                onRecord={(next, savedDate) => {
                  props.onRecord(next);
                  setFileSaveLocked(false);
                  setRecorded(savedDate);
                  setPhase({ name: "idle" });
                }}
              />
            )}
          </div>
        )}
      </div>
      {props.save === undefined && <RecordedSummary ledger={props.ledger} />}
    </section>
  );
}
