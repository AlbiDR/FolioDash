import { describe, expect, it } from "vitest";
import { type KeyValueStore, createConnectionStorage } from "./connectionStorage";

const config = { clientId: "1234567890-abc.apps.googleusercontent.com", scriptId: "script-id-0000000001", workbookId: "workbook-id-00000001" };

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
}

describe("createConnectionStorage", () => {
  it("remembers and returns the three IDs, and forgets them on request", () => {
    const store = memory();
    const storage = createConnectionStorage(() => store);
    expect(storage.load()).toBeNull();
    storage.save(config);
    expect(storage.load()).toEqual(config);
    expect(Object.keys(JSON.parse([...store.data.values()][0] ?? "{}") as object).sort()).toEqual(["clientId", "scriptId", "workbookId"]);
    storage.clear();
    expect(storage.load()).toBeNull();
  });

  it("ignores stored data that is damaged or no longer valid", () => {
    const store = memory();
    const storage = createConnectionStorage(() => store);
    store.data.set("foliodash.connection.v1", "not json");
    expect(storage.load()).toBeNull();
    store.data.set("foliodash.connection.v1", JSON.stringify({ clientId: "x", scriptId: 5 }));
    expect(storage.load()).toBeNull();
  });

  it("survives a store that is blocked or missing", () => {
    const storage = createConnectionStorage(() => {
      throw new Error("storage blocked");
    });
    expect(() => { storage.save(config); storage.clear(); }).not.toThrow();
    expect(storage.load()).toBeNull();
  });
});
