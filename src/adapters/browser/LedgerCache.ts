import { type LedgerState, parseLedgerState } from "../../core/Ledger";

const KEY = "foliodash.ledger.v1";
const VERSION = 1;
// A ledger is small, but a copy this large would crowd out the browser's storage, so it is simply not kept.
const MAX_CHARACTERS = 2_000_000;

/** The slice of localStorage used, so the behaviour can be tested and a blocked store is survivable. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * What the device keeps: the checked ledger, which spreadsheet it came from, and
 * when it was last confirmed against that spreadsheet. The spreadsheet is the
 * record; this copy only lets the screen open instantly and can always be rebuilt.
 */
export interface DeviceCopy {
  readonly workbook: { readonly id: string; readonly url: string };
  readonly ledger: LedgerState;
  /** Milliseconds since 1970 when the ledger was last confirmed against the spreadsheet. */
  readonly syncedAt: number;
}

export interface LedgerCache {
  load(): DeviceCopy | null;
  /** Returns whether the copy was kept. A blocked or full store means it was not, and nothing else breaks. */
  save(copy: DeviceCopy): boolean;
  clear(): void;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function createLedgerCache(open: () => KeyValueStore, key = KEY): LedgerCache {
  const clear = (): void => {
    try {
      open().removeItem(key);
    } catch {
      // Nothing to clear.
    }
  };
  return {
    load(): DeviceCopy | null {
      try {
        const text = open().getItem(key);
        if (text === null) return null;
        const stored = record(JSON.parse(text));
        const workbook = record(stored?.["workbook"]);
        const ledger = parseLedgerState(stored?.["ledger"]);
        // A copy that is the wrong version, the wrong shape or breaks the ledger rules is thrown away, never shown.
        if (stored?.["version"] !== VERSION || typeof workbook?.["id"] !== "string" || typeof workbook["url"] !== "string" || ledger === null || typeof stored["syncedAt"] !== "number") {
          clear();
          return null;
        }
        return { workbook: { id: workbook["id"], url: workbook["url"] }, ledger, syncedAt: stored["syncedAt"] };
      } catch {
        clear();
        return null;
      }
    },
    save(copy): boolean {
      try {
        const text = JSON.stringify({ version: VERSION, workbook: copy.workbook, ledger: copy.ledger, syncedAt: copy.syncedAt });
        if (text.length > MAX_CHARACTERS) {
          clear();
          return false;
        }
        open().setItem(key, text);
        return true;
      } catch {
        return false;
      }
    },
    clear,
  };
}

export const browserLedgerCache: LedgerCache = createLedgerCache(() => window.localStorage);
