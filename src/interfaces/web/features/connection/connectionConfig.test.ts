import { describe, expect, it } from "vitest";
import { checkConfig, extractGoogleId } from "./connectionConfig";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc";
const CLIENT = "1234567890-abcdef0123456789.apps.googleusercontent.com";

describe("extractGoogleId", () => {
  it("takes the ID out of a pasted spreadsheet or script address", () => {
    expect(extractGoogleId(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`)).toBe(ID);
    expect(extractGoogleId(`https://script.google.com/d/${ID}/edit`)).toBe(ID);
  });

  it("leaves a bare ID alone and ignores surrounding spaces", () => {
    expect(extractGoogleId(`  ${ID}  `)).toBe(ID);
  });
});

describe("checkConfig", () => {
  it("accepts good values, including pasted addresses", () => {
    const result = checkConfig({
      clientId: ` ${CLIENT} `,
      scriptId: ID,
      workbookId: `https://docs.google.com/spreadsheets/d/${ID}/edit`,
    });
    expect(result).toEqual({ ok: true, config: { clientId: CLIENT, scriptId: ID, workbookId: ID } });
  });

  it("names each field to fix and never echoes what was typed", () => {
    const result = checkConfig({ clientId: "secret-looking-text", scriptId: "short", workbookId: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["clientId", "scriptId", "workbookId"]);
      expect(JSON.stringify(result.errors)).not.toContain("secret-looking-text");
    }
  });

  it("rejects a client ID that is not a Google web client ID, and IDs with odd characters", () => {
    expect(checkConfig({ clientId: "abc.apps.googleusercontent.com", scriptId: ID, workbookId: ID }).ok).toBe(false);
    expect(checkConfig({ clientId: CLIENT, scriptId: `${ID}/../x`, workbookId: ID }).ok).toBe(false);
  });
});
