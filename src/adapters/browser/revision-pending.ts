import type { KeyValueStore } from "./ledger-cache";

/** A non-financial receipt retained before a revision-changing request is sent. */
export interface RevisionPendingStore {
  load(
    workbookId: string,
  ):
    | { readonly ok: true; readonly commandId: string | null; readonly predecessor: string | null }
    | { readonly ok: false };
  begin(workbookId: string, commandId: string): boolean;
  prepare(workbookId: string, commandId: string, predecessor: string): boolean;
  clear(workbookId: string, commandId: string): boolean;
}

export function createRevisionPendingStore(
  open: () => KeyValueStore,
  prefix = "foliodash.revision-pending.v1.",
): RevisionPendingStore {
  const key = (id: string): string => prefix + encodeURIComponent(id);
  const load = (
    id: string,
  ):
    | { readonly ok: true; readonly commandId: string | null; readonly predecessor: string | null }
    | { readonly ok: false } => {
    try {
      const raw = open().getItem(key(id));
      if (raw === null) return { ok: true, commandId: null, predecessor: null };
      const data: unknown = JSON.parse(raw);
      if (
        typeof data !== "object" ||
        data === null ||
        !("commandId" in data) ||
        typeof data.commandId !== "string" ||
        data.commandId.length === 0 ||
        data.commandId.length > 200
      )
        return { ok: false };
      const predecessor = "predecessor" in data ? data.predecessor : null;
      if (predecessor !== null && (typeof predecessor !== "string" || !/^[0-9a-f]{64}$/u.test(predecessor)))
        return { ok: false };
      return { ok: true, commandId: data.commandId, predecessor };
    } catch {
      return { ok: false };
    }
  };
  return {
    load,
    begin(id, commandId) {
      const existing = load(id);
      if (!existing.ok || existing.commandId !== null || commandId.length === 0 || commandId.length > 200) return false;
      try {
        open().setItem(key(id), JSON.stringify({ commandId }));
        const checked = load(id);
        return checked.ok && checked.commandId === commandId;
      } catch {
        return false;
      }
    },
    prepare(id, commandId, predecessor) {
      const existing = load(id);
      if (
        !existing.ok ||
        existing.commandId !== commandId ||
        existing.predecessor !== null ||
        !/^[0-9a-f]{64}$/u.test(predecessor)
      )
        return false;
      try {
        open().setItem(key(id), JSON.stringify({ commandId, predecessor }));
        const checked = load(id);
        return checked.ok && checked.commandId === commandId && checked.predecessor === predecessor;
      } catch {
        return false;
      }
    },
    clear(id, commandId) {
      const existing = load(id);
      if (!existing.ok || existing.commandId !== commandId) return false;
      try {
        open().removeItem(key(id));
        const checked = load(id);
        return checked.ok && checked.commandId === null;
      } catch {
        return false;
      }
    },
  };
}
