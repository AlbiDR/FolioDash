import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import type { Checkpoint, CheckpointCommand } from "../../../../core/Checkpoints";
import { MAX_NOTE_LENGTH, isSafeNote } from "../../../../core/Checkpoints";
import { type IsoDate, formatDateLong, parseIsoDate } from "../../../../core/IsoDate";
import { type EuroCents, parseItalianAmount } from "../../../../core/Money";
import { Amount, usePrivacy } from "../../presentation/privacy/privacy";
import "./checkpoints.css";

/** The slice of the checkpoint session this screen needs. The app supplies it; nothing here talks to Google. */
export interface CheckpointScreenState {
  readonly ready: boolean;
  readonly active: readonly Checkpoint[];
  /** Saves that were sent but never confirmed. While any exists, nothing else can be saved. */
  readonly pending: readonly CheckpointCommand[];
  /** The device's record of an unsent save could not be read, so nothing can be saved. */
  readonly unreadable: boolean;
  readonly message: string;
  readonly preserved: readonly { readonly workbookId: string; readonly active: readonly Checkpoint[]; readonly pending: readonly CheckpointCommand[]; readonly unreadable: boolean }[];
}

/** What a save, a withdrawal or a check came to. Only `saved` and `no-change` leave nothing to explain. */
export interface CheckpointAction { readonly status: "saved" | "no-change" | "refused" | "not-saved" | "unknown"; readonly message: string }

/** Newest date first; checkpoints on one date keep the order they were recorded in, latest first. */
function listed(active: readonly Checkpoint[]): readonly Checkpoint[] {
  return active.map((entry, index) => ({ entry, index })).sort((left, right) => (left.entry.date === right.entry.date ? right.index - left.index : left.entry.date < right.entry.date ? 1 : -1)).map(({ entry }) => entry);
}

/** What a never-confirmed save was, in words, so the person can tell whether to expect it. */
function PendingDescription(props: { readonly command: CheckpointCommand; readonly active: readonly Checkpoint[] }): JSX.Element {
  const { command } = props;
  if (command.kind === "add") return <>Save of {formatDateLong(command.date)}, <Amount cents={command.cents} />{command.note === "" ? "" : `, note "${command.note}"`}</>;
  const target = props.active.find((entry) => entry.id === command.target);
  return target === undefined ? <>Withdrawal of a checkpoint</> : <>Withdrawal of the checkpoint of {formatDateLong(target.date)}, <Amount cents={target.cents} /></>;
}

function PreservedList(props: { readonly workbookId: string; readonly active: readonly Checkpoint[]; readonly pending: readonly CheckpointCommand[]; readonly unreadable: boolean; readonly text: (masked: boolean) => string }): JSX.Element {
  const [copied, setCopied] = useState("");
  // The text view and the copy follow the privacy toggle: with amounts hidden they leave the amounts out.
  const hidden = usePrivacy();
  const text = props.text(hidden);
  return (
    <section class="card checkpoint-preserved" aria-labelledby={`preserved-${props.workbookId}`}>
      <h3 id={`preserved-${props.workbookId}`} class="card-title">Kept from another workbook</h3>
      <p class="card-subtitle">These checkpoints belong to a workbook that is not the one connected now. They are kept on this device, read only. They are not restored into a new workbook.{props.pending.length > 0 ? " A save from that workbook was never confirmed; it is listed below and included in the copy." : ""}{props.unreadable ? " This device's record of an unsent save for it could not be read; it was left untouched." : ""}{hidden ? " Amounts are hidden, so the text below and the copy leave them out." : ""}</p>
      {props.pending.length > 0 && <ul class="checkpoint-list checkpoint-unconfirmed" aria-label="Unconfirmed saves">{props.pending.map((command) => <li key={command.id}><span class="checkpoint-date">Unconfirmed</span><span class="checkpoint-note"><PendingDescription command={command} active={props.active} /></span></li>)}</ul>}
      {props.active.length === 0 ? <p class="empty-note">No confirmed checkpoints.</p> : <ul class="checkpoint-list">{listed(props.active).map((entry) => <li key={entry.id}><span class="checkpoint-date">{formatDateLong(entry.date)}</span><span class="checkpoint-value"><Amount cents={entry.cents} /></span>{entry.note !== "" && <span class="checkpoint-note">{entry.note}</span>}</li>)}</ul>}
      <div class="checkpoint-actions">
        <button type="button" disabled={text === ""} onClick={() => {
          const clipboard = (navigator as { readonly clipboard?: Clipboard }).clipboard;
          if (clipboard === undefined) { setCopied("Copying is not available here. Select the text below instead."); return; }
          void clipboard.writeText(text).then(() => { setCopied("Copied."); }, () => { setCopied("Copying was not allowed. Select the text below instead."); });
        }}>Copy as text</button>
        <span role="status" aria-live="polite">{copied}</span>
      </div>
      <label class="field">The same list as text
        <textarea readOnly rows={Math.min(8, Math.max(2, props.active.length))} value={text} aria-label="Checkpoints kept from another workbook, as text" />
      </label>
    </section>
  );
}

/**
 * Value-only checkpoints: the portfolio's total value on a day, and nothing else. They never change a
 * statement or a figure, and a deposit between two of them shows up as a jump in value.
 */
export function CheckpointsView(props: {
  readonly signedOut: boolean;
  readonly state: CheckpointScreenState;
  readonly today: IsoDate;
  readonly onAdd: (request: { readonly date: IsoDate; readonly cents: EuroCents; readonly note: string }) => Promise<CheckpointAction>;
  readonly onVoid: (id: string) => Promise<CheckpointAction>;
  readonly onCheck: () => Promise<CheckpointAction>;
  readonly preservedText: (workbookId: string, masked: boolean) => string;
}): JSX.Element {
  const signedOut = props.signedOut;
  const [date, setDate] = useState<string>(props.today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);

  async function save(event: Event): Promise<void> {
    event.preventDefault();
    setOutcome("");
    const parsedDate = parseIsoDate(date);
    const cents = parseItalianAmount(amount);
    if (parsedDate === null) { setProblem("Choose a date."); return; }
    if (parsedDate > props.today) { setProblem("A checkpoint can be recorded only when its day has come."); return; }
    if (cents === null || cents < 0) { setProblem("Enter the total value as a positive amount in Italian notation, for example 12.345,67."); amountInput.current?.focus(); return; }
    if (!isSafeNote(note)) { setProblem(`Keep the note under ${String(MAX_NOTE_LENGTH)} characters and do not start it with = + - or @.`); return; }
    setProblem("");
    setBusy(true);
    const result = await props.onAdd({ date: parsedDate, cents, note });
    setBusy(false);
    if (result.status === "saved") { setAmount(""); setNote(""); setOutcome("Checkpoint saved."); }
    else if (result.status === "no-change") setOutcome("Nothing to change.");
    else setProblem(result.message);
  }

  async function withdraw(id: string): Promise<void> {
    setConfirming(null);
    setOutcome("");
    setBusy(true);
    const result = await props.onVoid(id);
    setBusy(false);
    if (result.status === "saved") setOutcome("Checkpoint withdrawn.");
    else if (result.status === "no-change") setOutcome("That checkpoint was already withdrawn.");
    else setProblem(result.message);
  }

  async function check(): Promise<void> {
    setBusy(true);
    const result = await props.onCheck();
    setBusy(false);
    if (result.status === "saved") setOutcome("The earlier save is confirmed.");
    else if (result.status === "no-change") setOutcome("Nothing was waiting.");
    else setProblem(result.message);
  }

  const { state } = props;
  const blocked = signedOut || busy || !state.ready || state.pending.length > 0 || state.unreadable;
  const entries = listed(state.active);

  return (
    <section class="screen checkpoints" aria-label="Checkpoints">
      <div class="card">
        <h2 class="card-title">Record a checkpoint</h2>
        <p class="card-subtitle">The total value of your funds on a day between two statements. It is value only: it includes any money you paid in or took out, and it never changes a statement or a gain.</p>
        {signedOut && <p class="notice" role="status">This is a sample. Continue with Google to record your own checkpoints.</p>}
        {!signedOut && !state.ready && state.message === "" && <p class="notice" role="status">Checking your checkpoints.</p>}
        {state.message !== "" && <p class="notice notice-warning" role="status">{state.message}</p>}
        {state.pending.length > 0 && (
          <div class="notice notice-warning" role="status">
            <p>A save was sent but its outcome was never confirmed. Nothing else can be saved until it is checked. Checking only reads; it never sends the save again.</p>
            <ul class="checkpoint-pending">{state.pending.map((command) => <li key={command.id}><PendingDescription command={command} active={state.active} /></li>)}</ul>
            <button type="button" disabled={busy} onClick={() => void check()}>Check outcome</button>
          </div>
        )}
        <form class="checkpoint-form" onSubmit={(event) => void save(event)} noValidate>
          <label class="field">Date
            <input type="date" value={date} max={props.today} disabled={blocked} onInput={(event) => { setDate(event.currentTarget.value); }} />
          </label>
          <label class="field">Total value (EUR)
            <input ref={amountInput} type="text" inputMode="decimal" autocomplete="off" value={amount} placeholder="12.345,67" disabled={blocked} aria-invalid={problem !== "" && parseItalianAmount(amount) === null ? "true" : undefined} onInput={(event) => { setAmount(event.currentTarget.value); }} />
          </label>
          <label class="field">Note (optional)
            <input type="text" value={note} maxLength={MAX_NOTE_LENGTH} autocomplete="off" disabled={blocked} onInput={(event) => { setNote(event.currentTarget.value); }} />
          </label>
          <div class="checkpoint-actions">
            <button type="submit" disabled={blocked}>Save checkpoint</button>
          </div>
        </form>
        <p class="checkpoint-feedback" role="status" aria-live="polite">{outcome}</p>
        {problem !== "" && <p class="notice notice-warning" role="alert">{problem}</p>}
      </div>

      <div class="card">
        <h2 class="card-title">Your checkpoints</h2>
        <p class="card-subtitle">Newest first. On the Performance chart a day shows its latest checkpoint; every one is listed here.</p>
        {entries.length === 0 ? <p class="empty-note">No checkpoints yet.</p> : (
          <ul class="checkpoint-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <span class="checkpoint-date">{formatDateLong(entry.date)}</span>
                <span class="checkpoint-value"><Amount cents={entry.cents} /></span>
                {entry.note !== "" && <span class="checkpoint-note">{entry.note}</span>}
                {confirming === entry.id ? (
                  <span class="checkpoint-confirm" role="group" aria-label={`Withdraw the checkpoint of ${formatDateLong(entry.date)}`}>
                    <span>Take it off the chart? It stays in the log.</span>
                    <button type="button" disabled={blocked} onClick={() => void withdraw(entry.id)}>Withdraw</button>
                    <button type="button" onClick={() => { setConfirming(null); }}>Keep</button>
                  </span>
                ) : (
                  <button type="button" class="quiet-action" disabled={blocked} aria-label={`Withdraw the checkpoint of ${formatDateLong(entry.date)}`} onClick={() => { setConfirming(entry.id); }}>Withdraw</button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p class="footnote">If a workbook is ever recreated from this device, checkpoints are not restored into it. This list stays on this device until you choose Forget this device.</p>
      </div>

      {state.preserved.map((entry) => <PreservedList key={entry.workbookId} workbookId={entry.workbookId} active={entry.active} pending={entry.pending} unreadable={entry.unreadable} text={(masked) => props.preservedText(entry.workbookId, masked)} />)}
    </section>
  );
}
