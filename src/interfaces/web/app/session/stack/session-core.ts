import type { SessionState } from "../../../../../applications/session/session-model";
import { EMPTY_LEDGER } from "../../../../../core/portfolio/ledger";
import type { ExpenseSession } from "../expense-session";
import type { CheckpointSession } from "../checkpoint-session";
import type { SessionDeps } from "./session-policy";

/** What this device holds at start-up: its saved copy, when there is one, and any unfinished history change. */
export function initialState(deps: SessionDeps): SessionState {
  const copy = deps.cache.load();
  let current: SessionState =
    copy === null
      ? {
          mode: "signed-out",
          ledger: EMPTY_LEDGER,
          workbook: null,
          syncedAt: null,
          sheet: "unchecked",
          trailingRows: 0,
        }
      : {
          mode: "device-copy",
          ledger: copy.ledger,
          workbook: copy.workbook,
          syncedAt: copy.syncedAt,
          sheet: "unchecked",
          trailingRows: 0,
        };
  if (copy !== null) {
    const pending = deps.revisionPending?.load(copy.workbook.id);
    if (pending?.ok === true && pending.commandId !== null)
      current = { ...current, pendingRevision: pending.commandId };
  }
  return current;
}

/** The state every layer of the session shares: the dependencies, the current state, the listeners and the background work. */
export abstract class SessionCore {
  abstract readonly expenses: ExpenseSession;
  abstract readonly checkpoints: CheckpointSession;
  protected readonly deps: SessionDeps;
  protected current: SessionState;
  protected readonly listeners = new Set<() => void>();
  protected readonly background = new Set<Promise<unknown>>();
  protected generation = 0;

  constructor(deps: SessionDeps, current: SessionState) {
    this.current = current;
    this.deps = {
      ...deps,
      rest: async (request) => {
        const response = await deps.rest(request);
        if (response.status === 401) this.unauthorized(request.headers["Authorization"]);
        return response;
      },
    };
  }

  /** Google refused the access this request carried. */
  protected abstract unauthorized(authorization: string | undefined): void;

  protected later(work: Promise<unknown>): void {
    this.background.add(work);
    void work.finally(() => {
      this.background.delete(work);
    });
  }

  get state(): SessionState {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  protected set(next: SessionState): void {
    const pending = next.workbook === null ? null : this.deps.revisionPending?.load(next.workbook.id);
    const withPending = pending?.ok === true ? { ...next, pendingRevision: pending.commandId } : next;
    this.current =
      withPending.organization === undefined &&
      withPending.workbook?.id === this.current.workbook?.id &&
      this.current.organization !== undefined
        ? { ...withPending, organization: this.current.organization }
        : withPending;
    for (const listener of this.listeners) listener();
  }
}
