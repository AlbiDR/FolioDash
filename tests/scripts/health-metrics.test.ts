import { describe, expect, it } from "vitest";
import { countRuleIds, healthMetrics, percentile95 } from "../../scripts/lib/health-metrics";

const lines = (count: number): string => "x\n".repeat(count);

describe("percentile95", () => {
  it("is the nearest-rank value, and zero for nothing", () => {
    expect(percentile95([])).toBe(0);
    expect(percentile95([7])).toBe(7);
    expect(percentile95(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(95);
    expect(percentile95([5, 1, 3])).toBe(5);
  });
});

describe("rule IDs", () => {
  it("counts IDs at the start of a list item and not in running text", () => {
    const adr = "1. **PRN-1 First:** a\n- **ARC-1** b\n- **ARC-2** c\nSee **PRN-9** here.\n";
    expect(countRuleIds(adr)).toBe(3);
  });
});

describe("healthMetrics", () => {
  const sources: Record<string, string> = {
    "src/a.ts": lines(10),
    "src/big.ts": lines(450),
    "src/ui/x.css": lines(5),
    "tests/t.test.ts": lines(3),
    "scripts/s.ts": lines(2),
    "docs/architecture/cleanstack.md": "- **ARC-1** r\n- **ARC-2** r\n",
    "docs/README.md": "# docs\n",
    "README.md": "# r\n",
    "package.json": JSON.stringify({
      scripts: { verify: "npm run a && npm run b && npm test", a: "x", b: "y" },
      dependencies: { preact: "1.0.0" },
      devDependencies: { vitest: "5.0.0", prettier: "3.0.0" },
    }),
  };
  const health = healthMetrics(Object.keys(sources), (path) => sources[path] ?? null);

  it("measures code, tests, documents and the root", () => {
    expect(health.rootEntries).toBe(6);
    expect(health.code).toMatchObject({ files: 5, lines: 470, over400: 1, crowdedFolders: 0 });
    expect(health.code.largest).toEqual({ path: "src/big.ts", lines: 450 });
    expect(health.tests.files).toBe(1);
    expect(health.docs).toEqual({ documents: 2, ruleIds: 2 });
  });

  it("counts dependencies and the checks that make up verify", () => {
    expect(health.dependencies).toEqual({ production: 1, development: 2 });
    expect(health.checks).toEqual({ verifySteps: 3, npmScripts: 3 });
  });

  it("finds a folder with too many code files", () => {
    const many = Array.from({ length: 21 }, (_, i) => `src/crowd/f${String(i)}.ts`);
    const crowded = healthMetrics([...many, "package.json"], (path) => (path === "package.json" ? "{}" : lines(1)));
    expect(crowded.code.crowdedFolders).toBe(1);
    expect(crowded.code.largestFolder).toEqual({ path: "src/crowd", files: 21 });
  });
});
