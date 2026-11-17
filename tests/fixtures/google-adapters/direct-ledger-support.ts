import { FakeGoogle } from "../fake-google";
import type { CommitRequest } from "../../../src/applications/ledger/ledger-service";
import type { FundCommand, StatementInput } from "../../../src/core/statements/import-plan";
import { type IsoDate, parseIsoDate } from "../../../src/core/values/iso-date";
import { parseIsin } from "../../../src/core/values/isin";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "../../../src/core/values/money";
import { type DirectDeps, ensureWorkbook } from "../../../src/adapters/google/direct-ledger";

export const cents = (value: number): EuroCents => toEuroCents(Math.round(value * 100)) ?? ZERO_CENTS;
export const date = (text: string): IsoDate => parseIsoDate(text) as IsoDate;
export const ISIN = (() => {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XSFUNDA0000${String(digit)}`);
    if (candidate !== null) return candidate;
  }
  throw new Error("no check digit");
})();

export function statement(value: number): StatementInput {
  return { funds: [{ isin: ISIN, name: "Synthetic Fund A", marketValue: cents(value) }], fundsSubtotal: cents(value) };
}
export const start: FundCommand = {
  isin: ISIN,
  action: "Start",
  moneyIn: ZERO_CENTS,
  moneyOut: ZERO_CENTS,
  openingNetInvested: cents(1000),
  comment: "",
};
export const keep: FundCommand = { isin: ISIN, action: "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" };

export function first(revision = "", commandId = "command-first-0001"): CommitRequest {
  return {
    commandId,
    expectedRevision: revision,
    statement: statement(1000),
    date: date("2026-01-31"),
    commands: [start],
  };
}
export function second(revision: string, commandId = "command-second-001"): CommitRequest {
  return {
    commandId,
    expectedRevision: revision,
    statement: statement(1100),
    date: date("2026-02-28"),
    commands: [keep],
  };
}

export function setup() {
  const google = new FakeGoogle();
  let counter = 0;
  const deps: DirectDeps = { rest: google.client, newRevision: () => `revision-${String(++counter).padStart(4, "0")}` };
  return { google, deps, token: google.token };
}

export async function readyWorkbook(google: FakeGoogle) {
  const ensured = await ensureWorkbook(google.client, google.token);
  if (ensured.status !== "ready") throw new Error("setup failed");
  return ensured.workbook;
}
