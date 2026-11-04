import { describe, expect, it } from "vitest";
import { memoizeLast } from "./memo";

describe("memoizeLast", () => {
  it("computes once while the arguments stay the same objects, and returns the same result", () => {
    let calls = 0;
    const input = { value: 2 };
    const double = memoizeLast((source: { value: number }, extra: string) => {
      calls++;
      return { doubled: source.value * 2, extra };
    });
    const first = double(input, "a");
    const second = double(input, "a");
    expect(calls).toBe(1);
    expect(second).toBe(first);
  });

  it("computes again when any argument changes, including an equal but different object", () => {
    let calls = 0;
    const read = memoizeLast((source: { value: number }) => {
      calls++;
      return source.value;
    });
    read({ value: 1 });
    read({ value: 1 });
    expect(calls).toBe(2);
  });

  it("keeps only the last result: going back to an earlier input recomputes", () => {
    let calls = 0;
    const a = { value: 1 };
    const b = { value: 2 };
    const read = memoizeLast((source: { value: number }) => {
      calls++;
      return source.value;
    });
    read(a);
    read(b);
    read(a);
    expect(calls).toBe(3);
  });
});
