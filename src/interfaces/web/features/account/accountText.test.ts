import { describe, expect, it } from "vitest";
import type { ConnectOutcome, RestoreOutcome } from "../../app/session";
import { describeConnect, describeRestore } from "./accountText";

describe("describeConnect", () => {
  it("says a new sheet is ready, an update, or that nothing changed", () => {
    expect(describeConnect({ status: "connected", created: true, statements: 0, changed: true }).title).toBe("Your Google Sheet is ready");
    expect(describeConnect({ status: "connected", created: false, statements: 3, changed: true }).body).toContain("3 statements");
    expect(describeConnect({ status: "connected", created: false, statements: 1, changed: false }).title).toBe("Already up to date");
  });

  it("never reads a failure as success, and says the saved copy was not changed", () => {
    const failures: ConnectOutcome[] = [
      { status: "sign-in-failed", reason: "denied" },
      { status: "call-failed", failure: "network" },
      { status: "needs-attention", sheet: "missing", message: "gone" },
    ];
    for (const outcome of failures) expect(describeConnect(outcome).good).toBe(false);
    expect(describeConnect({ status: "call-failed", failure: "unavailable" }).body).toContain("not changed");
  });
});

describe("describeRestore", () => {
  it("separates success, nothing to do, and failure", () => {
    const outcomes: [RestoreOutcome, boolean][] = [
      [{ status: "restored", workbook: { id: "a", url: "b" } }, true],
      [{ status: "not-needed" }, true],
      [{ status: "nothing-to-restore" }, false],
      [{ status: "failed", message: "x" }, false],
      [{ status: "sign-in-failed", reason: "closed" }, false],
    ];
    for (const [outcome, good] of outcomes) expect(describeRestore(outcome).good).toBe(good);
  });
});
