import type { ConnectionConfig, ConnectionStorage } from "../features/connection/ConnectionModel";
import { checkConfig } from "../features/connection/connectionConfig";

const KEY = "foliodash.connection.v1";

/** The slice of localStorage used, so the behaviour can be tested and so a blocked store is survivable. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Remembers the three IDs in this browser only, and only when the user asks. It
 * holds locators, never a token or a secret. Storage can be blocked, cleared or
 * absent, so every access is guarded and the screen works without it.
 */
export function createConnectionStorage(open: () => KeyValueStore): ConnectionStorage {
  return {
    load(): ConnectionConfig | null {
      try {
        const text = open().getItem(KEY);
        if (text === null) return null;
        const parsed = JSON.parse(text) as Partial<Record<keyof ConnectionConfig, unknown>>;
        const check = checkConfig({
          clientId: typeof parsed.clientId === "string" ? parsed.clientId : "",
          scriptId: typeof parsed.scriptId === "string" ? parsed.scriptId : "",
          workbookId: typeof parsed.workbookId === "string" ? parsed.workbookId : "",
        });
        return check.ok ? check.config : null;
      } catch {
        return null;
      }
    },
    save(config): void {
      try {
        open().setItem(KEY, JSON.stringify({ clientId: config.clientId, scriptId: config.scriptId, workbookId: config.workbookId }));
      } catch {
        // Not remembered; the screen still works.
      }
    },
    clear(): void {
      try {
        open().removeItem(KEY);
      } catch {
        // Nothing to clear.
      }
    },
  };
}

export const browserConnectionStorage: ConnectionStorage = createConnectionStorage(() => window.localStorage);
