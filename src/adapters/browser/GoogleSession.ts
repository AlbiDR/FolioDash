import type { GoogleSession, GoogleSessionStore } from "../../applications/SessionModel";
import type { KeyValueStore } from "./LedgerCache";

const MAX_SESSION_MILLISECONDS = 3_600_000;
const MAX_TOKEN_CHARACTERS = 8192;

/**
 * Short-lived Google access kept on this device, so a reload, a new tab or the installed app
 * need not ask again within Google's one hour. It never extends Google's expiry and holds no
 * refresh token. Same-origin scripts can read it, as they can the device copy of the ledger.
 */
export function createGoogleSessionStore(open: () => KeyValueStore, key = "foliodash.google-session.v1"): GoogleSessionStore {
  const clear = (): void => { try { open().removeItem(key); } catch { /* Storage can be blocked. */ } };
  return {
    clear,
    discard(accessToken) {
      try {
        const text = open().getItem(key);
        if (text === null) return;
        const value = JSON.parse(text) as { accessToken?: unknown } | null;
        // Another window may have renewed since this one was rejected, so only the rejected token is removed.
        if (value === null || value.accessToken === accessToken) clear();
      } catch { clear(); }
    },
    load(clientId, workbookId, now) {
      try {
        const text = open().getItem(key);
        if (text === null) return null;
        const value = JSON.parse(text) as Partial<GoogleSession> | null;
        if (value === null || value.clientId !== clientId || value.workbookId !== workbookId || typeof value.accessToken !== "string" || value.accessToken.length === 0 || value.accessToken.length > MAX_TOKEN_CHARACTERS || typeof value.validUntil !== "number" || !Number.isFinite(value.validUntil) || value.validUntil <= now || value.validUntil > now + MAX_SESSION_MILLISECONDS || value.scope !== "https://www.googleapis.com/auth/drive.file") {
          clear(); return null;
        }
        return value as GoogleSession;
      } catch { clear(); return null; }
    },
    save(value) { try { open().setItem(key, JSON.stringify(value)); } catch { /* Continue with memory only. */ } },
  };
}
