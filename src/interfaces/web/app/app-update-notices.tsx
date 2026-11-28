import type { JSX } from "preact";
import { Presence } from "../shared/ui/presence";

/** The two update notices: which version just arrived, and a newer one that is waiting for the person's choice. */
export function AppUpdateNotices(props: {
  applyUpdate: (() => void) | null;
  updatedTo: string | null;
  acknowledgeUpdate: () => void;
  importLocked: boolean;
  expenseLocked: boolean;
}): JSX.Element {
  const { applyUpdate, updatedTo, acknowledgeUpdate, importLocked, expenseLocked } = props;
  return (
    <>
      <Presence show={updatedTo !== null}>
        {updatedTo !== null && (
          <div class="notice app-update" role="status">
            <p>FolioDash was updated. Now running {updatedTo}.</p>
            <button type="button" onClick={acknowledgeUpdate}>
              Dismiss
            </button>
          </div>
        )}
      </Presence>
      <Presence show={applyUpdate !== null}>
        {applyUpdate !== null && (
          <div class="notice app-update" role="status">
            <p>
              A new version of FolioDash is ready.
              {importLocked && <> Finish the import or return to statement selection before updating.</>}
              {expenseLocked && <> Save or discard the expense draft, or check its uncertain save, before updating.</>}
            </p>
            <button type="button" disabled={importLocked || expenseLocked} onClick={applyUpdate}>
              Reload to update
            </button>
          </div>
        )}
      </Presence>
    </>
  );
}
