import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { type IsoDate, formatDateLong, parseIsoDate } from "../../../../core/IsoDate";
import type { LedgerState } from "../../../../core/Ledger";
import { formatEuro } from "../../../../core/Money";
import type { DateSource } from "../../../../core/StatementDate";
import { CashQuestions } from "./CashQuestions";
import type {
  ImportFile,
  ImportPreparer,
  ImportReview,
  ReviewAdjustment,
  ReviewIssue,
  ReviewStatement,
} from "./ImportModel";

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
      <dl class="kpis">
        <div>
          <dt>Funds found</dt>
          <dd>{statement.funds.length}</dd>
        </div>
        <div>
          <dt>Funds subtotal</dt>
          <dd>{formatEuro(statement.fundsSubtotal)}</dd>
        </div>
        <div>
          <dt>Grand total</dt>
          <dd>{statement.total === null ? "Not in the file" : formatEuro(statement.total)}</dd>
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
              <th scope="col">ISIN</th>
              <th scope="col">Market value</th>
            </tr>
          </thead>
          <tbody>
            {statement.funds.map((fund) => (
              <tr key={fund.isin}>
                <th scope="row">{fund.name}</th>
                <td>{fund.isin}</td>
                <td>{formatEuro(fund.marketValue)}</td>
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
              <td>{category.subtotal === null ? "–" : formatEuro(category.subtotal)}</td>
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
}): JSX.Element {
  const { review, sheetIndex, date } = props;
  const chosen = parseIsoDate(date);
  const sheet = review.sheets[sheetIndex];

  return (
    <div class="review">
      <h3>Review</h3>

      <div class="field">
        <label for="statement-date">Statement date</label>
        <input id="statement-date" type="date" value={date} onInput={(event) => {
            props.onDate(event.currentTarget.value);
          }}
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
            <th scope="col">Status</th>
            <th scope="col">Value</th>
            <th scope="col">Net invested</th>
          </tr>
        </thead>
        <tbody>
          {props.ledger.funds.map((fund) => {
            const holding = latest.holdings[fund.isin];
            return holding === undefined ? null : (
              <tr key={fund.isin}>
                <th scope="row">{fund.name}</th>
                <td>{holding.status === "closed" ? "Closed" : "Active"}</td>
                <td>{formatEuro(holding.value)}</td>
                <td>{formatEuro(holding.netInvested)}</td>
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
  readonly initialPhase?: Phase;
}): JSX.Element {
  const [phase, setPhase] = useState<Phase>(props.initialPhase ?? { name: "idle" });
  const [sheetIndex, setSheetIndex] = useState(0);
  const [date, setDate] = useState("");

  async function choose(file: File): Promise<void> {
    setPhase({ name: "reading" });
    const wrapped: ImportFile = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      read: async () => new Uint8Array(await file.arrayBuffer()),
    };
    try {
      const review = await props.prepare(wrapped);
      setSheetIndex(Math.max(0, review.status === "reviewed" ? review.sheets.findIndex((entry) => entry.outcome.ok) : 0));
      setDate(review.status === "reviewed" ? (review.dateCandidate?.date ?? "") : "");
      setPhase({ name: "reviewed", review });
    } catch {
      setPhase({ name: "reviewed", review: { status: "unreadable-file", message: "The file could not be read." } });
    }
  }

  return (
    <section aria-labelledby="import-heading" class="import">
      <h2 id="import-heading">Import a bank statement</h2>
      <p>
        Choose the Excel file exactly as the bank exported it. It is read and checked in this browser; it is not
        uploaded.
      </p>
      <div class="field">
        <label for="statement-file">Statement file (.xlsx)</label>
        <input
          id="statement-file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (file !== undefined) void choose(file);
            input.value = "";
          }}
        />
      </div>

      <div aria-live="polite" class="status">
        {phase.name === "reading" && <p>Reading and checking the file…</p>}
        {phase.name === "reviewed" && (
          <p>
            {phase.review.status === "reviewed" && phase.review.sheets.some((entry) => entry.outcome.ok)
              ? "Review ready."
              : "The file was checked. It has problems, described below."}
          </p>
        )}
      </div>

      {phase.name === "reviewed" &&
        (phase.review.status === "unreadable-file" ? (
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
            ledger={props.ledger}
            createRevision={props.createRevision}
            onRecord={(next) => {
              props.onRecord(next);
              setPhase({ name: "idle" });
            }}
          />
        ))}
      <RecordedSummary ledger={props.ledger} />
    </section>
  );
}
