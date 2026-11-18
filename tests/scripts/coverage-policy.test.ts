import { describe, expect, it } from "vitest";
import {
  areaOf,
  coverageByArea,
  coverageProblems,
  raisedFloors,
  type FileCoverage,
} from "../../scripts/verify/code/coverage-policy";

const file = (lines: [number, number], branches: [number, number]): FileCoverage => ({
  lines: { total: lines[0], covered: lines[1] },
  branches: { total: branches[0], covered: branches[1] },
});

describe("areas", () => {
  it("groups source by its first two folders, and web code by four", () => {
    expect(areaOf("src/core/values/money.ts")).toBe("src/core");
    expect(areaOf("src/adapters/google/rest.ts")).toBe("src/adapters");
    expect(areaOf("src/interfaces/web/features/overview/view.tsx")).toBe("src/interfaces/web/features");
    expect(areaOf("src/interfaces/server/main.ts")).toBe("src/interfaces/server");
  });
});

describe("measurement", () => {
  it("sums counts across an area's files and rounds down to a tenth", () => {
    const measured = coverageByArea({
      "src/core/a.ts": file([10, 9], [4, 2]),
      "src/core/b.ts": file([10, 10], [0, 0]),
      "src/applications/c.ts": file([3, 1], [0, 0]),
    });
    expect(measured["src/core"]).toEqual({ lines: 95, branches: 50 });
    expect(measured["src/applications"]).toEqual({ lines: 33.3, branches: 100 });
  });
});

describe("ratchet", () => {
  const floors = { "src/core": { lines: 90, branches: 80 } };
  it("accepts measurements at or above the floor", () => {
    expect(coverageProblems({ "src/core": { lines: 90, branches: 85 } }, floors)).toEqual([]);
  });
  it("reports a drop in lines or in branches", () => {
    const problems = coverageProblems({ "src/core": { lines: 89.9, branches: 79.9 } }, floors);
    expect(problems).toEqual([
      "src/core: lines coverage 89.9% is below the floor 90.0%",
      "src/core: branches coverage 79.9% is below the floor 80.0%",
    ]);
  });
  it("reports an area without a floor and a floor without an area", () => {
    const problems = coverageProblems({ "src/new": { lines: 100, branches: 100 } }, floors);
    expect(problems.some((p) => p.startsWith("src/new: no coverage floor"))).toBe(true);
    expect(problems).toContain("src/core: has a coverage floor but no measured files");
  });
  it("raises a floor to a higher measurement and never lowers one", () => {
    const raised = raisedFloors(
      { "src/core": { lines: 95, branches: 70 }, "src/new": { lines: 50, branches: 40 } },
      floors,
    );
    expect(raised["src/core"]).toEqual({ lines: 95, branches: 80 });
    expect(raised["src/new"]).toEqual({ lines: 50, branches: 40 });
  });
});
