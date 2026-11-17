import type { JSX } from "preact";

/** The notice after a save, with the explicit, confirmed way back to the previous history. */
export function BackfillDone(props: {
  readonly savedRevision: string | null;
  readonly confirmRecovery: boolean;
  readonly setConfirmRecovery: (confirmed: boolean) => void;
  readonly restoring: boolean;
  readonly recover: () => Promise<void>;
}): JSX.Element {
  const { savedRevision, confirmRecovery, setConfirmRecovery, restoring, recover } = props;
  return (
    <section class="notice notice-success" role="status">
      <p>{savedRevision === null ? "The previous history was restored and checked." : "History saved and checked."}</p>
      {savedRevision !== null && (
        <>
          <label>
            <input
              type="checkbox"
              checked={confirmRecovery}
              onChange={(event) => {
                setConfirmRecovery(event.currentTarget.checked);
              }}
            />{" "}
            I understand this restores the previous history and may remove later changes.
          </label>
          <button
            type="button"
            disabled={restoring || !confirmRecovery}
            onClick={() => {
              void recover();
            }}
          >
            Restore the history from before this change
          </button>
        </>
      )}
    </section>
  );
}
