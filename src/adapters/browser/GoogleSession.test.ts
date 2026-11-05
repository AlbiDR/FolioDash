import { describe, expect, it } from "vitest";
import type { GoogleSession } from "../../applications/SessionModel";
import { createGoogleSessionStore } from "./GoogleSession";

const now = 1_700_000_000_000;
const value: GoogleSession = { clientId: "synthetic-client", workbookId: "synthetic-workbook", scope: "https://www.googleapis.com/auth/drive.file", accessToken: "synthetic-token", validUntil: now + 600_000 };

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, text: string) => { data.set(key, text); }, removeItem: (key: string) => { data.delete(key); } };
}

describe("tab-scoped Google session", () => {
  it("survives reconstruction until expiry, then removes the credential", () => {
    const storage = memory();
    createGoogleSessionStore(() => storage).save(value);
    const reloaded = createGoogleSessionStore(() => storage);
    expect(reloaded.load(value.clientId, value.workbookId, now)).toEqual(value);
    expect(reloaded.load(value.clientId, value.workbookId, value.validUntil)).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it("rejects a different client, workbook, scope or an excessive lifetime", () => {
    for (const invalid of [{ ...value, clientId: "other" }, { ...value, workbookId: "other" }, { ...value, scope: "other" }, { ...value, validUntil: now + 3_600_001 }, { ...value, accessToken: "" }]) {
      const storage = memory();
      const store = createGoogleSessionStore(() => storage);
      store.save(invalid);
      expect(store.load(value.clientId, value.workbookId, now)).toBeNull();
      expect(storage.data.size).toBe(0);
    }
  });

  it("separates synthetic acceptance from the normal session and clears only its key", () => {
    const storage = memory();
    const normal = createGoogleSessionStore(() => storage);
    const acceptance = createGoogleSessionStore(() => storage, "synthetic");
    normal.save(value);
    expect(acceptance.load(value.clientId, value.workbookId, now)).toBeNull();
    acceptance.clear();
    expect(normal.load(value.clientId, value.workbookId, now)).toEqual(value);
  });

  it("survives blocked, full and malformed storage", () => {
    const blocked = createGoogleSessionStore(() => { throw new Error("blocked"); });
    expect(() => { blocked.save(value); blocked.clear(); }).not.toThrow();
    expect(blocked.load(value.clientId, value.workbookId, now)).toBeNull();
    const storage = memory();
    const store = createGoogleSessionStore(() => storage);
    storage.data.set("foliodash.google-session.v1", "invalid json");
    expect(store.load(value.clientId, value.workbookId, now)).toBeNull();
    expect(storage.data.size).toBe(0);
  });
});
