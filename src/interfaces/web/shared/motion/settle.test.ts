import { describe, expect, it } from "vitest";
import { createSettle } from "./settle";

describe("createSettle", () => {
  it("reports no previous render and no change on the first render, so nothing moves on first paint", () => {
    const settle = createSettle<string[]>();
    expect(settle(["a"], "3M")).toEqual({ before: null, changed: false });
  });

  it("reports the previous snapshot and no change while the key stays the same", () => {
    const settle = createSettle<string[]>();
    settle(["a"], "3M");
    expect(settle(["a", "b"], "3M")).toEqual({ before: ["a"], changed: false });
  });

  it("reports the previous snapshot and a change when the key differs", () => {
    const settle = createSettle<string[]>();
    settle(["a"], "3M");
    expect(settle(["b"], "6M")).toEqual({ before: ["a"], changed: true });
  });

  it("compares each render with the one before it, not with the first", () => {
    const settle = createSettle<number>();
    settle(1, "3M");
    settle(2, "6M");
    expect(settle(3, "6M")).toEqual({ before: 2, changed: false });
  });

  it("treats a missing key as a key like any other", () => {
    const settle = createSettle<number>();
    settle(1, undefined);
    expect(settle(2, undefined)).toEqual({ before: 1, changed: false });
    expect(settle(3, "3M")).toEqual({ before: 2, changed: true });
  });
});
