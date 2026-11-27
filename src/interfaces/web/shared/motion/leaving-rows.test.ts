import { expect, it } from "vitest";
import { mergeLeaving } from "./leaving-rows";

const key = (item: string) => item;
const none = new Map();

it("draws only the current items when nothing has left", () => {
  const { rows, ghosts } = mergeLeaving(["a", "b"], ["a", "b"], key, none, true);
  expect(rows).toEqual([
    { item: "a", leaving: false },
    { item: "b", leaving: false },
  ]);
  expect(ghosts.size).toBe(0);
});

it("keeps an item that has left at the place it held, marked as leaving", () => {
  const { rows } = mergeLeaving(["a", "c"], ["a", "b", "c"], key, none, true);
  expect(rows.map((row) => [row.item, row.leaving])).toEqual([
    ["a", false],
    ["b", true],
    ["c", false],
  ]);
});

it("keeps several leaving items in their old order and clamps one whose place no longer exists", () => {
  const { rows } = mergeLeaving(["a"], ["a", "b", "c"], key, none, true);
  expect(rows.map((row) => row.item)).toEqual(["a", "b", "c"]);
  expect(rows.filter((row) => row.leaving).length).toBe(2);
});

it("carries a leaving item through later renders until it is dropped, and releases it if it returns", () => {
  const first = mergeLeaving(["a"], ["a", "b"], key, none, true);
  const again = mergeLeaving(["a"], ["a", "b"], key, first.ghosts, true);
  expect(again.rows.map((row) => row.item)).toEqual(["a", "b"]);
  const back = mergeLeaving(["a", "b"], ["a", "b"], key, again.ghosts, true);
  expect(back.rows.every((row) => !row.leaving)).toBe(true);
  expect(back.ghosts.size).toBe(0);
});

it("drops items at once when motion is not retained", () => {
  const { rows } = mergeLeaving(["a"], ["a", "b"], key, none, false);
  expect(rows).toEqual([{ item: "a", leaving: false }]);
});
