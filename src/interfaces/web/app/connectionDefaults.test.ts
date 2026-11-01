import { describe, expect, it } from "vitest";
import { connectionDefaults } from "./connectionDefaults";

describe("connectionDefaults", () => {
  it("reads the two public locators and nothing else", () => {
    expect(connectionDefaults({ VITE_GOOGLE_CLIENT_ID: " client ", VITE_GOOGLE_SCRIPT_ID: "script", VITE_GOOGLE_WORKBOOK_ID: "workbook" })).toEqual({ clientId: "client", scriptId: "script" });
  });

  it("is empty when nothing is set, so the page asks the person", () => {
    expect(connectionDefaults({})).toEqual({ clientId: "", scriptId: "" });
    expect(connectionDefaults({ VITE_GOOGLE_CLIENT_ID: 5 })).toEqual({ clientId: "", scriptId: "" });
  });
});
