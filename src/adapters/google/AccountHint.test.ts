import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../tests/fixtures/FakeGoogle";
import { fetchAccountHint } from "./AccountHint";

describe("the account hint", () => {
  it("reads the signed-in account's address from Drive", async () => {
    const google = new FakeGoogle();
    expect(await fetchAccountHint(google.client, google.token)).toBe("person@example.test");
    expect(google.calls).toEqual(["GET /drive/v3/about"]);
  });

  it("is simply absent when Google refuses, loses the answer or returns something else", async () => {
    const google = new FakeGoogle();
    expect(await fetchAccountHint(google.client, "wrong-token")).toBeNull();
    google.faults.push({ match: /about/u, network: true });
    expect(await fetchAccountHint(google.client, google.token)).toBeNull();
    for (const body of [{}, { user: {} }, { user: { emailAddress: 7 } }, { user: { emailAddress: "no-at-sign" } }, null]) {
      const odd = { status: 200, json: () => Promise.resolve(body) };
      expect(await fetchAccountHint(() => Promise.resolve(odd), "token")).toBeNull();
    }
  });
});
