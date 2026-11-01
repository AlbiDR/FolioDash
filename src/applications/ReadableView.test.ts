import { describe, expect, it } from "vitest";
import { EMPTY_LEDGER } from "../core/Ledger";
import { readableView } from "./ReadableView";

describe("readableView", () => {
  it("says there is nothing yet for an empty ledger, and always says it is rebuilt and not a record", () => {
    const lines = readableView(EMPTY_LEDGER);
    expect(lines.flat().join(" ")).toContain("No statements recorded yet");
    expect(lines.flat().join(" ")).toContain("rebuilt");
  });

  it("titles the sheet simply FolioDash", () => {
    expect(readableView(EMPTY_LEDGER)[0]).toEqual(["FolioDash"]);
  });
});

describe("statementCells", () => {
  it("keeps text as text, writes a number only when nothing is lost, and leaves empty cells empty", async () => {
    const { statementCells } = await import("./ReadableView");
    const cells = statementCells({
      date1904: false,
      rows: [[undefined, { kind: "text", text: "Fondi" }, { kind: "number", text: "652.289", format: null }, { kind: "number", text: "1.10", format: null }, { kind: "formula" }]],
    });
    // "1.10" would become 1.1, so it stays as the file wrote it.
    expect(cells).toEqual([["", "Fondi", 652.289, "1.10", ""]]);
  });
});
