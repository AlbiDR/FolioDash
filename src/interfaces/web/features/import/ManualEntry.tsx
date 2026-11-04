import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { formatDateLong, parseIsoDate } from "../../../../core/IsoDate";
import type { LedgerState } from "../../../../core/Ledger";
import { Amount } from "../../presentation/privacy/privacy";
import { CashQuestions } from "./CashQuestions";
import type { RemoteSave, ReviewStatement } from "../../../../applications/ImportModel";
import { type ManualRow, prepareManualStatement } from "./ManualStatement";

interface EntryRow extends ManualRow { readonly id: string; readonly known: boolean }
function startingRows(ledger: LedgerState): EntryRow[] {
  const latest = ledger.snapshots.at(-1);
  return ledger.funds.filter(fund => latest?.holdings[fund.isin]?.status === "active")
    .map(fund => ({ id: `known-${fund.isin}`, known: true, name: fund.name, isin: fund.isin, amount: "" }));
}

export function ManualEntry(props: {
  readonly ledger: LedgerState; readonly save?: RemoteSave;
  readonly createRevision: () => string; readonly onRecord: (next: LedgerState) => void;
  readonly onSaveLock?: (locked: boolean) => void;
}): JSX.Element {
  const sequence = useRef(0);
  const pendingFocus = useRef<string | null>(null);
  const blank = (): EntryRow => ({ id: `new-${String(++sequence.current)}`, known: false, name: "", isin: "", amount: "" });
  const [rows, setRows] = useState<EntryRow[]>(() => {
    const held = startingRows(props.ledger);
    return held.length ? held : [blank()];
  });
  const [date, setDate] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [editing, setEditing] = useState(true);
  const [saveLocked, setSaveLocked] = useState(false);
  const [emptyConfirmed, setEmptyConfirmed] = useState(false);
  const [removed, setRemoved] = useState<{ row: EntryRow; index: number } | null>(null);
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const [savedDate, setSavedDate] = useState("");
  const [review, setReview] = useState<{ statement: ReviewStatement; date: NonNullable<ReturnType<typeof parseIsoDate>>; key: string } | null>(null);
  const result = prepareManualStatement(rows);
  const chosen = parseIsoDate(date);
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const node = document.getElementById(pendingFocus.current);
    if (node === null) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest", behavior: "instant" });
    pendingFocus.current = null;
  }, [rows, removed, editing, review, savedDate]);

  function update(id: string, field: keyof ManualRow, value: string): void {
    setRows(current => current.map(row => row.id === id ? { ...row, [field]: value } : row));
    setSavedDate("");
  }
  function continueReview(event: Event): void {
    event.preventDefault(); setAttempted(true);
    if (chosen === null || !result.ok || (rows.length === 0 && !emptyConfirmed)) return;
    pendingFocus.current = "manual-review-heading";
    setReview({ statement: result.statement, date: chosen, key: JSON.stringify([chosen, rows]) });
    setEditing(false);
  }
  function recorded(next: LedgerState): void {
    pendingFocus.current = "manual-recorded";
    setSavedDate(date); setRows(startingRows(next)); setDate(""); setReview(null);
    setEditing(true); setAttempted(false); setRemoved(null); setEmptyConfirmed(false);
    setSaveLocked(false); props.onSaveLock?.(false); props.onRecord(next);
  }
  const lock = (locked: boolean): void => { setSaveLocked(locked); props.onSaveLock?.(locked); };

  return <section class="manual-entry" aria-labelledby="manual-heading">
    <header><h3 id="manual-heading">Update your fund values</h3>
      <p>Enter every fund held on the same date. Money movements are reviewed separately before saving.</p>
      <p class="hint">{editing ? "Step 1 of 3: values and date" : "Step 2 of 3: movements and review. Confirm save when ready."}</p>
    </header>
    {savedDate && <p id="manual-recorded" class="notice" role="status" tabIndex={-1}>Update for {savedDate} recorded. You can start another update below.</p>}
    <form hidden={!editing} onSubmit={continueReview}>
      <div class="field"><label for="manual-date">Valuation date</label>
        <input id="manual-date" type="date" required aria-describedby="manual-date-hint" value={date} onInput={event => { setDate(event.currentTarget.value); }} />
        <p id="manual-date-hint" class="hint">The date these values refer to, not necessarily today.</p>
      </div>
      <div class="manual-funds">{rows.map((row, index) => {
        const checked = prepareManualStatement([row]);
        const errors = attempted && !checked.ok ? checked.errors : [];
        return <fieldset key={row.id} class={`manual-fund${restoredId === row.id ? " restored-fund" : ""}`}>
          <legend>{row.known ? row.name : `New fund ${String(index + 1)}`}</legend>
          {row.known ? <p class="hint">{row.isin}</p> : <>
            <div class="field"><label for={`${row.id}-name`}>Fund name</label><input id={`${row.id}-name`} required value={row.name} onInput={event => { update(row.id, "name", event.currentTarget.value); }} /></div>
            <div class="field"><label for={`${row.id}-isin`}>ISIN</label><input id={`${row.id}-isin`} required autoCapitalize="characters" spellcheck={false} value={row.isin} onInput={event => { update(row.id, "isin", event.currentTarget.value.toUpperCase()); }} /></div>
          </>}
          <div class="field"><label for={`${row.id}-value`}>Current value (EUR)</label>
            <input id={`${row.id}-value`} required inputMode="decimal" autoComplete="off" placeholder="10.000,00" value={row.amount} aria-invalid={errors.length > 0} aria-describedby={`${row.id}-help`} onInput={event => { update(row.id, "amount", event.currentTarget.value); }} />
            <p id={`${row.id}-help`} class="hint">Comma for decimals. Enter 0 explicitly for a zero value.</p>
          </div>
          {errors.length > 0 && <ul class="field-error">{errors.map(error => <li key={error}>{error.replace("Fund 1: ", "")}</li>)}</ul>}
          <button type="button" onClick={() => { pendingFocus.current = "undo-removed-fund"; setRemoved({ row, index }); setRows(current => current.filter(item => item.id !== row.id)); setEmptyConfirmed(false); }}>Not held on this date</button>
        </fieldset>;
      })}</div>
      {removed !== null && <div class="notice" role="status">{removed.row.name || "Fund"} removed from this entry only. History is unchanged; sales are reviewed next.
        <button id="undo-removed-fund" type="button" onClick={() => { pendingFocus.current = `${removed.row.id}-${removed.row.known ? "value" : "name"}`; setRestoredId(removed.row.id); setRows(current => [...current.slice(0, removed.index), removed.row, ...current.slice(removed.index)]); setRemoved(null); }}>Undo removal</button>
      </div>}
      <button type="button" onClick={() => { const row = blank(); pendingFocus.current = `${row.id}-name`; setRows(current => [...current, row]); }}>Add another fund</button>
      {rows.length === 0 && <label><input type="checkbox" checked={emptyConfirmed} onChange={event => { setEmptyConfirmed(event.currentTarget.checked); }} /> I hold no funds on this date. Review closures and full proceeds next.</label>}
      {attempted && !result.ok && <div class="review-problem" role="alert"><h4>Check your entries</h4><ul>{result.errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
      {attempted && rows.length === 0 && !emptyConfirmed && <p role="alert">Confirm that no funds are held, or add a fund.</p>}
      <div class="manual-total" data-complete={result.ok} aria-live="polite"><span>{rows.length} {rows.length === 1 ? "fund" : "funds"}</span><strong>{result.ok ? <Amount cents={result.statement.fundsSubtotal} /> : "Complete the values to see the total"}</strong></div>
      <p class="hint">No bank document is attached. Nothing is saved until final confirmation. Switching entry methods preserves this page's draft; leaving or reloading can discard it.</p>
      <button class="primary" type="submit">Continue to movements and review</button>
    </form>
    {review !== null && <div hidden={editing} class="review">
      <h4 id="manual-review-heading" tabIndex={-1}>Review movements before saving</h4>
      <p>{formatDateLong(review.date)} / {review.statement.funds.length} funds / <Amount cents={review.statement.fundsSubtotal} /></p>
      <button type="button" disabled={saveLocked} onClick={() => { pendingFocus.current = "manual-date"; setEditing(true); }}>Back to values</button>
      <p class="hint">Cash answers stay if values are unchanged. Changing values starts a fresh review.</p>
      <CashQuestions key={review.key} statement={review.statement} date={review.date} ledger={props.ledger} createRevision={props.createRevision} onRecord={recorded} onSaveLock={lock} {...(props.save === undefined ? {} : { save: props.save })} />
    </div>}
  </section>;
}
