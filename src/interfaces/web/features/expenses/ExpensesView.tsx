import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ExpenseConflict, ExpenseSaveOutcome } from "../../../../applications/ExpenseModel";
import { formatDateLong, parseIsoDate, type IsoDate } from "../../../../core/IsoDate";
import {
  EMPTY_EXPENSE_AMOUNTS, EXPENSE_LABELS, EXPENSE_REQUIRED_INDICES, EXPENSE_OPTIONAL_INDICES, adjacentWorkday, expenseDayKind, expenseReport, expenseEntryStatus,
  filledExpenseFields, isWorkday, shiftDate, sumExpenseAmounts, sumExpenseDays, weekDates,
  type ExpenseAmounts, type ExpenseCommand, type ExpenseDay,
} from "../../../../core/WorkExpenses";
import { Amount, usePrivacy } from "../../presentation/privacy/privacy";
import { Icon } from "../../shared/ui/icons";
import { PageNav } from "../../shared/ui/PageNav";
import { EMPTY_EXPENSE_DRAFT, expenseDraftChanged, expenseDraftFor, parseExpenseDraft, type ExpenseDraft } from "./expenseDraft";
import "./expenses.css";

type SaveRequest = Pick<ExpenseCommand, "date" | "amounts" | "expectedRevision">;
export interface ExpensesViewProps {
  readonly days: readonly ExpenseDay[];
  readonly history?: readonly ExpenseCommand[];
  readonly conflicts?: readonly ExpenseConflict[];
  readonly today: IsoDate;
  readonly mode: "signed-out" | "device-copy" | "online";
  readonly ready: boolean;
  readonly message?: string;
  readonly pending?: boolean;
  readonly onCheckPending?: () => Promise<ExpenseSaveOutcome>;
  readonly onSave: (request: SaveRequest) => Promise<ExpenseSaveOutcome>;
  readonly onRefresh?: () => Promise<void>;
  readonly onConnect?: () => Promise<void>;
  readonly onRevealAmounts?: () => void;
  readonly onDirtyChange?: (locked: boolean) => void;
}

interface Editor {
  readonly date: IsoDate;
  readonly original: ExpenseAmounts;
  readonly revision: string | null;
  readonly draft: ExpenseDraft;
  readonly resolving: boolean;
}

function editorFor(date: IsoDate, days: readonly ExpenseDay[]): Editor {
  const day = days.find(entry => entry.date === date);
  return { date, original: day?.amounts ?? EMPTY_EXPENSE_AMOUNTS, revision: day?.revision ?? null, draft: day === undefined ? EMPTY_EXPENSE_DRAFT : expenseDraftFor(day.amounts), resolving: false };
}

function weekdayLabel(date: IsoDate): string {
  return new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function workdayLabel(date: IsoDate): string {
  const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return `${weekdayLabel(date)} ${String(Number(date.slice(8)))} ${month}`;
}

function shortDate(date: IsoDate): string {
  return `${weekdayLabel(date)} ${String(Number(date.slice(8)))}`;
}

function labelFor(kind: ReturnType<typeof expenseDayKind>): string {
  switch (kind) {
    case "complete": return "Recorded workday";
    case "partial": return "Needs review";
    case "no-work": return "No onsite work";
    case "future": return "Future date";
    case "outside-history": return "Before tracking";
    case "weekend": return "Weekend";
    default: return "Not entered yet";
  }
}

// A public maximum value sets one intrinsic wrapping footprint in both privacy states. It never measures or
// copies an actual private figure. Annual figures reserve the largest safe amount; amounts that sit in a row with
// a label (a day, a week, an average) reserve a shorter public maximum, so the label keeps its room.
const EXPENSE_AMOUNT_RESERVE = "90.071.992.547.409,91 €";
const EXPENSE_AMOUNT_COMPACT_RESERVE = "999.999,99 €";
function ExpenseAmount(props: Parameters<typeof Amount>[0] & { readonly compact?: boolean }): JSX.Element {
  const { compact, ...amount } = props;
  return <span class={compact === true ? "expense-money expense-money-compact" : "expense-money"}><span class="expense-money-space" aria-hidden="true">{compact === true ? EXPENSE_AMOUNT_COMPACT_RESERVE : EXPENSE_AMOUNT_RESERVE}</span><Amount {...amount} /></span>;
}

/** All amounts and eligibility come from the canonical expense model. This view owns only drafts and inspection. */
export function ExpensesView(props: ExpensesViewProps): JSX.Element {
  const hidden = usePrivacy();
  const [editor, setEditor] = useState(() => editorFor(props.today, props.days));
  const [week, setWeek] = useState(props.today);
  const [year, setYear] = useState(Number(props.today.slice(0, 4)));
  const [policy, setPolicy] = useState<"completed-periods" | "typical-periods">("completed-periods");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState<SaveRequest | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [destination, setDestination] = useState<IsoDate | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [month, setMonth] = useState("");
  const editorElement = useRef<HTMLElement>(null);
  const parsed = parseExpenseDraft(editor.draft);
  const entryStatus = expenseEntryStatus(parsed.amounts);
  const filled = entryStatus.filled;
  const missingRequired = entryStatus.missingRequired.length;
  const requiredEntered = EXPENSE_REQUIRED_INDICES.filter(index => parsed.amounts[index] !== null).length;
  const dirty = editor.resolving || expenseDraftChanged(editor.draft, editor.original);
  const waiting = pending !== null || props.pending === true;
  const locked = dirty || busy || waiting;
  const demo = props.mode === "signed-out";
  const writable = demo || props.mode === "online";
  const conflicts = props.conflicts ?? [];
  const report = expenseReport(props.days, year, props.today, policy);
  const yearConflicts = conflicts.filter(conflict => Number(conflict.date.slice(0, 4)) === year);
  const reportReady = props.ready && yearConflicts.length === 0;
  const editorDay = props.days.find(day => day.date === editor.date);
  const selectedConflict = conflicts.find(conflict => conflict.date === editor.date);
  const earlierVersions = (props.history ?? []).filter(command => command.date === editor.date && command.id !== editorDay?.revision).slice().reverse();
  const selectedKind = expenseDayKind(editorDay, editor.date, props.today, report.startDate);
  const dates = weekDates(week);
  const weekDays = props.days.filter(day => dates.includes(day.date) && day.date <= props.today);
  const weekHasConflict = conflicts.some(conflict => dates.includes(conflict.date));
  const weekTotal = sumExpenseDays(weekDays);
  const weekPartial = weekDays.filter(day => expenseEntryStatus(day.amounts).partial).length;
  const years = [...new Set([Number(props.today.slice(0, 4)), year, ...props.days.map(day => Number(day.date.slice(0, 4))), ...conflicts.map(conflict => Number(conflict.date.slice(0, 4)))])].sort((a, b) => b - a);
  const matchingDays = props.days.filter(day => Number(day.date.slice(0, 4)) === year && (month === "" || day.date.slice(5, 7) === month) && (!reviewOnly || expenseEntryStatus(day.amounts).partial)).sort((a, b) => b.date.localeCompare(a.date));
  const displayedDays = showAll ? matchingDays : matchingDays.slice(0, 6);
  const total = parsed.invalid.length === 0 ? sumExpenseAmounts(parsed.amounts) : null;
  const cannotSave = hidden || !props.ready || !writable || !dirty || busy || waiting || !isWorkday(editor.date) || editor.date > props.today || parsed.invalid.length > 0 || total === null;

  useEffect(() => {
    props.onDirtyChange?.(locked);
    return () => props.onDirtyChange?.(false);
  }, [locked, props.onDirtyChange]);

  useEffect(() => {
    if (!locked) setEditor(current => editorFor(current.date, props.days));
  }, [props.days, locked]);

  useEffect(() => {
    if (!locked) return;
    const guard = (event: BeforeUnloadEvent): void => { event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => { window.removeEventListener("beforeunload", guard); };
  }, [locked]);

  function openDay(date: IsoDate): void {
    if (busy || waiting) return;
    if (date === editor.date) return;
    if (dirty && date !== editor.date) { setDestination(date); return; }
    setEditor(editorFor(date, props.days));
    setWeek(date);
    setReviewing(false);
    setFeedback("");
    setDestination(null);
  }

  function updateField(index: number, value: string): void {
    if (hidden || busy || waiting) return;
    setEditor(current => ({ ...current, draft: current.draft.map((text, field) => field === index ? value : text) as unknown as ExpenseDraft }));
    setReviewing(false);
    setFeedback("");
  }

  function discard(): void {
    if (waiting || busy) return;
    const next = destination ?? editor.date;
    setEditor(editorFor(next, props.days));
    setWeek(next);
    setDestination(null);
    setReviewing(false);
    setFeedback("Draft discarded. Saved entries have not changed.");
  }

  async function save(confirmed = false): Promise<void> {
    if (pending === null && cannotSave) return;
    if (pending === null && editor.revision !== null && !confirmed) { setReviewing(true); return; }
    const request = pending ?? { date: editor.date, amounts: parsed.amounts, expectedRevision: editor.revision };
    setBusy(true);
    setFeedback(pending === null ? "Saving your entry…" : "Checking the original save…");
    try {
      const result = await props.onSave(request);
      if (result.status === "saved") {
        setPending(null);
        setReviewing(false);
        setEditor(editorFor(destination ?? request.date, result.days));
        if (destination !== null) setWeek(destination);
        setDestination(null);
        setFeedback(demo ? "Saved to this demo preview only. Your Google Sheet was not changed." : result.viewUpdated ? "Saved to your Google Sheet." : "Your entry is saved. The readable sheet view needs a refresh; saving again is not needed.");
      } else if (result.status === "unknown") {
        setPending(request);
        setFeedback(result.message);
      } else {
        setPending(null);
        setFeedback(result.message);
        setReviewing(false);
      }
    } catch {
      setPending(request);
      setFeedback("The save outcome could not be confirmed. Keep this entry here and check the original save before continuing.");
    } finally { setBusy(false); }
  }

  function chooseVersion(conflict: ExpenseConflict, amounts: ExpenseAmounts): void {
    if (hidden || locked) { setFeedback(hidden ? "Show amounts before reviewing a version." : "Save or discard your current draft before reviewing another version."); return; }
    setEditor({ date: conflict.date, original: amounts, revision: conflict.revision, draft: expenseDraftFor(amounts), resolving: true });
    setWeek(conflict.date);
    setReviewing(false);
    setFeedback("Review these amounts, then save the correction to resolve the conflicting versions. Both earlier versions remain in history.");
    editorElement.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }

  function recoverVersion(command: ExpenseCommand): void {
    if (hidden || locked || !props.ready || !writable || selectedConflict !== undefined) return;
    const current = editorFor(editor.date, props.days);
    setEditor({ ...current, draft: expenseDraftFor(command.amounts) });
    setReviewing(false);
    setFeedback("Earlier amounts copied into this draft. Review and confirm the correction to save them as a new version; your current saved entry has not changed.");
  }

  async function checkStoredSave(): Promise<void> {
    if (props.onCheckPending === undefined || busy) return;
    setBusy(true);
    try {
      const result = await props.onCheckPending();
      setFeedback(result.status === "saved" ? "The original entry is confirmed saved. You can continue." : result.message);
      if (result.status === "saved") setEditor(editorFor(editor.date, result.days));
    } catch {
      setFeedback("The original save still could not be checked. Nothing new was submitted.");
    } finally { setBusy(false); }
  }

  function renderField(index: 0 | 1 | 2 | 3 | 4): JSX.Element {
    const optional = EXPENSE_OPTIONAL_INDICES.some(field => field === index);
    return <div class={`field expense-field ${parsed.invalid.includes(index) ? "expense-invalid" : ""}`} key={EXPENSE_LABELS[index]}>
      <label for={`expense-${String(index)}`}><span class="expense-field-name">{EXPENSE_LABELS[index]}{optional && <span class="expense-optional-label">Optional</span>}</span><span class="expense-field-unit">EUR</span></label>
      <input id={`expense-${String(index)}`} type="text" inputMode="decimal" autoComplete="off" value={hidden ? "••••" : editor.draft[index]} readOnly={hidden} aria-readonly={hidden} onClick={() => { if (hidden) props.onRevealAmounts?.(); }} disabled={busy || waiting || !isWorkday(editor.date) || editor.date > props.today || !props.ready || selectedConflict !== undefined && !editor.resolving} aria-invalid={parsed.invalid.includes(index)} aria-describedby={parsed.invalid.includes(index) ? `expense-error-${String(index)}` : "expense-entry-help"} onInput={event => { updateField(index, event.currentTarget.value); }} onKeyDown={event => { if (hidden && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); props.onRevealAmounts?.(); } else if (event.key === "Enter") event.preventDefault(); }} />
      {parsed.invalid.includes(index) && <p class="expense-error" id={`expense-error-${String(index)}`}>Use a non-negative amount, for example 12,50.</p>}
    </div>;
  }

  // Previous and Next step one calendar day, weekends included, so any date can be viewed. Only a workday can be recorded.
  const previousDay = shiftDate(editor.date, -1);
  const nextDay = shiftDate(editor.date, 1);
  const previousWorkday = adjacentWorkday(editor.date, -1);
  const nextWorkday = adjacentWorkday(editor.date, 1);
  const stepName = (direction: "Previous" | "Next", target: IsoDate | null): string => `${direction} day${target === null ? "" : `, ${weekdayLabel(target)} ${formatDateLong(target)}`}`;
  const entryDisabled = busy || waiting || !isWorkday(editor.date) || editor.date > props.today || !props.ready || selectedConflict !== undefined && !editor.resolving;
  const yearConflictNote = yearConflicts.length > 0;

  return <section class="dash expenses-dashboard">
    {!demo && (!props.ready || Boolean(props.message)) && <div class="notice cell-12" role="status"><p>{props.message || "Checking your work-expense records…"}</p>{props.onRefresh !== undefined && <button type="button" disabled={busy} onClick={() => void props.onRefresh?.()}>Check records</button>}</div>}
    {props.mode === "device-copy" && <div class="notice cell-12"><p>Showing your saved device copy. Connect to Google before saving changes.</p>{props.onConnect !== undefined && <button type="button" disabled={locked} onClick={() => void props.onConnect?.()}>Reconnect with Google</button>}</div>}
    {props.pending === true && pending === null && <div class="notice cell-12" role="status"><p>An earlier save is awaiting confirmation. Check that original save before editing another day.</p><button type="button" disabled={busy} onClick={() => void checkStoredSave()}>Check original save</button></div>}
    {yearConflictNote && <p class="notice cell-12" role="status">This year has conflicting day versions. Its summaries remain unavailable until those days are resolved below.</p>}

    <article class="card expense-entry" ref={editorElement} aria-labelledby="expense-entry-heading" data-dirty={dirty}>
      <div class="expense-card-heading"><div><p class="eyebrow">{demo ? "Record a day · sample" : "Record a day"}</p><h2 id="expense-entry-heading" class="card-title expense-date" key={editor.date} aria-live="polite" aria-atomic="true" tabIndex={-1}>{weekdayLabel(editor.date)}, {formatDateLong(editor.date)}</h2></div><span class={`expense-state ${entryStatus.partial ? "needs-review" : ""}`}>{selectedConflict !== undefined && !editor.resolving ? "Conflicting versions" : dirty ? "Unsaved changes" : props.ready ? labelFor(selectedKind) : "Not checked"}</span></div>
      <div class="expense-date-controls" role="group" aria-label="Choose a workday">
        <button type="button" aria-label={stepName("Previous", previousDay)} disabled={busy || waiting} onClick={() => { if (previousDay !== null) openDay(previousDay); }}>Previous</button>
        <button type="button" disabled={busy || waiting} onClick={() => { openDay(props.today); }}>Today</button>
        <button type="button" aria-label={stepName("Next", nextDay)} disabled={busy || waiting} onClick={() => { if (nextDay !== null) openDay(nextDay); }}>Next</button>
        <label class="expense-jump"><span class="visually-hidden">Jump to date</span><input type="date" aria-label="Jump to date" value={editor.date} disabled={busy || waiting} onChange={event => { const date = parseIsoDate(event.currentTarget.value); if (date !== null) openDay(date); }} /></label>
      </div>
      {!isWorkday(editor.date) && <div class="expense-note"><p>The tracker covers Monday to Friday; nothing is recorded for this weekend date. You can still browse it with Previous and Next, or jump to the nearest workday.</p><div class="expense-note-actions">{previousWorkday !== null && <button type="button" disabled={busy || waiting} onClick={() => { openDay(previousWorkday); }}>Previous workday: {workdayLabel(previousWorkday)}</button>}{nextWorkday !== null && <button type="button" disabled={busy || waiting} onClick={() => { openDay(nextWorkday); }}>Next workday: {workdayLabel(nextWorkday)}</button>}</div></div>}
      {editor.date > props.today && <p class="expense-note">This is a future date. You can browse ahead; save expenses when the day arrives.</p>}
      <div class="expense-form">
        <h3 class="expense-group-title">Daily essentials</h3><div class="expense-fields expense-required-fields">{EXPENSE_REQUIRED_INDICES.map(renderField)}</div>
        <section class="expense-optional-fields" aria-labelledby="expense-optional-heading">
          <h3 id="expense-optional-heading" class="expense-group-title">Optional work costs</h3>
          <p class="hint">Leave these blank unless they apply. Either cost can complete a day on its own, including an explicit 0.</p>
          <div class="expense-fields">{EXPENSE_OPTIONAL_INDICES.map(renderField)}</div>
        </section>
        <p id="expense-entry-help" class="hint">{demo ? "Try recording a day with invented data. Your own records stay separate." : "Track your commute, meals and other costs of working onsite."} Amounts in EUR. Use a comma for decimals and enter 0 when nothing was paid. Blanks stay blank.</p>
      </div>
      <div class="expense-day-total"><div><span class="card-label">{entryStatus.complete ? "Day total" : "Recorded so far"}</span><p class="expense-total"><ExpenseAmount cents={filled === 0 ? null : total} /></p></div><div class="expense-entry-completeness"><span>{entryStatus.complete && requiredEntered < EXPENSE_REQUIRED_INDICES.length ? "Work costs recorded; day complete" : `${String(requiredEntered)} of ${String(EXPENSE_REQUIRED_INDICES.length)} daily costs entered`}</span>{entryStatus.partial && <span class="expense-state needs-review">{missingRequired} {missingRequired === 1 ? "daily cost needs" : "daily costs need"} review</span>}<span class="expense-state expense-zero-slot" aria-hidden={hidden || !entryStatus.complete || total !== 0}>Zero-cost workday</span></div></div>
      <div class="expense-entry-actions"><div class="expense-save-slot" data-private={hidden}><button type="button" class="primary expense-save-button" aria-hidden={hidden} tabIndex={hidden ? -1 : 0} disabled={cannotSave} onClick={() => void save()}>{busy ? "Saving…" : editor.resolving ? "Save resolution" : editor.revision !== null ? "Review correction" : entryStatus.complete ? "Save day" : "Save partial day"}</button><button type="button" class="primary expense-reveal" aria-hidden={!hidden} tabIndex={hidden ? 0 : -1} disabled={!hidden || busy || waiting} onClick={() => { props.onRevealAmounts?.(); requestAnimationFrame(() => { document.getElementById("expense-0")?.focus({ preventScroll: true }); }); }}>Show amounts to edit</button></div><button type="button" disabled={hidden || entryDisabled} onClick={() => { if (filled === 0) setEditor(current => ({ ...current, draft: EMPTY_EXPENSE_DRAFT.map((_, index) => EXPENSE_REQUIRED_INDICES.some(field => field === index) ? "0" : "") as unknown as ExpenseDraft })); else setFeedback("Clear or review the existing amounts before marking a zero-cost day."); }}>{editor.date === props.today ? "No costs today" : "No costs this day"}</button>{dirty && <button type="button" disabled={busy || waiting} onClick={discard}>Discard draft</button>}</div>
      {reviewing && <div class="expense-review" role="region" aria-label="Review correction"><h3>{filled === 0 ? "Change this day to no onsite work?" : editor.resolving ? "Resolve these conflicting versions?" : "Review your correction"}</h3><p>{filled === 0 ? "All five fields will be blank. This past weekday will no longer count as a recorded onsite workday. The earlier entry remains in history." : "Confirm the amounts below. This saves a new revision and keeps the earlier entry recoverable in history."}</p><dl>{EXPENSE_LABELS.map((label, index) => <div key={label}><dt>{label}</dt><dd><ExpenseAmount cents={editor.original[index] ?? null} empty="Blank" /><span aria-hidden="true"> → </span><span class="visually-hidden"> changes to </span><ExpenseAmount cents={parsed.amounts[index] ?? null} empty="Blank" /></dd></div>)}</dl><div class="expense-entry-actions"><button class="primary" type="button" disabled={hidden || busy} onClick={() => void save(true)}>Confirm correction</button><button type="button" disabled={busy} onClick={() => { setReviewing(false); }}>Keep editing</button></div></div>}
      {destination !== null && <div class="expense-review" role="region" aria-label="Unsaved day"><h3>Your changes are still here</h3><p>Save this day or discard its draft before opening {formatDateLong(destination)}.</p><div class="expense-entry-actions"><button type="button" onClick={() => { setDestination(null); }}>Keep editing</button><button type="button" disabled={cannotSave} onClick={() => void save()}>Save this day</button><button type="button" onClick={discard}>Discard and open day</button></div></div>}
      <div class="expense-save-feedback" role="status" aria-live="polite"><p>{feedback || (dirty ? "Your changes are not saved yet." : editor.revision !== null ? demo ? "Demo entry. Changes affect this preview only." : "This entry is saved." : "Your entries will be saved only when you choose Save.")}</p>{pending !== null && <button type="button" disabled={busy} onClick={() => void save(true)}>Check save outcome</button>}</div>
      {earlierVersions.length > 0 && <details class="expense-previous"><summary>Previous saved versions <span class="expense-version-count">{earlierVersions.length}</span></summary><p class="hint">Earlier entries stay in history. Use their amounts as a draft, then review and confirm a new correction.</p>{earlierVersions.map((command, index) => <details class="expense-old-version" key={command.id}><summary>Earlier version {earlierVersions.length - index}</summary><dl>{EXPENSE_LABELS.map((label, field) => <div key={label}><dt>{label}</dt><dd><ExpenseAmount cents={command.amounts[field] ?? null} empty="Blank" /></dd></div>)}</dl><button type="button" disabled={hidden || locked || !props.ready || !writable || selectedConflict !== undefined} onClick={() => { recoverVersion(command); }}>Use these amounts</button></details>)}</details>}
    </article>

    <article class="card expense-week" aria-labelledby="expense-week-heading"><div class="expense-card-heading"><div><h2 id="expense-week-heading" class="card-title" tabIndex={-1}>Your week</h2><p class="card-subtitle">{dates[0] === undefined ? "" : formatDateLong(dates[0])} to {dates[4] === undefined ? "" : formatDateLong(dates[4])}</p></div><div class="expense-week-controls"><button type="button" aria-label="Previous week" onClick={() => { const date = shiftDate(week, -7); if (date !== null) setWeek(date); }}><Icon name="back" size={18} /></button><button type="button" aria-label="Next week" onClick={() => { const date = shiftDate(week, 7); if (date !== null) setWeek(date); }}><Icon name="chevron" size={18} /></button></div></div>
      <ul class="expense-week-list">{dates.map(date => { const day = props.days.find(entry => entry.date === date); const kind = expenseDayKind(day, date, props.today, report.startDate); const conflict = conflicts.some(entry => entry.date === date); return <li key={date}><button type="button" aria-pressed={date === editor.date} disabled={busy || waiting} onClick={() => { openDay(date); }}><span class="expense-week-date">{shortDate(date)}</span><span class={`expense-week-state ${kind === "partial" || conflict ? "needs-review" : ""}`}>{!props.ready ? "Not checked" : conflict ? "Conflicting versions" : labelFor(kind)}</span><span class="expense-week-amount">{day === undefined || filledExpenseFields(day.amounts) === 0 ? <span aria-hidden="true">-</span> : <ExpenseAmount compact cents={sumExpenseAmounts(day.amounts)} />}</span><Icon name="chevron" size={16} /></button></li>; })}</ul>
      <div class="expense-week-footer"><span class="card-label">Recorded week spending</span><p class="expense-total"><ExpenseAmount compact cents={!props.ready || weekHasConflict || !weekDays.some(day => filledExpenseFields(day.amounts) > 0) ? null : weekTotal} /></p><p class="hint">{weekHasConflict ? "Resolve this week’s conflicting versions before its total can be shown." : "Known amounts only."}{weekPartial > 0 ? ` ${String(weekPartial)} ${weekPartial === 1 ? "day needs" : "days need"} review.` : " Zero-cost workdays count."}</p></div>
      {(report.partialDays > 0 || conflicts.length > 0) && <a class="expense-review-link" href="#expense-record" onClick={event => { event.preventDefault(); setReviewOnly(true); setShowAll(true); document.getElementById("expense-record")?.scrollIntoView({ behavior: "auto", block: "start" }); }}>Review incomplete or conflicting days <Icon name="chevron" size={18} /></a>}
    </article>

    <PageNav items={[{ id: "expense-year-heading", label: "Year" }, { id: "expense-breakdown", label: "Categories" }, { id: "expense-record-heading", label: "Record" }]} />

    <section class="expense-year-section" aria-labelledby="expense-year-heading">
      <div class="expense-section-heading"><h2 id="expense-year-heading" tabIndex={-1}>Your {year}</h2><label class="expense-year"><span>Reporting year</span><select value={year} onChange={event => { setYear(Number(event.currentTarget.value)); setMonth(""); }}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
      <div class="expense-year-grid">
        <article class="card expense-annual" aria-label={`Annual spending in ${String(year)}`}><div class="expense-annual-actual"><span class="card-label">Total Yearly</span><p class="expense-metric-value"><ExpenseAmount cents={reportReady ? report.totalYearly : null} /></p><p class="hint">All recorded amounts in this year.{report.partialDays > 0 ? ` Includes known amounts from ${String(report.partialDays)} incomplete ${report.partialDays === 1 ? "day" : "days"}.` : ""}</p></div><div class="expense-projection"><span class="card-label">Yearly Projection <span class="expense-state">Estimate</span></span><p class="expense-total"><ExpenseAmount cents={reportReady ? report.yearlyProjection : null} /></p><p class="hint">Daily average × {report.weekdaysInYear} weekdays. Holidays and leave are not deducted.</p></div></article>
        <section class="card expense-averages" aria-labelledby="expense-averages-heading"><div class="expense-card-heading"><h3 id="expense-averages-heading" class="card-title">Your average working costs</h3><span class="expense-state">{policy === "completed-periods" ? "Completed periods" : "Typical periods · estimate"}</span></div><p class="card-subtitle">Saved entries only. Figures for {year}. Your current draft is not included.</p><div class="expense-average-grid">
        {[
          { title: "Average Daily", amount: report.averageDaily, note: `${String(report.completeDays)} recorded ${report.completeDays === 1 ? "workday" : "workdays"}, including zero-cost days. Optional costs may be blank.`, unavailable: "Record a complete workday to see your daily average." },
          { title: "Average Weekly", amount: report.averageWeekly, note: policy === "completed-periods" ? `${String(report.eligibleWeeks)} completed eligible ${report.eligibleWeeks === 1 ? "week" : "weeks"}.` : "Typical five-day week, estimated from your daily average.", unavailable: "No eligible completed week yet." },
          { title: "Average Monthly", amount: report.averageMonthly, note: policy === "completed-periods" ? `${String(report.eligibleMonths)} completed eligible ${report.eligibleMonths === 1 ? "month" : "months"}.` : "Typical month, estimated from the year's weekdays.", unavailable: "No eligible completed month yet." },
        ].map(metric => <div class="expense-metric" key={metric.title}><p class="card-label">{metric.title}</p><p class="expense-metric-value"><ExpenseAmount compact cents={reportReady ? metric.amount : null} /></p><p class="stat-caption">{yearConflicts.length > 0 ? "Resolve conflicting days to calculate this summary." : metric.amount === null ? metric.unavailable : metric.note}</p></div>)}
        </div></section>
      </div>
    </section>

    <details class="expense-breakdown" id="expense-breakdown" tabIndex={-1}><summary>Where it goes</summary><p class="card-subtitle">Recorded amounts by category in {year}. Partial entries retain their known amounts.</p><ul class="expense-category-list">{EXPENSE_LABELS.map((label, index) => { const amount = report.categoryTotals[index] ?? null; const maximum = Math.max(1, ...report.categoryTotals.map(value => value ?? 0)); return <li key={label}><div><span>{label}</span><ExpenseAmount cents={reportReady && report.totalYearly !== null ? amount : null} /></div>{reportReady && report.totalYearly !== null && <span class="expense-category-track" aria-hidden="true"><span class={`expense-category-bar expense-category-${String(index)}`} data-masked={hidden} style={{ width: hidden ? "100%" : `${String((amount ?? 0) / maximum * 100)}%` }} /></span>}</li>; })}</ul><p class="hint">Bar lengths compare categories within this year; they do not imply good or bad spending.</p></details>
    <details class="expense-definitions"><summary>How these summaries work</summary><div class="expense-policy-control"><label for="expense-policy">Weekly and monthly view</label><select id="expense-policy" value={policy} onChange={event => { setPolicy(event.currentTarget.value === "typical-periods" ? "typical-periods" : "completed-periods"); }}><option value="completed-periods">Actual completed periods</option><option value="typical-periods">Estimated typical periods</option></select></div><p>Daily averages use complete days: either Dinner or Other Expenses is entered, or both commutes and lunch are recorded. Explicit zeroes count. Optional costs can complete a day on their own; other blanks stay blank. All entered costs are included. A blank past weekday inside your tracked history means no onsite work. Incomplete routine entries without optional costs stay visible for review and do not count in averages.</p><p>{policy === "completed-periods" ? "Weekly and monthly averages use completed periods with recorded workdays, wholly inside the year's tracked history. Periods containing an incomplete entry are excluded." : "Typical weeks use five times your daily average. Typical months use the year's weekday count divided by twelve. These are estimates, not averages of actual completed periods."}</p><p>Annual spending includes every known amount; the projection uses complete workdays only. Future entries are excluded. All figures use exact cents and rounded displayed averages.</p>{report.startDate !== null && <p>Tracked history begins {formatDateLong(report.startDate)}. Earlier dates have no coverage.</p>}</details>

    <article class="card expense-record" id="expense-record" aria-labelledby="expense-record-heading"><div class="expense-card-heading"><h2 id="expense-record-heading" class="card-title" tabIndex={-1}>Your record</h2><button type="button" onClick={() => { setShowAll(value => !value); }}>{showAll ? "Show recent days" : "View all days"}</button></div><div class="expense-record-filters"><label>Month<select value={month} onChange={event => { setMonth(event.currentTarget.value); }}><option value="">All months in {year}</option>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, "0")}>{new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, index, 1)))}</option>)}</select></label><label class="expense-review-filter"><input type="checkbox" checked={reviewOnly} onChange={event => { setReviewOnly(event.currentTarget.checked); setShowAll(true); }} />Needs review only</label></div>
      {conflicts.filter(conflict => Number(conflict.date.slice(0, 4)) === year && (month === "" || conflict.date.slice(5, 7) === month)).map(conflict => <div class="expense-conflict" key={conflict.date}><h3>{formatDateLong(conflict.date)} · Conflicting versions</h3><p>Two devices changed this day. Review a version, then save a correction. No version has silently replaced the other.</p>{conflict.versions.map((version, index) => <details key={version.revision}><summary>Version {index + 1}</summary><dl>{EXPENSE_LABELS.map((label, field) => <div key={label}><dt>{label}</dt><dd><ExpenseAmount cents={version.amounts[field] ?? null} empty="Blank" /></dd></div>)}</dl><button type="button" disabled={hidden || locked} onClick={() => { chooseVersion(conflict, version.amounts); }}>Review this version</button></details>)}</div>)}
      {displayedDays.length === 0 && <p class="empty-note">{props.ready ? reviewOnly ? "No incomplete entries match this view." : "No recorded days in this view yet. Start with a day above, or choose a past date to backfill." : "Your expense record has not been checked yet."}</p>}
      <ul class="expense-record-list">{displayedDays.map(day => { const status = expenseEntryStatus(day.amounts); const filledDay = status.filled; return <li key={day.date}><button type="button" disabled={busy || waiting} onClick={() => { openDay(day.date); editorElement.current?.scrollIntoView({ behavior: "auto", block: "start" }); }}><span class="expense-record-label"><span class="expense-record-date">{formatDateLong(day.date)}</span><span class={`expense-record-state ${status.partial ? "needs-review" : ""}`}>{labelFor(expenseDayKind(day, day.date, props.today, report.startDate))}{status.partial ? ` · ${String(status.missingRequired.length)} daily costs missing` : ""}</span></span><span class="expense-record-value"><ExpenseAmount compact cents={filledDay === 0 ? null : sumExpenseAmounts(day.amounts)} /></span><Icon name="chevron" size={16} /><span class="visually-hidden">{status.partial ? "Review day" : "Edit day"}</span></button></li>; })}</ul>
      {!showAll && matchingDays.length > displayedDays.length && <p class="hint">Showing {displayedDays.length} of {matchingDays.length} recorded days in this view.</p>}
    </article>
    {demo && <div class="expenses-demo card cell-12"><div><p class="card-label">Try it with invented data</p><p>This preview stays separate from your records. Continue with Google to start your own tracker.</p></div>{props.onConnect !== undefined && <button class="primary" type="button" disabled={locked} onClick={() => void props.onConnect?.()}>Continue with Google</button>}</div>}
  </section>;
}
