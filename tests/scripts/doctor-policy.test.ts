import { describe, expect, it } from "vitest";
import { driftFindings, isAtLeast, minimumOf, nodeFinding, parseVersion } from "../../scripts/setup/doctor-policy";

describe("versions", () => {
  it("reads three numbers, with or without a leading v, and nothing else", () => {
    expect(parseVersion("v26.13.1")).toEqual([26, 13, 1]);
    expect(parseVersion("22.18.0")).toEqual([22, 18, 0]);
    expect(parseVersion("lts")).toBeNull();
  });

  it("reads the minimum of an engines range and rejects a shape it does not know", () => {
    expect(minimumOf(">=22.18.0")).toBe("22.18.0");
    expect(minimumOf(">= 22.18.0")).toBe("22.18.0");
    expect(minimumOf("^22")).toBeNull();
  });

  it.each([
    ["22.18.0", "22.18.0", true],
    ["22.18.1", "22.18.0", true],
    ["23.0.0", "22.18.0", true],
    ["22.17.9", "22.18.0", false],
    ["21.99.99", "22.18.0", false],
    ["nonsense", "22.18.0", false],
  ])("compares %s with the minimum %s", (version, minimum, expected) => {
    expect(isAtLeast(version, minimum)).toBe(expected);
  });
});

describe("the Node finding", () => {
  it("fails below the minimum and names both versions", () => {
    const finding = nodeFinding("v20.11.0", ">=22.18.0", 22);
    expect(finding.level).toBe("fail");
    expect(finding.detail).toContain("22.18.0");
  });

  it("passes on the release CI runs and on a newer one, saying which", () => {
    const onCi = nodeFinding("v22.20.0", ">=22.18.0", 22);
    expect(onCi.level).toBe("pass");
    expect(onCi.detail).toContain("the release CI runs");
    expect(nodeFinding("v26.13.1", ">=22.18.0", 22).detail).toContain("CI runs 22");
  });

  it("warns when the engines range is not one it understands", () => {
    expect(nodeFinding("v22.20.0", "^22", 22).level).toBe("warn");
  });
});

describe("installed packages against their pins", () => {
  const installed = (versions: Record<string, string>) => (name: string) => versions[name] ?? null;

  it("accepts a pinned package at exactly its version and a ranged one at any version", () => {
    expect(
      driftFindings({ prettier: "3.9.10", vitest: "^5.0.5" }, installed({ prettier: "3.9.10", vitest: "5.1.0" })),
    ).toEqual([]);
  });

  it("fails a pinned package that has drifted, which is how a runner moved to a new release unnoticed", () => {
    const problems = driftFindings({ "@vitest/coverage-v8": "5.0.5" }, installed({ "@vitest/coverage-v8": "5.1.0" }));
    expect(problems).toEqual([
      { level: "fail", name: "@vitest/coverage-v8", detail: "pinned to 5.0.5 but 5.1.0 is installed; run npm ci" },
    ]);
  });

  it("fails a declared package that is not installed", () => {
    expect(driftFindings({ preact: "^11.1.1" }, installed({}))[0]?.detail).toContain("not installed");
  });
});
