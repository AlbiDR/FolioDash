import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import type { Checkpoint, CheckpointCommand } from "../../../../core/portfolio/checkpoints";
import { MAX_NOTE_LENGTH, isSafeNote } from "../../../../core/portfolio/checkpoints";
import { type IsoDate, formatDateLong, parseIsoDate } from "../../../../core/values/iso-date";
import { type EuroCents, parseItalianAmount } from "../../../../core/values/money";
import { Amount } from "../../presentation/privacy/privacy";
import { useLeavingRows } from "../../shared/motion/leaving-rows";
import { Presence } from "../../shared/ui/presence";
import { PendingDescription, PreservedList, listed } from "./checkpoints-preserved";
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
  readonly preserved: readonly {
    readonly workbookId: string;
    readonly active: readonly Checkpoint[];
    readonly pending: readonly CheckpointCommand[];
    readonly unreadable: boolean;
  }[];
}

/** What a save, a withdrawal or a check came to. Only `saved` and `no-change` leave nothing to explain. */
export interface CheckpointAction {
  readonly status: "saved" | "no-change" | "refused" | "not-saved" | "unknown";
  readonly message: string;
}

/**
 * Value-only checkpoints: the portfolio's total value on a day, and nothing else. They never change a
 * statement or a figure, and a deposit between two of them shows up as a jump in value.
 */
export function CheckpointsView(props: {
  readonly signedOut: boolean;
  readonly state: CheckpointScreenState;
  readonly today: IsoDate;
  readonly onAdd: (request: {
    readonly date: IsoDate;
    readonly cents: EuroCents;
    readonly note: string;
  }) => Promise<CheckpointAction>;
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
    if (parsedDate === null) {
      setProblem("Choose a date.");
      return;
    }
    if (parsedDate > props.today) {
      setProblem("A checkpoint can be recorded only when its day has come.");
      return;
    }
    if (cents === null || cents < 0) {
      setProblem("Enter the total value as a positive amount in Italian notation, for example 12.345,67.");
      amountInput.current?.focus();
      return;
    }
    if (!isSafeNote(note)) {
      setProblem(`Keep the note under ${String(MAX_NOTE_LENGTH)} characters and do not start it with = + - or @.`);
      return;
    }
    setProblem("");
    setBusy(true);
    const result = await props.onAdd({ date: parsedDate, cents, note });
    setBusy(false);
    if (result.status === "saved") {
      setAmount("");
      setNote("");
      setOutcome("Checkpoint saved.");
    } else if (result.status === "no-change") setOutcome("Nothing to change.");
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
  // Rows present when the screen opened arrive with it; a row added afterwards enters as a layer (FD-029, phase 6).
  // The rows present once the log is first ready are the ones it opened with.
  const opened = useRef<ReadonlySet<string> | null>(null);
  if (opened.current === null && state.ready) opened.current = new Set(entries.map((entry) => entry.id));
  const known = opened.current;
  // A withdrawn checkpoint stays while it fades, so the list never snaps shut.
  const shown = useLeavingRows(entries, (entry) => entry.id).rows;

  return (
    <section class="screen checkpoints" aria-label="Checkpoints">
      <div class="card">
        <h2 class="card-title">Record a checkpoint</h2>
        <p class="card-subtitle">
          The total value of your funds on a day between two statements. It is value only: it includes any money you
          paid in or took out, and it never changes a statement or a gain.
        </p>
        <Presence show={signedOut}>
          {signedOut && (
            <p class="notice" role="status">
              This is a sample. Continue with Google to record your own checkpoints.
            </p>
          )}
        </Presence>
        <Presence show={!signedOut && !state.ready && state.message === ""}>
          {!signedOut && !state.ready && state.message === "" && (
            <p class="notice" role="status">
              Checking your checkpoints.
            </p>
          )}
        </Presence>
        <Presence show={state.message !== ""}>
          {state.message !== "" && (
            <p class="notice notice-warning" role="status">
              {state.message}
            </p>
          )}
        </Presence>
        <Presence show={state.pending.length > 0}>
          {state.pending.length > 0 && (
            <div class="notice notice-warning" role="status">
              <p>
                A save was sent but its outcome was never confirmed. Nothing else can be saved until it is checked.
                Checking only reads; it never sends the save again.
              </p>
              <ul class="checkpoint-pending">
                {state.pending.map((command) => (
                  <li key={command.id}>
                    <PendingDescription command={command} active={state.active} />
                  </li>
                ))}
              </ul>
              <button type="button" disabled={busy} onClick={() => void check()}>
                Check outcome
              </button>
            </div>
          )}
        </Presence>
        <form class="checkpoint-form" onSubmit={(event) => void save(event)} noValidate>
          <label class="field">
            Date
            <input
              type="date"
              value={date}
              max={props.today}
              disabled={blocked}
              onInput={(event) => {
                setDate(event.currentTarget.value);
              }}
            />
          </label>
          <label class="field">
            Total value (EUR)
            <input
              ref={amountInput}
              type="text"
              inputMode="decimal"
              autocomplete="off"
              value={amount}
              placeholder="12.345,67"
              disabled={blocked}
              aria-invalid={problem !== "" && parseItalianAmount(amount) === null ? "true" : undefined}
              onInput={(event) => {
                setAmount(event.currentTarget.value);
              }}
            />
          </label>
          <label class="field">
            Note (optional)
            <input
              type="text"
              value={note}
              maxLength={MAX_NOTE_LENGTH}
              autocomplete="off"
              disabled={blocked}
              onInput={(event) => {
                setNote(event.currentTarget.value);
              }}
            />
          </label>
          <div class="checkpoint-actions">
            <button type="submit" disabled={blocked}>
              Save checkpoint
            </button>
          </div>
        </form>
        <p class="checkpoint-feedback" role="status" aria-live="polite">
          {outcome}
        </p>
        <Presence show={problem !== ""}>
          {problem !== "" && (
            <p class="notice notice-warning" role="alert">
              {problem}
            </p>
          )}
        </Presence>
      </div>

      <div class="card">
        <h2 class="card-title">Your checkpoints</h2>
        <p class="card-subtitle">
          Newest first. On the Performance chart a day shows its latest checkpoint; every one is listed here.
        </p>
        {shown.length === 0 ? (
          <p class="empty-note">No checkpoints yet.</p>
        ) : (
          <ul class="checkpoint-list">
            {shown.map(({ item: entry, leaving }) => (
              <li
                key={entry.id}
                class={leaving ? "row-leaving" : known === null || known.has(entry.id) ? undefined : "checkpoint-new"}
                inert={leaving}
                aria-hidden={leaving ? true : undefined}
              >
                <span class="checkpoint-date">{formatDateLong(entry.date)}</span>
                <span class="checkpoint-value">
                  <Amount cents={entry.cents} />
                </span>
                {entry.note !== "" && <span class="checkpoint-note">{entry.note}</span>}
                {confirming === entry.id ? (
                  <span
                    class="checkpoint-confirm"
                    role="group"
                    aria-label={`Withdraw the checkpoint of ${formatDateLong(entry.date)}`}
                  >
                    <span>Take it off the chart? It stays in the log.</span>
                    <button type="button" disabled={blocked} onClick={() => void withdraw(entry.id)}>
                      Withdraw
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(null);
                      }}
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    class="quiet-action"
                    disabled={blocked}
                    aria-label={`Withdraw the checkpoint of ${formatDateLong(entry.date)}`}
                    onClick={() => {
                      setConfirming(entry.id);
                    }}
                  >
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p class="footnote">
          If a workbook is ever recreated from this device, checkpoints are not restored into it. This list stays on
          this device until you choose Forget this device.
        </p>
      </div>

      {state.preserved.map((entry) => (
        <PreservedList
          key={entry.workbookId}
          workbookId={entry.workbookId}
          active={entry.active}
          pending={entry.pending}
          unreadable={entry.unreadable}
          text={(masked) => props.preservedText(entry.workbookId, masked)}
        />
      ))}
    </section>
  );
}
