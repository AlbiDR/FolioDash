import { describe, expect, it } from "vitest";
import type { HttpClient } from "../../../adapters/google/ScriptsRun";
import type { IsoDate } from "../../../core/IsoDate";
import { EMPTY_LEDGER } from "../../../core/Ledger";
import type { ConnectionConfig } from "../features/connection/ConnectionModel";
import type { RecordRequest } from "../features/import/ImportModel";
import { createRemoteSave } from "./googleLedger";
import type { SignInResult } from "./googleIdentity";

const config: ConnectionConfig = { clientId: "1234567890-abc.apps.googleusercontent.com", scriptId: "script-id-0000000001", workbookId: "workbook-id-00000001" };
const request: RecordRequest = { date: "2026-01-31" as IsoDate, statement: { funds: [], fundsSubtotal: 0 as never }, commands: [] };
const answer = (result: unknown) => ({ done: true, response: { result } });
const readOk = answer({ ok: true, value: { status: "ok", ignoredTrailingRows: 0, state: EMPTY_LEDGER } });
const signedIn = (): Promise<SignInResult> => Promise.resolve({ ok: true, accessToken: "token" });

/** Replies to each call in turn and records which functions were called. */
function script(replies: readonly { status: number; body?: unknown }[], calls: string[] = []): HttpClient {
  let index = 0;
  return (_url, init) => {
    calls.push((JSON.parse(init.body) as { function: string }).function);
    const reply = replies[index++] ?? { status: 500 };
    return Promise.resolve({ status: reply.status, json: () => (reply.body === undefined ? Promise.reject(new Error("none")) : Promise.resolve(reply.body)) });
  };
}
const save = (http: HttpClient, signIn: () => Promise<SignInResult> = signedIn) => createRemoteSave({ signIn, http }, config, () => "command-0001");

describe("createRemoteSave.record", () => {
  it("commits, then reads the spreadsheet back, and reports what the spreadsheet holds", async () => {
    const calls: string[] = [];
    const committed = answer({ ok: true, value: { status: "committed", revision: "rev-2" } });
    const result = await save(script([{ status: 200, body: committed }, { status: 200, body: readOk }], calls)).record(request, "command-0001", "");
    expect(result).toEqual({ status: "recorded", ledger: EMPTY_LEDGER });
    expect(calls).toEqual(["foliodashCommit", "foliodashRead"]);
  });

  it("says the statement was saved, not lost, when only the read-back fails", async () => {
    const committed = answer({ ok: true, value: { status: "committed", revision: "rev-2" } });
    const result = await save(script([{ status: 200, body: committed }, { status: 503 }])).record(request, "command-0001", "");
    expect(result).toEqual({ status: "saved-not-reloaded" });
  });

  it("does not call the service when sign-in fails, and says nothing was saved", async () => {
    const calls: string[] = [];
    const result = await save(script([], calls), () => Promise.resolve({ ok: false, reason: "closed" })).record(request, "command-0001", "");
    expect(result.status).toBe("not-saved");
    expect(calls).toEqual([]);
  });

  it("reports a stale review without writing, and a refusal before the script ran as not saved", async () => {
    const stale = answer({ ok: true, value: { status: "stale", currentRevision: "rev-9" } });
    expect((await save(script([{ status: 200, body: stale }])).record(request, "command-0001", "")).status).toBe("stale");
    expect((await save(script([{ status: 403 }])).record(request, "command-0001", "")).status).toBe("not-saved");
  });

  it("reports a lost or ambiguous result as unknown and does not read back or retry", async () => {
    const calls: string[] = [];
    const result = await save(script([{ status: 503 }, { status: 200, body: readOk }], calls)).record(request, "command-0001", "");
    expect(result.status).toBe("unknown");
    expect(calls).toEqual(["foliodashCommit"]);
  });
});

describe("createRemoteSave.check", () => {
  it("resolves a lost save by asking the spreadsheet, writing nothing", async () => {
    const calls: string[] = [];
    const found = answer({ ok: true, value: { status: "committed", receipt: {} } });
    expect(await save(script([{ status: 200, body: found }, { status: 200, body: readOk }], calls)).check("command-0001")).toEqual({ status: "recorded", ledger: EMPTY_LEDGER });
    expect(calls).toEqual(["foliodashOutcome", "foliodashRead"]);
    const missing = answer({ ok: true, value: { status: "not-found" } });
    expect(await save(script([{ status: 200, body: missing }])).check("command-0001")).toEqual({ status: "not-recorded" });
    expect((await save(script([{ status: 503 }])).check("command-0001")).status).toBe("cannot-tell");
  });
});

describe("createRemoteSave sign-in reuse", () => {
  it("asks once while the token is valid and again after it has expired", async () => {
    let asked = 0;
    let clock = 0;
    const calls: string[] = [];
    const remote = createRemoteSave(
      { signIn: () => { asked++; return Promise.resolve({ ok: true, accessToken: "token", expiresInSeconds: 3600 }); }, http: script(Array.from({ length: 6 }, () => ({ status: 200, body: answer({ ok: true, value: { status: "not-found" } }) })), calls) },
      config,
      () => "command-0001",
      () => clock,
    );
    await remote.check("command-0001");
    await remote.check("command-0001");
    expect(asked).toBe(1);
    clock = 3600 * 1000;
    await remote.check("command-0001");
    expect(asked).toBe(2);
  });

  it("asks every time when Google did not say how long the token lasts", async () => {
    let asked = 0;
    const remote = createRemoteSave({ signIn: () => { asked++; return signedIn(); }, http: script([{ status: 503 }, { status: 503 }]) }, config, () => "command-0001");
    await remote.check("command-0001");
    await remote.check("command-0001");
    expect(asked).toBe(2);
  });
});
