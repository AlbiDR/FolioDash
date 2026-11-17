import type { JSX } from "preact";
import { useState } from "preact/hooks";
import type { Checkpoint, CheckpointCommand } from "../../../../core/portfolio/checkpoints";
import { formatDateLong } from "../../../../core/values/iso-date";
import { Amount, usePrivacy } from "../../presentation/privacy/privacy";

/** Newest date first; checkpoints on one date keep the order they were recorded in, latest first. */
export function listed(active: readonly Checkpoint[]): readonly Checkpoint[] {
  return active
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) =>
      left.entry.date === right.entry.date ? right.index - left.index : left.entry.date < right.entry.date ? 1 : -1,
    )
    .map(({ entry }) => entry);
}

/** What a never-confirmed save was, in words, so the person can tell whether to expect it. */
export function PendingDescription(props: {
  readonly command: CheckpointCommand;
  readonly active: readonly Checkpoint[];
}): JSX.Element {
  const { command } = props;
  if (command.kind === "add")
    return (
      <>
        Save of {formatDateLong(command.date)}, <Amount cents={command.cents} />
        {command.note === "" ? "" : `, note "${command.note}"`}
      </>
    );
  const target = props.active.find((entry) => entry.id === command.target);
  return target === undefined ? (
    <>Withdrawal of a checkpoint</>
  ) : (
    <>
      Withdrawal of the checkpoint of {formatDateLong(target.date)}, <Amount cents={target.cents} />
    </>
  );
}

export function PreservedList(props: {
  readonly workbookId: string;
  readonly active: readonly Checkpoint[];
  readonly pending: readonly CheckpointCommand[];
  readonly unreadable: boolean;
  readonly text: (masked: boolean) => string;
}): JSX.Element {
  const [copied, setCopied] = useState("");
  // The text view and the copy follow the privacy toggle: with amounts hidden they leave the amounts out.
  const hidden = usePrivacy();
  const text = props.text(hidden);
  return (
    <section class="card checkpoint-preserved" aria-labelledby={`preserved-${props.workbookId}`}>
      <h3 id={`preserved-${props.workbookId}`} class="card-title">
        Kept from another workbook
      </h3>
      <p class="card-subtitle">
        These checkpoints belong to a workbook that is not the one connected now. They are kept on this device, read
        only. They are not restored into a new workbook.
        {props.pending.length > 0
          ? " A save from that workbook was never confirmed; it is listed below and included in the copy."
          : ""}
        {props.unreadable
          ? " This device's record of an unsent save for it could not be read; it was left untouched."
          : ""}
        {hidden ? " Amounts are hidden, so the text below and the copy leave them out." : ""}
      </p>
      {props.pending.length > 0 && (
        <ul class="checkpoint-list checkpoint-unconfirmed" aria-label="Unconfirmed saves">
          {props.pending.map((command) => (
            <li key={command.id}>
              <span class="checkpoint-date">Unconfirmed</span>
              <span class="checkpoint-note">
                <PendingDescription command={command} active={props.active} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {props.active.length === 0 ? (
        <p class="empty-note">No confirmed checkpoints.</p>
      ) : (
        <ul class="checkpoint-list">
          {listed(props.active).map((entry) => (
            <li key={entry.id}>
              <span class="checkpoint-date">{formatDateLong(entry.date)}</span>
              <span class="checkpoint-value">
                <Amount cents={entry.cents} />
              </span>
              {entry.note !== "" && <span class="checkpoint-note">{entry.note}</span>}
            </li>
          ))}
        </ul>
      )}
      <div class="checkpoint-actions">
        <button
          type="button"
          disabled={text === ""}
          onClick={() => {
            const clipboard = (navigator as { readonly clipboard?: Clipboard }).clipboard;
            if (clipboard === undefined) {
              setCopied("Copying is not available here. Select the text below instead.");
              return;
            }
            void clipboard.writeText(text).then(
              () => {
                setCopied("Copied.");
              },
              () => {
                setCopied("Copying was not allowed. Select the text below instead.");
              },
            );
          }}
        >
          Copy as text
        </button>
        <span role="status" aria-live="polite">
          {copied}
        </span>
      </div>
      <label class="field">
        The same list as text
        <textarea
          readOnly
          rows={Math.min(8, Math.max(2, props.active.length))}
          value={text}
          aria-label="Checkpoints kept from another workbook, as text"
        />
      </label>
    </section>
  );
}
