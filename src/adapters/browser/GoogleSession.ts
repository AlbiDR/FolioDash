import type { GoogleSession, GoogleSessionStore } from "../../applications/SessionModel";
import type { KeyValueStore } from "./LedgerCache";

const MAX_SESSION_MILLISECONDS = 3_600_000;
const MAX_TOKEN_CHARACTERS = 8192;

/** Short-lived access only, scoped to this browser tab. Never extends Google's expiry. */
export function createGoogleSessionStore(open: () => KeyValueStore, key = "foliodash.google-session.v1"): GoogleSessionStore {
  const clear = (): void => { try { open().removeItem(key); } catch { /* Storage can be blocked. */ } };
  return {
    clear,
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
