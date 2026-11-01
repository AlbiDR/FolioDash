import { describe, expect, it } from "vitest";
import type { HttpClient } from "../../../adapters/google/ScriptsRun";
import type { ConnectionConfig, ConnectionStep } from "../features/connection/ConnectionModel";
import { SPREADSHEETS_SCOPE, createConnectionPort } from "./googleConnection";
import { EMPTY_LEDGER } from "../../../core/Ledger";
import type { SignInResult } from "./googleIdentity";

const config: ConnectionConfig = { clientId: "1234567890-abc.apps.googleusercontent.com", scriptId: "script-id-0000000001", workbookId: "workbook-id-00000001" };

function http(status: number, body: unknown, seen: { url?: string; body?: unknown } = {}): HttpClient {
  return (url, init) => {
    seen.url = url;
    seen.body = JSON.parse(init.body) as unknown;
    return Promise.resolve({ status, json: () => Promise.resolve(body) });
  };
}

const signedIn = (): Promise<SignInResult> => Promise.resolve({ ok: true, accessToken: "token" });
const intact = { done: true, response: { result: { ok: true, value: { status: "ok", ignoredTrailingRows: 0, state: EMPTY_LEDGER } } } };

async function run(port: ReturnType<typeof createConnectionPort>) {
  const steps: ConnectionStep[] = [];
  const result = await port(config, (step) => steps.push(step));
  return { result, steps };
}

describe("createConnectionPort", () => {
  it("signs in with the spreadsheet scope only, then calls the check operation with the workbook id", async () => {
    const seen: { url?: string; body?: unknown } = {};
    let scope = "";
    const { result, steps } = await run(
      createConnectionPort({
        signIn: (_client, requested) => {
          scope = requested;
          return signedIn();
        },
        http: http(200, intact, seen),
      }),
    );
    expect(result).toEqual({ status: "connected", statements: 0, ignoredTrailingRows: 0, ledger: EMPTY_LEDGER });
    expect(steps).toEqual(["signing-in", "calling-service"]);
    expect(scope).toBe(SPREADSHEETS_SCOPE);
    expect(seen.url).toContain("script-id-0000000001:run");
    expect(seen.body).toEqual({ function: "foliodashCheck", parameters: ["workbook-id-00000001"], devMode: false });
  });

  it.each(["denied", "closed", "unavailable"] as const)("reports a %s sign-in without calling the service", async (reason) => {
    let called = false;
    const { result, steps } = await run(
      createConnectionPort({
        signIn: () => Promise.resolve({ ok: false, reason }),
        http: () => {
          called = true;
          return Promise.resolve({ status: 200, json: () => Promise.resolve({}) });
        },
      }),
    );
    expect(result).toEqual({ status: "sign-in-failed", reason });
    expect(steps).toEqual(["signing-in"]);
    expect(called).toBe(false);
  });

  it.each([
    [401, "unauthorised"],
    [403, "forbidden"],
    [404, "not-found"],
    [503, "unavailable"],
  ] as const)("maps HTTP %i to a %s failure", async (status, failure) => {
    const { result } = await run(createConnectionPort({ signIn: signedIn, http: http(status, undefined) }));
    expect(result).toEqual({ status: "call-failed", failure, message: null });
  });

  it("passes on the service's own answers: damaged, workbook unavailable, refused, or not understood", async () => {
    const answer = (result: unknown) => ({ done: true, response: { result } });
    const damaged = await run(createConnectionPort({ signIn: signedIn, http: http(200, answer({ ok: true, value: { status: "damaged", message: "checksum" } })) }));
    expect(damaged.result).toEqual({ status: "ledger-damaged", message: "checksum" });
    const unavailable = await run(createConnectionPort({ signIn: signedIn, http: http(200, answer({ ok: false, error: "unavailable", message: "x" })) }));
    expect(unavailable.result).toEqual({ status: "workbook-unavailable" });
    const refused = await run(createConnectionPort({ signIn: signedIn, http: http(200, answer({ ok: false, error: "invalid-request", message: "bad id" })) }));
    expect(refused.result).toEqual({ status: "refused", message: "bad id" });
    const odd = await run(createConnectionPort({ signIn: signedIn, http: http(200, answer("surprise")) }));
    expect(odd.result).toEqual({ status: "unrecognised-answer" });
  });

  it("surfaces a script error's message but never the token", async () => {
    const body = { done: true, error: { details: [{ errorMessage: "ReferenceError: x is not defined" }] } };
    const { result } = await run(createConnectionPort({ signIn: signedIn, http: http(200, body) }));
    expect(result).toEqual({ status: "call-failed", failure: "script-error", message: "ReferenceError: x is not defined" });
    expect(JSON.stringify(result)).not.toContain("token");
  });
});
