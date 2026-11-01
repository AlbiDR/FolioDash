import { describe, expect, it } from "vitest";
import type { CommitRequest } from "../../applications/LedgerService";
import { EMPTY_LEDGER, parseLedgerState } from "../../core/Ledger";
import type { IsoDate } from "../../core/IsoDate";
import { type RemoteTarget, commitRemote, interpretRead, readRemoteCommandOutcome, readRemoteLedger } from "./LedgerClient";
import type { HttpClient } from "./ScriptsRun";

const target: RemoteTarget = { scriptId: "script-id-0000000001", workbookId: "workbook-id-00000001", accessToken: "secret-token" };
const request: CommitRequest = { commandId: "command-0001", expectedRevision: "", statement: { funds: [], fundsSubtotal: 0 as never }, date: "2026-01-31" as IsoDate, commands: [] };

function http(status: number, body: unknown, seen: { body?: unknown } = {}): HttpClient {
  return (_url, init) => {
    seen.body = JSON.parse(init.body) as unknown;
    return Promise.resolve({ status, json: () => (body === undefined ? Promise.reject(new Error("none")) : Promise.resolve(body)) });
  };
}
const answer = (result: unknown) => ({ done: true, response: { result } });

describe("parseLedgerState", () => {
  it("accepts a valid empty ledger and refuses wrong shapes", () => {
    expect(parseLedgerState(EMPTY_LEDGER)).toEqual(EMPTY_LEDGER);
    for (const value of [null, "x", [], {}, { revision: 1, funds: [], snapshots: [] }, { revision: "r", funds: {}, snapshots: [] }]) {
      expect(parseLedgerState(value)).toBeNull();
    }
  });

  it("refuses a ledger that breaks the ledger rules, instead of showing it", () => {
    const broken = { revision: "r", funds: [{ isin: "NOT-AN-ISIN", name: "A", fullName: "A", firstDate: "2026-01-31" }], snapshots: [] };
    expect(parseLedgerState(broken)).toBeNull();
  });
});

describe("interpretRead", () => {
  it("reads an intact ledger, reports damage, and refuses to guess", () => {
    expect(interpretRead({ ok: true, value: { status: "ok", ignoredTrailingRows: 3, state: EMPTY_LEDGER } })).toEqual({ status: "ok", state: EMPTY_LEDGER, ignoredTrailingRows: 3 });
    expect(interpretRead({ ok: true, value: { status: "damaged", message: "bad" } })).toEqual({ status: "damaged", message: "bad" });
    expect(interpretRead({ ok: true, value: { status: "ok", state: { revision: "r", funds: [], snapshots: "x" } } })).toEqual({
      status: "damaged",
      message: "The ledger in the spreadsheet did not pass validation.",
    });
    expect(interpretRead({ ok: false, error: "unavailable", message: "x" })).toEqual({ status: "workbook-unavailable" });
    expect(interpretRead("surprise")).toEqual({ status: "unrecognised" });
  });
});

describe("readRemoteLedger", () => {
  it("calls the read operation with only the workbook id", async () => {
    const seen: { body?: unknown } = {};
    const result = await readRemoteLedger(http(200, answer({ ok: true, value: { status: "ok", ignoredTrailingRows: 0, state: EMPTY_LEDGER } }), seen), target);
    expect(result.status).toBe("ok");
    expect(seen.body).toEqual({ function: "foliodashRead", parameters: ["workbook-id-00000001"], devMode: false });
  });
});

describe("commitRemote", () => {
  it("sends the workbook id and the request, and never the token in the body", async () => {
    const seen: { body?: unknown } = {};
    await commitRemote(http(200, answer({ ok: true, value: { status: "committed", revision: "rev-2" } }), seen), target, request);
    expect(seen.body).toEqual({ function: "foliodashCommit", parameters: ["workbook-id-00000001", request], devMode: false });
    expect(JSON.stringify(seen.body)).not.toContain("secret-token");
  });

  it.each([
    [{ ok: true, value: { status: "committed", revision: "rev-2" } }, { status: "committed", revision: "rev-2" }],
    [{ ok: true, value: { status: "already-committed", revision: "rev-1" } }, { status: "already-committed", revision: "rev-1" }],
    [{ ok: true, value: { status: "stale", currentRevision: "rev-9" } }, { status: "stale" }],
    [{ ok: true, value: { status: "damaged", message: "checksum" } }, { status: "damaged", message: "checksum" }],
    [{ ok: true, value: { status: "not-committed", message: "Nothing was recorded." } }, { status: "not-committed", message: "Nothing was recorded." }],
    [{ ok: true, value: { status: "rejected", issues: [{ code: "invalid-cash", isin: null, message: "Cash does not add up." }] } }, { status: "rejected", messages: ["Cash does not add up."] }],
    [{ ok: false, error: "invalid-request", message: "bad date" }, { status: "refused", message: "bad date" }],
  ])("interprets the service's answer %#", async (result, expected) => {
    expect(await commitRemote(http(200, answer(result)), target, request)).toEqual(expected);
  });

  it("treats anything it cannot interpret as unknown, never as failed", async () => {
    for (const result of ["surprise", { ok: true }, { ok: true, value: { status: "committed" } }, { ok: true, value: { status: "unknown", message: "lost" } }, { ok: false, error: "unavailable", message: "x" }]) {
      expect((await commitRemote(http(200, answer(result)), target, request)).status).toBe("unknown");
    }
  });

  it.each([401, 403, 404])("treats HTTP %i as not sent, because the script never ran", async (status) => {
    expect((await commitRemote(http(status, undefined), target, request)).status).toBe("not-sent");
  });

  it.each([429, 500, 503])("treats HTTP %i as unknown, because the request may have reached the script", async (status) => {
    expect((await commitRemote(http(status, undefined), target, request)).status).toBe("unknown");
  });

  it("treats a network failure and a script error as unknown", async () => {
    const failing: HttpClient = () => Promise.reject(new Error("offline"));
    expect((await commitRemote(failing, target, request)).status).toBe("unknown");
    const error = { done: true, error: { details: [{ errorMessage: "Exceeded maximum execution time" }] } };
    expect((await commitRemote(http(200, error), target, request)).status).toBe("unknown");
  });
});

describe("readRemoteCommandOutcome", () => {
  it("resolves a lost result to committed or not-found, and otherwise says it cannot tell", async () => {
    const seen: { body?: unknown } = {};
    expect(await readRemoteCommandOutcome(http(200, answer({ ok: true, value: { status: "committed", receipt: {} } }), seen), target, "command-0001")).toEqual({ status: "committed" });
    expect(seen.body).toEqual({ function: "foliodashOutcome", parameters: ["workbook-id-00000001", "command-0001"], devMode: false });
    expect(await readRemoteCommandOutcome(http(200, answer({ ok: true, value: { status: "not-found" } })), target, "command-0001")).toEqual({ status: "not-found" });
    expect(await readRemoteCommandOutcome(http(200, answer({ ok: true, value: { status: "damaged", message: "bad" } })), target, "command-0001")).toEqual({ status: "damaged", message: "bad" });
    expect(await readRemoteCommandOutcome(http(503, undefined), target, "command-0001")).toEqual({ status: "unreachable" });
    expect(await readRemoteCommandOutcome(http(200, answer("surprise")), target, "command-0001")).toEqual({ status: "unreachable" });
  });
});
