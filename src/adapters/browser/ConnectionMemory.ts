import type { AccountHintStore } from "../../applications/SessionModel";
import type { KeyValueStore } from "./LedgerCache";

const MAX_HINT_CHARACTERS = 254;

/**
 * Remembers which Google account owns the workbook, so Google can skip its account chooser
 * when access is renewed. It is an email address, not a credential. It stays on this device,
 * is bound to the OAuth client, and is removed by Forget this device.
 */
export function createAccountHintStore(open: () => KeyValueStore, key = "foliodash.account-hint.v1"): AccountHintStore {
  const clear = (): void => { try { open().removeItem(key); } catch { /* Storage can be blocked. */ } };
  return {
    clear,
    load(clientId) {
      try {
        const text = open().getItem(key);
        if (text === null) return null;
        const value = JSON.parse(text) as { clientId?: unknown; hint?: unknown } | null;
        if (value === null || value.clientId !== clientId || typeof value.hint !== "string" || value.hint.length === 0 || value.hint.length > MAX_HINT_CHARACTERS) {
          clear();
          return null;
        }
        return value.hint;
      } catch {
        clear();
        return null;
      }
    },
    save(clientId, hint) {
      if (hint.length === 0 || hint.length > MAX_HINT_CHARACTERS) return;
      try { open().setItem(key, JSON.stringify({ clientId, hint })); } catch { /* The next renewal simply shows the chooser. */ }
    },
  };
}
