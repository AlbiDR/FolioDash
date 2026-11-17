import { canonicalJson } from "../../../core/integrity/canonical-json";
import { sha256Hex } from "../../../core/integrity/sha256";
import type { ServiceEnvironment } from "../../../applications/ledger/ledger-service";
import type { RemoteCommit } from "../ledger-results";
import type { RestClient, RestFailure } from "../rest";
import { appendLedgerRows, readLedgerRows } from "../workbook/ledger-rows";
import { storeOf } from "./buffered-row-sheet";

/** The part of the direct dependencies that one guarded write uses. */
export interface WriteDeps {
  readonly rest: RestClient;
  readonly newRevision: () => string;
  readonly beforeRevisionWrite?: (fingerprint: string) => boolean;
}

const LOST = "The save may or may not have been recorded. Check what happened before trying again.";

/**
 * Runs one ledger operation in memory against the rows already stored, checks once
 * more that nobody else wrote in the meantime, then claims that predecessor and
 * appends rows in one atomic request. Only a refusal Google made before doing
 * anything counts as "not written"; a lost answer is unknown and is resolved by reading the sheet,
 * never by trying again.
 */
export async function writeOnce(
  deps: WriteDeps,
  accessToken: string,
  workbookId: string,
  operate: (environment: ServiceEnvironment) => { readonly result: RemoteCommit; readonly wrote: boolean },
): Promise<RemoteCommit> {
  const before = await readLedgerRows(deps.rest, accessToken, workbookId);
  if (!before.ok) return notWritten(before.failure);
  if ("notALedger" in before.value)
    return { status: "refused", message: "This spreadsheet is not a FolioDash ledger, so nothing was saved." };

  const { sheet, store } = storeOf(before.value.rows);
  const environment: ServiceEnvironment = { store, withLock: (action) => action(), newRevision: deps.newRevision };
  let prepared: ReturnType<typeof operate>;
  try {
    prepared = operate(environment);
  } catch {
    return { status: "not-committed", message: "The change could not be prepared. Nothing was sent." };
  }
  const { result, wrote } = prepared;
  if (!wrote) return result;

  // Nothing has been written yet. Make sure the sheet has not changed since it was read.
  const again = await readLedgerRows(deps.rest, accessToken, workbookId);
  if (!again.ok) return notWritten(again.failure);
  if ("notALedger" in again.value || canonicalJson(again.value.rows) !== canonicalJson(before.value.rows))
    return { status: "stale" };

  if (deps.beforeRevisionWrite !== undefined && !deps.beforeRevisionWrite(sha256Hex(canonicalJson(before.value.rows))))
    return { status: "not-committed", message: "The safety receipt could not be stored. Nothing was sent." };

  const sent = await appendLedgerRows(deps.rest, accessToken, workbookId, sheet.pending, before.value.rows);
  if (sent.ok) {
    const verified = await readLedgerRows(deps.rest, accessToken, workbookId);
    if (!verified.ok || "notALedger" in verified.value) return { status: "unknown", message: LOST };
    const loaded = storeOf(verified.value.rows).store.load();
    const expected = store.load();
    if (
      loaded.status !== "ok" ||
      expected.status !== "ok" ||
      canonicalJson(verified.value.rows.slice(0, before.value.rows.length + sheet.pending.length)) !==
        canonicalJson([...before.value.rows, ...sheet.pending])
    )
      return { status: "unknown", message: LOST };
    return result;
  }
  if (sent.failure === "unexpected") {
    // A duplicate predecessor marker is refused atomically. Only report a stale
    // review when a valid different winner is visible and our revision is absent.
    const check = await readLedgerRows(deps.rest, accessToken, workbookId);
    if (check.ok && !("notALedger" in check.value)) {
      const checked = storeOf(check.value.rows).store;
      if (checked.load().status === "ok" && canonicalJson(check.value.rows) !== canonicalJson(before.value.rows)) {
        try {
          const reconciled = operate({ store: checked, withLock: (action) => action(), newRevision: deps.newRevision });
          if (!reconciled.wrote) return reconciled.result;
        } catch {
          return { status: "unknown", message: LOST };
        }
      }
    }
  }
  return sent.failure === "unavailable" || sent.failure === "network" || sent.failure === "unexpected"
    ? { status: "unknown", message: LOST }
    : notWritten(sent.failure);
}

function notWritten(failure: RestFailure): RemoteCommit {
  if (failure === "unauthorised" || failure === "forbidden" || failure === "not-found")
    return { status: "not-sent", failure };
  return {
    status: "not-committed",
    message:
      failure === "network" || failure === "unavailable"
        ? "Google could not be reached, so nothing was saved. It is safe to try again."
        : "Nothing was saved. It is safe to try again.",
  };
}
