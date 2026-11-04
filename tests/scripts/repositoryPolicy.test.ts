import { describe, expect, it } from "vitest";
import { allowedDependency, architectureProblems, pathProblems } from "../../scripts/repositoryPolicy";

const core = "src/core/Money.ts";
const app = "src/interfaces/web/app/App.tsx";
const feature = "src/interfaces/web/features/import/ImportView.tsx";
const otherFeature = "src/interfaces/web/features/history/HistoryView.tsx";
const adapter = "src/adapters/google/Rest.ts";
const application = "src/applications/ImportModel.ts";
const shared = "src/interfaces/web/shared/ui/icons.tsx";
const presentation = "src/interfaces/web/presentation/privacy/privacy.tsx";

describe("lean root and artifact policy", () => {
  it("accepts the current entry points and designated homes", () => {
    expect(pathProblems(["README.md", "AGENTS.md", ".gitignore", "package.json", "package-lock.json", "config/tsconfig.json", "docs/README.md", core, "scripts/build.ts", "tests/fixtures/Synthetic.ts", ".github/workflows/verify.yml"])).toEqual([]);
  });
  it.each(["NOTES.md", "tsconfig.json", "legacy/main.ts", "dist/app.js", "docs/export.xlsx", "tests/fixtures/account.csv", "config/.env.local", "src/.DS_Store", "config/.clasp.json", "docs/release.zip", "private/portfolio.json", "App Scripts/main.gs"])("rejects %s", (file) => {
    expect(pathProblems([file]).length).toBeGreaterThan(0);
  });
});

describe("filesystem compartments", () => {
  it.each(["docs/build.ts", "docs/notes.md", "config/screenshot.png", "scripts/NOTES.md", "tests/export.json", "src/adapters/Loose.ts", "src/core/NOTES.md"])("rejects misplaced content %s", (file) => {
    expect(pathProblems([file]).length).toBeGreaterThan(0);
  });
  it("rejects filenames that collide on case-insensitive filesystems", () => {
    expect(pathProblems(["src/core/Money.ts", "src/core/money.ts"]).join("\n")).toContain("case-colliding");
    expect(pathProblems(["src/core/Money.ts", "src/Core/Percent.ts"]).join("\n")).toContain("case-colliding");
  });
  it("accepts browser adapters and their adjacent tests", () => {
    expect(pathProblems(["src/adapters/browser/LedgerCache.ts", "src/adapters/browser/LedgerCache.test.ts"])).toEqual([]);
  });
});

describe("dependency law", () => {
  it.each([[app, feature], [app, adapter], [feature, application], [feature, presentation], [presentation, core], [presentation, shared], [application, core], [adapter, application], [core, "src/core/Ledger.ts"]])("allows %s -> %s", (from, to) => {
    expect(allowedDependency(from, to)).toBe(true);
  });
  it.each([[core, application], [application, adapter], [adapter, app], [feature, app], [feature, adapter], [feature, otherFeature], [shared, core], [shared, presentation], [app, "src/interfaces/server/main.ts"], [app, "src/adapters/appsscript/SheetsRowSheet.ts"]])("rejects %s -> %s", (from, to) => {
    expect(allowedDependency(from, to)).toBe(false);
  });
  it.each([
    'import type { X } from "../applications/ImportModel";',
    'export { X } from "../applications/ImportModel";',
    'const module = import("../applications/ImportModel");',
    'type X = import("../applications/ImportModel").X;',
    'const module = require("../applications/ImportModel");',
    'import X = require("../applications/ImportModel");',
  ])("checks every module syntax: %s", (text) => {
    expect(architectureProblems([{ file: core, text }, { file: application, text: "" }]).join("\n")).toContain("forbidden dependency");
  });
  it("rejects unresolved aliases, runtime packages in the kernel and nonliteral loading", () => {
    for (const text of ['import "@core/Money";', 'import "node:fs";', 'import "preact";', 'import(name);', 'import "./Absent";']) {
      expect(architectureProblems([{ file: core, text }]).length).toBeGreaterThan(0);
    }
  });
  it("accepts framework imports and existing local styles in web UI", () => {
    expect(architectureProblems([{ file: app, text: 'import "preact/hooks"; import "./app.css";' }, { file: "src/interfaces/web/app/app.css", text: "" }])).toEqual([]);
  });
  it("rejects production dependencies on tests, fixtures and unowned source", () => {
    for (const target of ["src/core/Money.test.ts", "tests/fixtures/Synthetic.ts", "src/misc.ts"]) {
      const spec = target === "tests/fixtures/Synthetic.ts" ? "../../tests/fixtures/Synthetic" : target === "src/misc.ts" ? "../misc" : "./Money.test";
      expect(architectureProblems([{ file: core, text: `import "${spec}";` }, { file: target, text: "" }]).length).toBeGreaterThan(0);
    }
  });
  it("detects cycles, including type-only and barrel dependencies", () => {
    expect(architectureProblems([{ file: core, text: 'import type { X } from "./Ledger";' }, { file: "src/core/Ledger.ts", text: 'export * from "./Money";' }]).join("\n")).toContain("dependency cycle");
  });
  it("lets adjacent tests cross layers without granting production the same permission", () => {
    expect(architectureProblems([{ file: "src/core/Money.test.ts", text: 'import "vitest"; import "../../tests/fixtures/Synthetic";' }])).toEqual([]);
  });
});

it("rejects browser-to-server dependencies hidden behind an intermediate adapter", () => {
  expect(architectureProblems([
    { file: app, text: 'import "../../../adapters/google/Rest";' },
    { file: adapter, text: 'import "../appsscript/SheetsRowSheet";' },
    { file: "src/adapters/appsscript/SheetsRowSheet.ts", text: "" },
  ]).join("\n")).toContain("Browser dependency reaches forbidden environment");
});

it("rejects server-to-browser dependencies hidden behind an intermediate adapter", () => {
  expect(architectureProblems([
    { file: "src/interfaces/server/main.ts", text: 'import "../../adapters/google/Rest";' },
    { file: adapter, text: 'import "../browser/GoogleIdentity";' },
    { file: "src/adapters/browser/GoogleIdentity.ts", text: "" },
  ]).join("\n")).toContain("Server dependency reaches forbidden environment");
});
