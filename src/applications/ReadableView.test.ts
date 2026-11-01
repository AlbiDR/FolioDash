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
