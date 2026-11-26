import { describe, expect, it } from "vitest";
import { carriesMotion, motionOwnerProblems, ownerTablePaths } from "../../scripts/verify/code/motion-owners.ts";

const web = (path: string, text: string) => ({ path: `src/interfaces/web/${path}`, text });
const record = (...paths: string[]): string =>
  [
    "# Motion layer",
    "",
    "## Motion stylesheets and their owners (step 5)",
    "",
    "| Stylesheet | Motion it holds | Owner |",
    "|---|---|---|",
    ...paths.map((path) => `| \`${path}\` | something | [A record](a.md) |`),
    "",
    "## Proof",
    "",
    "| `elsewhere.css` | not part of the table | |",
  ].join("\n");

describe("carriesMotion", () => {
  it("finds transitions, animations and keyframes", () => {
    expect(carriesMotion(".a { transition: opacity var(--duration-short); }")).toBe(true);
    expect(carriesMotion(".a {\n  transition-timing-function: var(--ease-smooth);\n}")).toBe(true);
    expect(carriesMotion(".a { animation: none; }")).toBe(true);
    expect(carriesMotion("@keyframes rise { to { opacity: 1; } }")).toBe(true);
  });
  it("ignores comments and look-alike properties", () => {
    expect(carriesMotion("/* transition: opacity */ .a { color: var(--text); }")).toBe(false);
    expect(carriesMotion(".a { --motion-transition-gap: 0; view-transition-name: card; }")).toBe(false);
  });
});

describe("ownerTablePaths", () => {
  it("reads only the owner table's rows", () => {
    expect(ownerTablePaths(record("shared/a.css", "app/b.css"))).toEqual(["shared/a.css", "app/b.css"]);
  });
  it("finds nothing without the table", () => {
    expect(ownerTablePaths("# Motion layer\n")).toEqual([]);
  });
});

describe("motionOwnerProblems", () => {
  const tokens = ["src/interfaces/web/shared/tokens.css"];
  it("passes when every moving stylesheet has exactly one row", () => {
    const files = [
      web("shared/a.css", ".a { transition: opacity var(--duration-short); }"),
      web("app/still.css", ".a { color: var(--text); }"),
      web("shared/tokens.css", ":root { --duration-short: 180ms; }"),
    ];
    expect(motionOwnerProblems(files, record("shared/a.css"), tokens)).toEqual([]);
  });
  it("reports a moving stylesheet with no owner, such as a new polish layer", () => {
    const files = [
      web("shared/a.css", ".a { transition: opacity var(--duration-short); }"),
      web("shared/polish.css", ".a { transition-timing-function: var(--ease-smooth); }"),
    ];
    expect(motionOwnerProblems(files, record("shared/a.css"), tokens)).toEqual([
      "motion-owner-missing src/interfaces/web/shared/polish.css",
    ]);
  });
  it("reports a row whose stylesheet is gone or no longer moves", () => {
    const files = [web("shared/a.css", ".a { color: var(--text); }")];
    expect(motionOwnerProblems(files, record("shared/a.css", "shared/gone.css"), tokens)).toEqual([
      "motion-owner-stale src/interfaces/web/shared/a.css",
      "motion-owner-stale src/interfaces/web/shared/gone.css",
    ]);
  });
  it("reports a missing table rather than passing silently", () => {
    expect(motionOwnerProblems([], "# Motion layer\n", tokens)).toEqual([
      "motion-owner-table docs/design/motion-layer.md: no owner table found",
    ]);
  });
});
