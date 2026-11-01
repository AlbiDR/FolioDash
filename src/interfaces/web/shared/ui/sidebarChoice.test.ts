import { describe, expect, it } from "vitest";
import { type SidebarStorage, readSidebarCollapsed, writeSidebarCollapsed } from "./sidebarChoice";

const memory = (): SidebarStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
};
const blocked = (): SidebarStorage => {
  throw new Error("blocked");
};

describe("sidebar choice", () => {
  it("is open until the person hides it, and remembers the choice either way", () => {
    const store = memory();
    expect(readSidebarCollapsed(() => store)).toBe(false);
    writeSidebarCollapsed(() => store, true);
    expect(readSidebarCollapsed(() => store)).toBe(true);
    writeSidebarCollapsed(() => store, false);
    expect(readSidebarCollapsed(() => store)).toBe(false);
  });

  it("stays open, and does not fail, when storage is blocked", () => {
    expect(readSidebarCollapsed(blocked)).toBe(false);
    expect(() => {
      writeSidebarCollapsed(blocked, true);
    }).not.toThrow();
  });
});
