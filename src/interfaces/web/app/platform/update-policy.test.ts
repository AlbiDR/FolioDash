import { expect, it } from "vitest";
import { FRESH_LAUNCH_MILLISECONDS, mayApplyUpdateQuietly } from "./update-policy";

const moment = { locked: false, hidden: false, millisecondsSinceLoad: 60_000, interacted: true };

it("never swaps the page while an import or expense draft is open", () => {
  expect(mayApplyUpdateQuietly({ ...moment, locked: true, hidden: true })).toBe(false);
  expect(mayApplyUpdateQuietly({ ...moment, locked: true, millisecondsSinceLoad: 0, interacted: false })).toBe(false);
});

it("swaps a page nobody can see", () => {
  expect(mayApplyUpdateQuietly({ ...moment, hidden: true })).toBe(true);
});

it("swaps a page just opened and not yet touched, but not one in use", () => {
  expect(mayApplyUpdateQuietly({ ...moment, millisecondsSinceLoad: 1_000, interacted: false })).toBe(true);
  expect(mayApplyUpdateQuietly({ ...moment, millisecondsSinceLoad: 1_000, interacted: true })).toBe(false);
  expect(
    mayApplyUpdateQuietly({ ...moment, millisecondsSinceLoad: FRESH_LAUNCH_MILLISECONDS + 1, interacted: false }),
  ).toBe(false);
});
