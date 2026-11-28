import { expect, it } from "vitest";
import { updateSeen } from "./update-notice";

const storeWith = (initial: string | null) => {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
};

it("says nothing on the first start and remembers the build", () => {
  const store = storeWith(null);
  expect(updateSeen(() => store, "abc1234")).toBeNull();
  expect(store.getItem()).toBe("abc1234");
});

it("reports the previous build once after a change, then stays quiet", () => {
  const store = storeWith("abc1234");
  expect(updateSeen(() => store, "def5678")).toBe("abc1234");
  expect(updateSeen(() => store, "def5678")).toBeNull();
});

it("survives a store that cannot be used", () => {
  const broken = () => {
    throw new Error("blocked");
  };
  expect(updateSeen(broken, "abc1234")).toBeNull();
});
