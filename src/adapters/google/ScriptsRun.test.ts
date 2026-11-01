import { describe, expect, it } from "vitest";
import { type HttpClient, runScriptFunction, summariseCheck } from "./ScriptsRun";

interface Call {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

function client(status: number, body: unknown, calls: Call[] = []): HttpClient {
  return (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as unknown });
    return Promise.resolve({ status, json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)) });
  };
}

const request = { scriptId: "script-id-0001", accessToken: "secret-token-value", functionName: "foliodashCheck", parameters: ["workbook-id-0001"] };

describe("runScriptFunction", () => {
  it("sends the function and parameters, with the token only in the Authorization header", async () => {
    const calls: Call[] = [];
    const outcome = await runScriptFunction(client(200, { done: true, response: { "@type": "x", result: { ok: true } } }, calls), request);
    expect(outcome).toEqual({ status: "ok", result: { ok: true } });
    expect(calls[0]?.url).toBe("https://script.googleapis.com/v1/scripts/script-id-0001:run");
    expect(calls[0]?.headers).toEqual({ Authorization: "Bearer secret-token-value", "Content-Type": "application/json" });
    expect(calls[0]?.body).toEqual({ function: "foliodashCheck", parameters: ["workbook-id-0001"], devMode: false });
    expect(JSON.stringify(calls[0]?.body)).not.toContain("secret-token-value");
  });

  it("encodes an unusual script id so it cannot alter the path", async () => {
    const calls: Call[] = [];
    await runScriptFunction(client(200, { response: { result: 1 } }, calls), { ...request, scriptId: "a/b?c" });
    expect(calls[0]?.url).toBe("https://script.googleapis.com/v1/scripts/a%2Fb%3Fc:run");
  });

  it.each([
    [401, "unauthorised"],
    [403, "forbidden"],
    [404, "not-found"],
    [429, "unavailable"],
    [503, "unavailable"],
  ])("maps HTTP %i to %s without reading the body", async (status, expected) => {
    expect(await runScriptFunction(client(status, undefined), request)).toEqual({ status: expected });
  });

  it("reports a script error with the script's own message, shortened", async () => {
    const body = { done: true, error: { code: 3, message: "ScriptError", details: [{ errorMessage: "x".repeat(500), errorType: "Error" }] } };
    const outcome = await runScriptFunction(client(200, body), request);
    expect(outcome.status === "script-error" && outcome.message.length).toBe(300);
  });

  it("reports a network failure without echoing the error", async () => {
    const failing: HttpClient = () => Promise.reject(new Error("connection reset for secret-token-value"));
    const outcome = await runScriptFunction(failing, request);
    expect(outcome).toEqual({ status: "network" });
    expect(JSON.stringify(outcome)).not.toContain("secret");
  });

  it("treats an unreadable or unexpected body as unexpected", async () => {
    expect(await runScriptFunction(client(200, undefined), request)).toEqual({ status: "unexpected" });
    expect(await runScriptFunction(client(200, "text"), request)).toEqual({ status: "unexpected" });
    expect(await runScriptFunction(client(200, { done: true }), request)).toEqual({ status: "unexpected" });
    expect(await runScriptFunction(client(400, { error: {} }), request)).toEqual({ status: "unexpected" });
  });
});

describe("summariseCheck", () => {
  it("summarises an intact ledger", () => {
    const answer = { ok: true, value: { status: "ok", ignoredTrailingRows: 2, state: { revision: "rev-1", funds: [], snapshots: [{}, {}] } } };
    expect(summariseCheck(answer)).toEqual({ kind: "ready", statements: 2, revision: "rev-1", ignoredTrailingRows: 2 });
  });

  it("recognises an empty, never-used workbook as a ledger with no statements", () => {
    const answer = { ok: true, value: { status: "ok", ignoredTrailingRows: 0, state: { revision: "", funds: [], snapshots: [] } } };
    expect(summariseCheck(answer)).toEqual({ kind: "ready", statements: 0, revision: "", ignoredTrailingRows: 0 });
  });

  it("reports damage, unavailability and refusals", () => {
    expect(summariseCheck({ ok: true, value: { status: "damaged", message: "bad checksum" } })).toEqual({ kind: "damaged", message: "bad checksum" });
    expect(summariseCheck({ ok: false, error: "unavailable", message: "no access" })).toEqual({ kind: "workbook-unavailable" });
    expect(summariseCheck({ ok: false, error: "invalid-request", message: "bad id" })).toEqual({ kind: "refused", message: "bad id" });
  });

  it("does not guess at an answer it does not understand", () => {
    for (const answer of [null, "text", [], {}, { ok: true }, { ok: true, value: { status: "ok" } }, { ok: true, value: { status: "ok", state: { snapshots: "x", revision: 1 } } }]) {
      expect(summariseCheck(answer)).toEqual({ kind: "unrecognised" });
    }
  });
});
