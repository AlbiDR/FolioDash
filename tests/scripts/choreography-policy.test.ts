import { describe, expect, it } from "vitest";
import { choreographyProblems, loweredCeilings } from "../../scripts/audit/choreography-policy.ts";

const arrival = (kinds: number, elements: number, settle: number, loops = 0) => ({ kinds, elements, settle, loops });

describe("choreographyProblems", () => {
  it("passes at or below every ceiling", () => {
    const ceilings = { "overview:open": arrival(34, 60, 1400, 1) };
    expect(choreographyProblems({ "overview:open": arrival(34, 60, 1400, 1) }, ceilings)).toEqual([]);
    expect(choreographyProblems({ "overview:open": arrival(12, 20, 700, 0) }, ceilings)).toEqual([]);
  });
  it("reports each measure that rose, naming the case and both values", () => {
    const ceilings = { "overview:open": arrival(34, 60, 1400, 0) };
    expect(choreographyProblems({ "overview:open": arrival(35, 60, 1500, 1) }, ceilings)).toEqual([
      "choreography-kinds overview:open: 35 > 34",
      "choreography-settle overview:open: 1500 > 1400",
      "choreography-loops overview:open: 1 > 0",
    ]);
  });
  it("reports a measured case with no ceiling and a ceiling with no case", () => {
    expect(
      choreographyProblems({ "months:enter": arrival(5, 5, 500) }, { "history:enter": arrival(4, 4, 400) }),
    ).toEqual(["choreography-unrecorded months:enter", "choreography-unmeasured history:enter"]);
  });
});

describe("malformed ceilings", () => {
  it("reports a missing or misspelled measure instead of silently skipping it", () => {
    const ceilings = { "months:open": { kinds: 9, element: 700, settle: 835 } } as unknown as Parameters<
      typeof choreographyProblems
    >[1];
    expect(choreographyProblems({ "months:open": arrival(9, 900, 5000, 3) }, ceilings)).toEqual([
      "choreography-invalid months:open: elements",
      "choreography-invalid months:open: loops",
      "choreography-settle months:open: 5000 > 835",
    ]);
  });
  it("never records NaN or null for a malformed measure", () => {
    const ceilings = { "months:open": { kinds: 9, elements: Number.NaN, settle: 835, loops: 0 } };
    expect(loweredCeilings({ "months:open": arrival(9, 600, 800, 0) }, ceilings)).toEqual({
      "months:open": arrival(9, 600, 800, 0),
    });
  });
});

describe("loweredCeilings", () => {
  it("lowers each measure independently and never raises one", () => {
    const ceilings = { "overview:open": arrival(34, 60, 1400, 1) };
    expect(loweredCeilings({ "overview:open": arrival(30, 70, 1200, 2) }, ceilings)).toEqual({
      "overview:open": arrival(30, 60, 1200, 1),
    });
  });
  it("records a new case at its measurement and drops a case that no longer runs", () => {
    expect(loweredCeilings({ "months:enter": arrival(5, 6, 500) }, { "history:enter": arrival(4, 4, 400) })).toEqual({
      "months:enter": arrival(5, 6, 500),
    });
  });
});
