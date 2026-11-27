import { expect, it } from "vitest";
import type { RestClient } from "../rest";
import { readLedgerRows } from "./ledger-rows";

const answering =
  (status: number): RestClient =>
  () =>
    Promise.resolve({ status, json: () => Promise.resolve({}) });

it("reports a missing tab (Google's 400) as not a ledger", async () => {
  expect(await readLedgerRows(answering(400), "token", "sheet")).toEqual({ ok: true, value: { notALedger: true } });
});

it("keeps a timeout, a conflict or a redirect a failure to read, never a verdict on the tab", async () => {
  for (const status of [302, 408, 409]) {
    const result = await readLedgerRows(answering(status), "token", "sheet");
    expect(result.ok).toBe(false);
  }
});
