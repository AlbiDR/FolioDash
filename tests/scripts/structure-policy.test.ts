import { describe, expect, it } from "vitest";
import { structureViolations, type StructureOptions } from "../../scripts/verify/code/structure-policy";

const options: StructureOptions = {
  codeExtensions: [".ts", ".tsx", ".css"],
  namedAreas: ["src"],
  maxLinesPerFile: 400,
  maxCodeFilesPerDirectory: 3,
};
const file = (path: string, lines = 10): { path: string; lines: number } => ({ path, lines });

describe("file names", () => {
  it.each([
    "src/core/money.ts",
    "src/core/money-format.ts",
    "src/core/sha256.ts",
    "src/core/money.test.ts",
    "src/web/app/index.tsx",
    "config/vite.acceptance.config.ts",
    "src/core/types.d.ts",
  ])("accepts %s", (path) => {
    expect(structureViolations([file(path)], options)).toEqual([]);
  });
  it.each([
    "src/core/Money.ts",
    "src/core/moneyFormat.ts",
    "src/core/money_format.ts",
    "src/core/money-.ts",
    "src/core/2money.ts",
    "src/core/Money.test.ts",
  ])("rejects %s", (path) => {
    expect(structureViolations([file(path)], options)).toEqual([`file-name ${path}`]);
  });
});

describe("directory names", () => {
  it("rejects a directory that is not kebab-case once, however many files it holds", () => {
    const violations = structureViolations(
      [file("src/web/serviceWorker/a.ts"), file("src/web/serviceWorker/b.ts")],
      options,
    );
    expect(violations).toEqual(["directory-name src/web/serviceWorker"]);
  });
  it("accepts nested kebab-case directories", () => {
    expect(structureViolations([file("src/web/service-worker/a.ts")], options)).toEqual([]);
  });
});

describe("size limits", () => {
  it("rejects a file over the line limit but not one at the limit", () => {
    expect(structureViolations([file("src/a.ts", 400), file("src/b.ts", 401)], options)).toEqual([
      "max-lines src/b.ts",
    ]);
  });
  it("rejects a directory with more code files than the limit, counting only direct children", () => {
    const direct = ["a", "b", "c", "d"].map((name) => file(`src/core/${name}.ts`));
    expect(structureViolations([...direct, file("src/core/deep/e.ts")], options)).toEqual(["max-files src/core"]);
  });
});
