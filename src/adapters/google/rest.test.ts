import { expect, it } from "vitest";
import { callRest, wroteNothing, type RestFailure } from "./rest";

const answer = (status: number) =>
  callRest(() => Promise.resolve({ status, json: () => Promise.resolve({}) }), "token", {
    method: "POST",
    url: "https://example.test",
  });

it("counts only a refusal that did nothing as a write that did nothing", () => {
  for (const failure of ["unauthorised", "forbidden", "not-found"] as const satisfies readonly RestFailure[])
    expect(wroteNothing(failure)).toBe(true);
  for (const failure of ["unavailable", "network", "unexpected"] as const satisfies readonly RestFailure[])
    expect(wroteNothing(failure)).toBe(false);
});

it("treats a redirect, a timeout and an odd status as an unknown outcome, never as nothing written", async () => {
  for (const status of [302, 408, 499]) {
    const result = await answer(status);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(wroteNothing(result.failure)).toBe(false);
  }
});
