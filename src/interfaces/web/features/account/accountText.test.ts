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

describe("describeVerify", () => {
  const report = (overrides: Partial<{ months: number; matching: number; withoutStatement: number; differing: string[]; unreadable: string[] }> = {}) => ({
    status: "checked" as const,
    report: { months: 17, matching: 17, withoutStatement: 0, differing: [], unreadable: [], ...overrides } as never,
  });

  it("says the whole history can be rebuilt only when every month does", async () => {
    const { describeVerify } = await import("./accountText");
    expect(describeVerify(report())).toMatchObject({ good: true, title: "Your whole history can be rebuilt" });
  });

  it("says plainly which months cannot be checked, without calling them wrong", async () => {
    const { describeVerify } = await import("./accountText");
    const message = describeVerify(report({ matching: 12, withoutStatement: 5 }));
    expect(message.good).toBe(true);
    expect(message.title).toBe("What can be checked, matches");
    expect(message.body).toContain("12 of 17 months");
    expect(message.body).toContain("5 months were saved without");
  });

  it("names the months that do not match and never reports success for them", async () => {
    const { describeVerify } = await import("./accountText");
    const message = describeVerify(report({ matching: 16, differing: ["2026-02-28"] }));
    expect(message).toMatchObject({ good: false, title: "Something does not match" });
    expect(message.body).toContain("February 2026");
  });

  it("handles an empty ledger and every failure", async () => {
    const { describeVerify } = await import("./accountText");
    expect(describeVerify(report({ months: 0, matching: 0 })).title).toBe("Nothing to check yet");
    expect(describeVerify({ status: "failed", message: "x" }).good).toBe(false);
    expect(describeVerify({ status: "needs-attention", message: "x" }).good).toBe(false);
    expect(describeVerify({ status: "sign-in-failed", reason: "denied" }).good).toBe(false);
  });
});
