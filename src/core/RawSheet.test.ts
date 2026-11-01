import { describe, expect, it } from "vitest";
import { canonicalJson } from "./CanonicalJson";
import { type RawSheet, parseStoredSheet, toStoredSheet } from "./RawSheet";

const sheet: RawSheet = {
  date1904: false,
  rows: [
    [undefined, { kind: "text", text: "Fondi" }, undefined],
    [{ kind: "number", text: "652.289", format: "0.000" }, { kind: "number", text: "10", format: null }, { kind: "formula" }],
  ],
};

describe("stored sheets", () => {
  it("round-trips exactly through JSON text, keeping empty cells empty and numbers as the file's own text", () => {
    const text = canonicalJson(toStoredSheet(sheet));
    expect(parseStoredSheet(JSON.parse(text))).toEqual(sheet);
  });

  it("writes the same text for the same sheet, so its checksum is stable", () => {
    expect(canonicalJson(toStoredSheet(sheet))).toBe(canonicalJson(toStoredSheet({ ...sheet })));
  });

  it.each([
    ["not an object", 5],
    ["no rows", { date1904: false }],
    ["a non-boolean date system", { rows: [], date1904: "no" }],
    ["a row that is not a list", { rows: [5], date1904: false }],
    ["an unknown cell kind", { rows: [[{ kind: "image" }]], date1904: false }],
    ["a number cell without text", { rows: [[{ kind: "number", format: null }]], date1904: false }],
    ["a cell that is an array", { rows: [[[]]], date1904: false }],
    ["too many rows", { rows: Array.from({ length: 2001 }, () => []), date1904: false }],
    ["too many columns", { rows: [Array.from({ length: 65 }, () => null)], date1904: false }],
    ["text that is far too long", { rows: [[{ kind: "text", text: "x".repeat(5001) }]], date1904: false }],
  ])("refuses a stored sheet with %s", (_name, value) => {
    expect(parseStoredSheet(value)).toBeNull();
  });
});
