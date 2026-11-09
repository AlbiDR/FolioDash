import { Presence } from "../../shared/ui/Presence";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { type IsoDate, formatDateLong, parseIsoDate } from "../../../../core/IsoDate";
import type { LedgerState } from "../../../../core/Ledger";
import { Amount } from "../../presentation/privacy/privacy";
import type { DateSource } from "../../../../core/StatementDate";
import { CashQuestions } from "./CashQuestions";
import { ManualEntry } from "./ManualEntry";
import { ExcelHistoryView } from "./ExcelHistoryView";
import { prepareExcelHistory, type ExcelHistoryReview } from "../../../../applications/ExcelHistory";
import type { ImportFile, ImportPreparer, ImportReview, RemoteSave, ReviewAdjustment, ReviewIssue, ReviewStatement } from "../../../../applications/ImportModel";

const MAX_CELLS_LISTED = 8;

const SOURCE_TEXT: Readonly<Record<DateSource, string>> = {
  "file-created": "Proposed from the time the bank created the file, in your local time.",
  "file-name": "Proposed from a date in the file name.",
  "file-modified": "Proposed from when the file was last saved on this device.",
};

const ISSUE_TITLE: Readonly<Record<string, string>> = {
  "layout-not-found": "Not a supported holdings sheet",
  "unsupported-layout": "Unsupported layout",
  "unsupported-structure": "Unexpected row",
  "formula-cell": "Formula not allowed",
  "unreadable-value": "Value cannot be read",
  "missing-value": "Value missing",
  "invalid-identifier": "Invalid ISIN",
  "duplicate-identifier": "Duplicate ISIN",
  "ambiguous-reading": "More than one possible reading",
  "currency-mismatch": "Currency does not match",
  "does-not-reconcile": "Numbers do not add up",
};

type Phase =
  | { readonly name: "idle" }
  | { readonly name: "reading" }
  | { readonly name: "batch"; readonly review: ExcelHistoryReview }
  | { readonly name: "reviewed"; readonly review: ImportReview };

function groupAdjustments(adjustments: readonly ReviewAdjustment[]): { message: string; cells: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const adjustment of adjustments) {
    const cells = groups.get(adjustment.message) ?? [];
    if (adjustment.cell !== null) cells.push(adjustment.cell);
    groups.set(adjustment.message, cells);
  }
  return [...groups].map(([message, cells]) => ({ message, cells }));
}

function Issues(props: { readonly issues: readonly ReviewIssue[] }): JSX.Element {
  return (
    <div class="review-problem" role="alert">
      <h4>This sheet cannot be imported</h4>
      <ul>
        {props.issues.map((issue) => (
          <li key={`${issue.code}-${issue.cell ?? ""}-${issue.message}`}>
            <strong>{ISSUE_TITLE[issue.code] ?? "Problem"}</strong>
            {issue.cell === null ? "" : ` (cell ${issue.cell})`}: {issue.message}
          </li>
        ))}
      </ul>
      <p>If you changed this file by hand, export it again from the bank and choose the new file.</p>
    </div>
  );
}

function Statement(props: { readonly statement: ReviewStatement }): JSX.Element {
  const { statement } = props;
  const adjustments = groupAdjustments(statement.adjustments);
  return (
    <>
      <dl class="facts stacked">
        <div>
          <dt>Funds found</dt>
          <dd>{statement.funds.length}</dd>
        </div>
        <div>
          <dt>Funds subtotal</dt>
          <dd><Amount cents={statement.fundsSubtotal} /></dd>
        </div>
        <div>
          <dt>Grand total</dt>
          <dd>{statement.total === null ? "Not in the file" : <Amount cents={statement.total} />}</dd>
        </div>
      </dl>

      {adjustments.length > 0 && (
        <section aria-labelledby="adjustments-heading" class="review-adjustments">
          <h4 id="adjustments-heading">Read in a different form</h4>
          <p>
            The file was not in the bank's exact form. Each reading below was checked against the other numbers in the
            file, and nothing was guessed.
          </p>
          <ul>
            {adjustments.map((group) => (
              <li key={group.message}>
                {group.message}
                {group.cells.length > 0 &&
                  ` (${group.cells.slice(0, MAX_CELLS_LISTED).join(", ")}${
                    group.cells.length > MAX_CELLS_LISTED ? `, and ${String(group.cells.length - MAX_CELLS_LISTED)} more` : ""
                  })`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h4 id="review-funds-heading">Funds</h4>
      {statement.funds.length === 0 ? (
        <p>This statement lists no funds.</p>
      ) : (
        <table class="funds" aria-labelledby="review-funds-heading">
          <thead>
            <tr>
              <th scope="col">Fund</th>
              <th scope="col">Market value</th>
            </tr>
          </thead>
          <tbody>
            {statement.funds.map((fund) => (
              <tr key={fund.isin}>
                <th scope="row">{fund.name}<span class="fund-isin">{fund.isin}</span></th>
                <td><Amount cents={fund.marketValue} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4 id="review-categories-heading">Categories in the file</h4>
      <table class="funds" aria-labelledby="review-categories-heading">
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Subtotal</th>
            <th scope="col">Used by FolioDash</th>
          </tr>
        </thead>
        <tbody>
          {statement.categories.map((category) => (
            <tr key={category.label}>
              <th scope="row">{category.label}</th>
              <td><Amount cents={category.subtotal} /></td>
              <td>{category.tracked ? "Yes" : "Not yet"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Review(props: {
  readonly review: Extract<ImportReview, { status: "reviewed" }>;
  readonly sheetIndex: number;
  readonly onSheet: (index: number) => void;
  readonly date: string;
  readonly onDate: (value: string) => void;
  readonly ledger: LedgerState;
  readonly createRevision: () => string;
  readonly onRecord: (next: LedgerState, date: IsoDate) => void;
  readonly save?: RemoteSave;
  readonly onSaveLock?: (locked: boolean) => void;
  readonly locked?: boolean;
}): JSX.Element {
  const { review, sheetIndex, date } = props;
  const chosen = parseIsoDate(date);
  const sheet = review.sheets[sheetIndex];

  return (
    <div class="review">
      <h3>Review</h3>

      <div class="field">
        <label for="statement-date">Statement date</label>
        <input id="statement-date" type="date" disabled={props.locked} value={date} onInput={(event) => {
            props.onDate(event.currentTarget.value);
          }}
          aria-describedby="statement-date-hint"
        />
        <p class="hint" id="statement-date-hint">
          {chosen === null
            ? "Choose the day this statement was exported."
            : `${formatDateLong(chosen)}. `}
          {review.dateCandidate === null ? "" : SOURCE_TEXT[review.dateCandidate.source]} Check it before you go on.
        </p>
      </div>

      {review.sheets.length === 0 ? (
        <div class="review-problem" role="alert">
          <h4>No holdings sheet found</h4>
          <p>
            None of the sheets in this file match the supported Fideuram holdings layout. Choose the file exactly as the
            bank exported it.
          </p>
        </div>
      ) : (
        <>
          {review.sheets.length > 1 && (
            <div class="field">
              <label for="sheet-choice">Sheet to import</label>
              <select
                id="sheet-choice"
                disabled={props.locked}
                value={String(sheetIndex)}
                onChange={(event) => {
                  props.onSheet(Number(event.currentTarget.value));
                }}
              >
                {review.sheets.map((entry, index) => (
                  <option key={entry.name} value={String(index)}>
                    {entry.name}
                    {entry.outcome.ok ? "" : " (has problems)"}
                  </option>
                ))}
              </select>
            </div>
          )}
          {sheet === undefined ? null : sheet.outcome.ok ? (
            <>
              <Statement statement={sheet.outcome.statement} />
              {chosen === null ? (
                <p>Choose the statement date above to continue.</p>
              ) : (
                <CashQuestions
                  key={`${sheet.name}-${chosen}-${props.ledger.revision}`}
                  statement={sheet.outcome.statement}
                  date={chosen}
                  ledger={props.ledger}
                  createRevision={props.createRevision}
                  source={{ sheetName: sheet.name, sheet: sheet.raw }}
                  {...(props.save === undefined ? {} : { save: props.save })}
                  {...(props.onSaveLock === undefined ? {} : { onSaveLock: props.onSaveLock })}
                  onRecord={(next) => {
                    props.onRecord(next, chosen);
                  }}
                />
              )}
            </>
          ) : (
            <Issues issues={sheet.outcome.issues} />
          )}
        </>
      )}
    </div>
  );
}

function RecordedSummary(props: { readonly ledger: LedgerState }): JSX.Element | null {
  const latest = props.ledger.snapshots[props.ledger.snapshots.length - 1];
  if (latest === undefined) return null;
  return (
    <section aria-labelledby="recorded-heading" class="recorded">
      <h3 id="recorded-heading">Recorded in this browser tab</h3>
      <p>
        {props.ledger.snapshots.length} {props.ledger.snapshots.length === 1 ? "statement" : "statements"}, latest{" "}
        {formatDateLong(latest.date)}. This is kept only while this page stays open; saving to Google is not connected
        yet.
      </p>
      <table class="funds">
        <thead>
          <tr>
            <th scope="col">Fund</th>
            <th scope="col">Value</th>
            <th scope="col">Net invested</th>
          </tr>
        </thead>
        <tbody>
          {props.ledger.funds.map((fund) => {
            const holding = latest.holdings[fund.isin];
            return holding === undefined ? null : (
              <tr key={fund.isin}>
                <th scope="row">{fund.name}<span class="fund-isin">{holding.status === "closed" ? "Closed" : "Active"}</span></th>
                <td><Amount cents={holding.value} /></td>
                <td><Amount cents={holding.netInvested} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function ImportView(props: {
  readonly prepare: ImportPreparer;
  readonly ledger: LedgerState;
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
  const [method, setMethod] = useState<"file" | "manual">("file");
  const [manualStarted, setManualStarted] = useState(false);
  const [fileSaveLocked, setFileSaveLocked] = useState(false);
  const [manualSaveLocked, setManualSaveLocked] = useState(false);
  const saveLocked = fileSaveLocked || manualSaveLocked;
  const [batchLocked, setBatchLocked] = useState(false);
  const [recorded, setRecorded] = useState<IsoDate | null>(null);
  const recordedMessage = useRef<HTMLParagraphElement>(null);
  const reviewHeading = useRef<HTMLDivElement>(null);
  useEffect(() => { props.onWorkflowLock?.(batchLocked || saveLocked); }, [batchLocked, saveLocked, props.onWorkflowLock]);
  useEffect(() => () => { props.onWorkflowLock?.(false); }, [props.onWorkflowLock]);
  useEffect(() => {
    if (phase.name === "reviewed") reviewHeading.current?.focus();
  }, [phase]);
  useEffect(() => { if (recorded !== null) recordedMessage.current?.focus(); }, [recorded]);
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
      setSheetIndex(Math.max(0, review.status === "reviewed" ? review.sheets.findIndex((entry) => entry.outcome.ok) : 0));
      setDate(review.status === "reviewed" ? (review.dateCandidate?.date ?? "") : "");
      setPhase({ name: "reviewed", review });
    } catch {
      if (selection !== fileSelection.current) return;
      setPhase({ name: "reviewed", review: { status: "unreadable-file", message: "The file could not be read." } });
    }
  }

  return (
    <section aria-labelledby="import-heading" class="import">
      <h2 id="import-heading" class="import-heading">{props.historyMode ? "Choose your history files" : method === "manual" ? "Enter a statement" : "Choose bank statements"}</h2>
      <ol class="journey-steps" aria-label="Import process"><li aria-current={phase.name === "idle" && method === "file" ? "step" : undefined}><span>01</span> Choose statements</li><li aria-current={!saveLocked && (method === "manual" || phase.name === "reviewed" || phase.name === "batch") ? "step" : undefined}><span>02</span> Review dates &amp; movements</li><li aria-current={saveLocked ? "step" : undefined}><span>03</span> Save &amp; check</li></ol>
      <Presence show={recorded !== null}>{recorded !== null && <p ref={recordedMessage} class="notice notice-success" role="status" tabIndex={-1}>Statement for {formatDateLong(recorded)} {props.save === undefined ? "recorded in this browser tab" : "saved to your spreadsheet and checked"}. You can choose another statement below.</p>}</Presence>
      {!props.historyMode && <div class="segmented entry-methods" role="group" aria-label="Entry method">
        <button type="button" disabled={saveLocked || batchLocked || phase.name === "reading"} aria-controls="file-entry-panel" aria-pressed={method === "file"} onClick={() => { setMethod("file"); }}>Import Excel</button>
        <button type="button" disabled={saveLocked || batchLocked || phase.name === "reading"} aria-controls="manual-entry-panel" aria-pressed={method === "manual"} onClick={() => { setManualStarted(true); setMethod("manual"); }}>Enter manually</button>
      </div>}
      <div id="manual-entry-panel" class="entry-panel" hidden={method !== "manual"}>
        {manualStarted && <ManualEntry ledger={props.ledger} createRevision={props.createRevision} onRecord={props.onRecord} onSaveLock={setManualSaveLocked} {...(props.save === undefined ? {} : { save: props.save })} />}
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
        <p class="hint" id="file-entry-help">Choose one or more Excel files exported by your bank, or one workbook with a statement on each sheet.</p>
        <p class="footnote" id="file-entry-privacy">
          Supported Fideuram holdings sheets are checked in this browser. The original Excel files are not uploaded;
          confirming an import saves the reviewed sheet contents and your decisions to your private Google spreadsheet.
        </p>
      </div>

      <div aria-live="polite" data-busy={phase.name === "reading"} class="status">
        {phase.name === "reading" && <p class="notice" data-busy="true">Reading and checking the file…</p>}
        {phase.name === "reviewed" && (
          phase.review.status === "reviewed" && phase.review.sheets.some((entry) => entry.outcome.ok)
            ? <p class="notice notice-success">Review ready. Check the details below, then confirm.</p>
            : <p class="notice notice-warning">The file was checked. It has problems, described below.</p>
        )}
      </div>

      {phase.name === "batch" && <ExcelHistoryView key={fileSelection.current} review={phase.review} ledger={props.ledger} onRecord={props.onRecord} onLock={setBatchLocked} {...(props.save === undefined ? {} : { save: props.save })} />}

      {phase.name === "reviewed" && <div ref={reviewHeading} tabIndex={-1} role="region" aria-label="Statement review">
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
      </div>}
      </div>
      {props.save === undefined && <RecordedSummary ledger={props.ledger} />}
    </section>
  );
}
