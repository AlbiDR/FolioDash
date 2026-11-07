import type { RenewalCoordination } from "../../applications/SessionModel";
import type { KeyValueStore } from "./LedgerCache";

/** Longer than a sign-in can last, so a window that closed mid-renewal cannot block the others for long. */
const CLAIM_MILLISECONDS = 130_000;

export interface SharedConnectionKeys {
  /** The remembered Google access. Written by whichever window renews it. */
  readonly access: string;
  readonly claim: string;
  readonly forgotten: string;
}

export interface SharedConnectionHandlers {
  /** Another window stored newer Google access. */
  readonly adopt: () => void;
  /** Another window forgot this device. */
  readonly forgotten: () => void;
}

interface StorageEventSource {
  addEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
  removeEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
}

export interface SharedConnection extends RenewalCoordination {
  watch(handlers: SharedConnectionHandlers): () => void;
}

/**
 * Windows of one browser (a tab and the installed app, or two tabs) share this device's
 * stored connection. A claim is written before a window opens Google's, and read by the
 * others, so only one quiet renewal runs and the rest adopt its result from storage.
 * A claim only holds back automatic renewals: something the person chose still goes ahead.
 * Claims are advisory and expire. With storage blocked nothing is shared and nothing breaks.
 */
export function createSharedConnection(options: {
  readonly open: () => KeyValueStore;
  readonly keys: SharedConnectionKeys;
  readonly windowId: string;
  readonly now: () => number;
  readonly source: StorageEventSource;
}): SharedConnection {
  const { keys, windowId, now } = options;
  const storage = (): KeyValueStore | null => {
    try {
      return options.open();
    } catch {
      return null;
    }
  };
  const readClaim = (): { readonly id: string; readonly at: number } | null => {
    try {
      const text = storage()?.getItem(keys.claim) ?? null;
      if (text === null) return null;
      const value = JSON.parse(text) as { id?: unknown; at?: unknown } | null;
      return value !== null && typeof value.id === "string" && typeof value.at === "number" ? { id: value.id, at: value.at } : null;
    } catch {
      return null;
    }
  };
  return {
    heldElsewhere() {
      const claim = readClaim();
      return claim !== null && claim.id !== windowId && now() - claim.at >= 0 && now() - claim.at < CLAIM_MILLISECONDS;
    },
    claim() {
      try {
        storage()?.setItem(keys.claim, JSON.stringify({ id: windowId, at: now() }));
      } catch {
        // Without storage there is nobody to coordinate with.
      }
    },
    release() {
      try {
        if (readClaim()?.id === windowId) storage()?.removeItem(keys.claim);
      } catch {
        // The claim expires on its own.
      }
    },
    announceForgotten() {
      try {
        storage()?.setItem(keys.forgotten, `${String(now())}:${windowId}`);
      } catch {
        // Other windows keep what they hold until they are closed.
      }
    },
    watch(handlers) {
      const onStorage = (event: StorageEvent): void => {
        if (event.key === keys.access && event.newValue !== null) handlers.adopt();
        else if (event.key === keys.forgotten && event.newValue !== null) handlers.forgotten();
      };
      options.source.addEventListener("storage", onStorage);
      return () => { options.source.removeEventListener("storage", onStorage); };
    },
  };
}
