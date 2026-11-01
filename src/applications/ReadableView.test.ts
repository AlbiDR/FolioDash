import { describe, expect, it } from "vitest";
import { EMPTY_LEDGER } from "../core/Ledger";
import { readableView } from "./ReadableView";

describe("readableView", () => {
  it("says there is nothing yet for an empty ledger, and always says it is rebuilt and not a record", () => {
    const text = readableView(EMPTY_LEDGER).cells.flat().map((cell) => String(cell.value)).join(" ");
    expect(text).toContain("No statements recorded yet");
    expect(text).toContain("rebuilt");
  });

  it("titles the sheet simply FolioDash", () => {
    expect(readableView(EMPTY_LEDGER).cells[1]?.[1]?.value).toBe("FolioDash");
  });
});
