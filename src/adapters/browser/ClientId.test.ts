import { describe, expect, it } from "vitest";
import { type ClientIdStore, forgetClientId, isClientId, rememberClientId, resolveClientId } from "./ClientId";

const VALID = "1234567890-abcdef.apps.googleusercontent.com";
const memory = (): ClientIdStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
};
const blocked = (): ClientIdStore => {
  throw new Error("blocked");
};

describe("client id", () => {
  it("accepts only the shape of a Google client id", () => {
    expect(isClientId(VALID)).toBe(true);
    expect(isClientId(` ${VALID} `)).toBe(true);
    for (const text of ["", "client", "123-abc.example.com", "abc.apps.googleusercontent.com"]) expect(isClientId(text)).toBe(false);
  });

  it("prefers the one built into the site, then the one remembered on this device, then none", () => {
    const store = memory();
    expect(resolveClientId(undefined, () => store)).toBe("");
    expect(rememberClientId(VALID, () => store)).toBe(true);
    expect(resolveClientId(undefined, () => store)).toBe(VALID);
    expect(resolveClientId("9999999999-built.apps.googleusercontent.com", () => store)).toBe("9999999999-built.apps.googleusercontent.com");
    forgetClientId(() => store);
    expect(resolveClientId("not valid", () => store)).toBe("");
  });

  it("does not remember something that is not a client id, and survives blocked storage", () => {
    const store = memory();
    expect(rememberClientId("nonsense", () => store)).toBe(false);
    expect(store.data.size).toBe(0);
    expect(resolveClientId(undefined, blocked)).toBe("");
    expect(rememberClientId(VALID, blocked)).toBe(false);
    expect(() => {
      forgetClientId(blocked);
    }).not.toThrow();
  });
});
