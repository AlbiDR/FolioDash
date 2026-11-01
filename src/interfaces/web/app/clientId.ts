const KEY = "foliodash.client.v1";
const CLIENT_ID = /^[0-9]{6,}-[a-z0-9]+\.apps\.googleusercontent\.com$/u;

export interface ClientIdStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Whether text is shaped like a Google OAuth client ID. It is public by design, never a secret. */
export function isClientId(text: string): boolean {
  return CLIENT_ID.test(text.trim());
}

/**
 * The Google client ID this site signs people in with. A hosted build carries it
 * (a GitHub variable); only a build without one asks the person, and remembers
 * the answer on this device. It is a locator, never a credential.
 */
export function resolveClientId(built: unknown, open: () => ClientIdStore): string {
  if (typeof built === "string" && isClientId(built)) return built.trim();
  try {
    const stored = open().getItem(KEY);
    return stored !== null && isClientId(stored) ? stored.trim() : "";
  } catch {
    return "";
  }
}

export function rememberClientId(text: string, open: () => ClientIdStore): boolean {
  if (!isClientId(text)) return false;
  try {
    open().setItem(KEY, text.trim());
    return true;
  } catch {
    return false;
  }
}

export function forgetClientId(open: () => ClientIdStore): void {
  try {
    open().removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}
