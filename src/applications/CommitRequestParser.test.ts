import { describe, expect, it } from "vitest";
import { parseIsin } from "../core/Isin";
import { parseCommitRequest } from "./CommitRequestParser";

function isin(code: string): string {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XS${code.padEnd(9, "0")}${String(digit)}`);
    if (candidate !== null) return candidate;
  }
  throw new Error("no check digit");
}

const A = isin("FUNDA");

function valid(): Record<string, unknown> {
  return {
    commandId: "command-0001",
    expectedRevision: "",
    date: "2026-01-15",
    statement: { funds: [{ isin: A, name: "Fund A", marketValue: 100000 }], fundsSubtotal: 100000 },
    commands: [{ isin: A, action: "Start", moneyIn: 0, moneyOut: 0, comment: "", openingNetInvested: 90000 }],
  };
}

describe("parseCommitRequest", () => {
  it("accepts a well-formed request and keeps only known fields", () => {
    const parsed = parseCommitRequest({ ...valid(), extra: "ignored" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.commands[0]).toEqual({ isin: A, action: "Start", moneyIn: 0, moneyOut: 0, comment: "", openingNetInvested: 90000 });
      expect(Object.keys(parsed.request).sort()).toEqual(["commandId", "commands", "date", "expectedRevision", "statement"]);
    }
  });

  it("normalises an ISIN written in lower case", () => {
    const body = valid();
    body["statement"] = { funds: [{ isin: A.toLowerCase(), name: "Fund A", marketValue: 1 }], fundsSubtotal: 1 };
    const parsed = parseCommitRequest(body);
    expect(parsed.ok && parsed.request.statement.funds[0]?.isin).toBe(A);
  });

  it.each([
    ["not an object", "text"],
    ["a null body", null],
    ["an array", []],
  ])("refuses %s", (_label, body) => {
    expect(parseCommitRequest(body).ok).toBe(false);
  });

  it.each<[string, (body: Record<string, unknown>) => void]>([
    ["a missing command id", (body) => { delete body["commandId"]; }],
    ["a short command id", (body) => { body["commandId"] = "x"; }],
    ["a missing expected revision", (body) => { delete body["expectedRevision"]; }],
    ["an impossible date", (body) => { body["date"] = "2026-02-30"; }],
    ["a date with a time", (body) => { body["date"] = "2026-01-15T10:00:00Z"; }],
    ["a bad ISIN", (body) => { body["statement"] = { funds: [{ isin: "US0378331006", name: "x", marketValue: 1 }], fundsSubtotal: 1 }; }],
    ["fractional cents", (body) => { body["statement"] = { funds: [{ isin: A, name: "x", marketValue: 1.5 }], fundsSubtotal: 1 }; }],
    ["a negative value", (body) => { body["statement"] = { funds: [{ isin: A, name: "x", marketValue: -1 }], fundsSubtotal: 1 }; }],
    ["a text amount", (body) => { body["statement"] = { funds: [{ isin: A, name: "x", marketValue: "100" }], fundsSubtotal: 1 }; }],
    ["an unknown action", (body) => { body["commands"] = [{ isin: A, action: "Delete", moneyIn: 0, moneyOut: 0, comment: "" }]; }],
    ["a missing comment", (body) => { body["commands"] = [{ isin: A, action: "Keep", moneyIn: 0, moneyOut: 0 }]; }],
    ["a bad opening amount", (body) => { body["commands"] = [{ isin: A, action: "Start", moneyIn: 0, moneyOut: 0, comment: "", openingNetInvested: "9" }]; }],
    ["decisions that are not a list", (body) => { body["commands"] = "none"; }],
  ])("refuses %s", (_label, mutate) => {
    const body = valid();
    mutate(body);
    expect(parseCommitRequest(body).ok).toBe(false);
  });
});
