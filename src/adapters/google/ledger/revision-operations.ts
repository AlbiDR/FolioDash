import { prepareBackfillReview, type BackfillStatement } from "../../../applications/import/backfill-review";
import type { InterpretStatement } from "../../../applications/import/rebuild";
import type { ServiceEnvironment } from "../../../applications/ledger/ledger-service";
import { canonicalJson } from "../../../core/integrity/canonical-json";
import { sha256Hex } from "../../../core/integrity/sha256";
import type { FundCommand } from "../../../core/statements/import-plan";
import { toStoredSheet } from "../../../core/statements/raw-sheet";
import { RowLedgerStore } from "../../ledger/row-ledger-store";
import type { RemoteCommit } from "../ledger-results";

/** One ledger operation as writeOnce runs it: the result to report and whether rows were added. */
type Operation = (environment: ServiceEnvironment) => { readonly result: RemoteCommit; readonly wrote: boolean };

export function recoverOperation(
  deps: { readonly newRevision: () => string },
  request: { readonly commandId: string; readonly expectedRevision: string; readonly targetRevision: string },
): Operation {
  return (environment) => {
    const store = environment.store;
    if (!(store instanceof RowLedgerStore))
      return { result: { status: "damaged", message: "The revision store is unavailable." }, wrote: false };
    const loaded = store.load();
    if (loaded.status === "damaged") return { result: loaded, wrote: false };
    const hash = sha256Hex(
      canonicalJson({
        kind: "recover-revision",
        targetRevision: request.targetRevision,
        expectedRevision: request.expectedRevision,
      }),
    );
    const existing = store.findCommand(request.commandId);
    if (existing !== null)
      return existing.requestHash === hash
        ? { result: { status: "already-committed", revision: existing.revision }, wrote: false }
        : {
            result: {
              status: "rejected",
              messages: ["This recovery identifier was already used for another request."],
            },
            wrote: false,
          };
    if (loaded.state.revision !== request.expectedRevision) return { result: { status: "stale" }, wrote: false };
    if (request.commandId.trim() === "" || request.targetRevision.trim() === "")
      return { result: { status: "rejected", messages: ["The recovery request is incomplete."] }, wrote: false };
    const target = store.loadRevision(request.targetRevision);
    if (target.status !== "ok") return { result: { status: "damaged", message: target.message }, wrote: false };
    const revision = deps.newRevision();
    try {
      store.publishWithSources(
        { ...target.state, revision },
        { commandId: request.commandId, revision, requestHash: hash },
        target.sources,
        target.recoveryTarget ?? null,
      );
    } catch {
      return {
        result: { status: "rejected", messages: ["The recovery could not be prepared. Nothing was sent."] },
        wrote: false,
      };
    }
    return { result: { status: "committed", revision }, wrote: true };
  };
}

export function backfillOperation(
  deps: { readonly newRevision: () => string },
  request: {
    readonly commandId: string;
    readonly expectedRevision: string;
    readonly earlier: readonly BackfillStatement[];
    readonly boundary: readonly FundCommand[];
  },
  interpret: InterpretStatement,
): Operation {
  return (environment) => {
    const store = environment.store;
    if (!(store instanceof RowLedgerStore))
      return { result: { status: "damaged", message: "The revision store is unavailable." }, wrote: false };
    const loaded = store.load();
    if (loaded.status === "damaged") return { result: loaded, wrote: false };
    const normalized = request.earlier.map((item) => ({
      date: item.date,
      statement: item.statement,
      commands: item.commands,
      ...(item.source === undefined
        ? {}
        : { source: { sheetName: item.source.sheetName, sheet: toStoredSheet(item.source.sheet) } }),
    }));
    const hash = sha256Hex(
      canonicalJson({
        kind: "backfill",
        expectedRevision: request.expectedRevision,
        earlier: normalized,
        boundary: request.boundary,
      }),
    );
    const existing = store.findCommand(request.commandId);
    if (existing !== null)
      return existing.requestHash === hash
        ? { result: { status: "already-committed", revision: existing.revision }, wrote: false }
        : {
            result: { status: "rejected", messages: ["This import identifier was already used for another request."] },
            wrote: false,
          };
    if (loaded.state.revision !== request.expectedRevision) return { result: { status: "stale" }, wrote: false };
    if (request.commandId.trim() === "")
      return { result: { status: "rejected", messages: ["The import identifier is missing."] }, wrote: false };
    const sources = store.loadSources();
    if (sources.status === "damaged") return { result: sources, wrote: false };
    const revision = deps.newRevision();
    const candidate = prepareBackfillReview(
      loaded.state,
      sources.sources,
      request.earlier,
      request.boundary,
      revision,
      request.commandId,
      interpret,
    );
    if (!candidate.ok) return { result: { status: "rejected", messages: [candidate.message] }, wrote: false };
    try {
      store.publishWithSources(
        candidate.ledger,
        { commandId: request.commandId, revision, requestHash: hash },
        candidate.sources,
        loaded.state.revision,
      );
    } catch {
      return {
        result: { status: "rejected", messages: ["The import could not be prepared. Nothing was sent."] },
        wrote: false,
      };
    }
    return { result: { status: "committed", revision }, wrote: true };
  };
}
