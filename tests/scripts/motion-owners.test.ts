import { describe, expect, it } from "vitest";
import {
  carriesMotion,
  motionOwnerProblems,
  ownerTablePaths,
  ownerTableRows,
} from "../../scripts/verify/code/motion-owners.ts";

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
  it("finds vendor-prefixed motion, entry styles and a redefined motion token", () => {
    expect(carriesMotion(".a { -webkit-transition: opacity var(--duration-short); }")).toBe(true);
    expect(carriesMotion(".a { -webkit-animation: busy-turn var(--duration-busy) linear infinite; }")).toBe(true);
    expect(carriesMotion("@-webkit-keyframes pulse { to { opacity: 0.5; } }")).toBe(true);
    expect(carriesMotion("@starting-style { .card { translate: 0 var(--motion-rise); } }")).toBe(true);
    expect(carriesMotion(".card { --duration-feedback: var(--time-layer); }")).toBe(true);
  });
  it("lets the token file define motion tokens, but still counts its other motion", () => {
    expect(carriesMotion(":root { --time-state: 180ms; --ease-settle: cubic-bezier(0.22, 1, 0.36, 1); }", true)).toBe(
      false,
    );
    expect(carriesMotion(":root { --time-state: 180ms; } .a { transition: opacity var(--time-state); }", true)).toBe(
      true,
    );
  });
  it("is not hidden or faked by strings", () => {
    expect(carriesMotion('.a::before { content: "/*"; }\n.a { transition: opacity var(--duration-short); }')).toBe(
      true,
    );
    expect(carriesMotion('.a::after { content: " transition: none"; }')).toBe(false);
    expect(carriesMotion('.a::after { content: "@keyframes"; }')).toBe(false);
  });
  it("ignores comments and look-alike properties", () => {
    expect(carriesMotion("/* transition: opacity */ .a { color: var(--text); }")).toBe(false);
    expect(carriesMotion(".a { --gap-transition: 0; view-transition-name: card; }")).toBe(false);
  });
});

describe("ownerTablePaths", () => {
  it("reads only the owner table's rows", () => {
    expect(ownerTablePaths(record("shared/a.css", "app/b.css"))).toEqual(["shared/a.css", "app/b.css"]);
  });
  it("reads page styles and owners, and skips rows inside an HTML comment", () => {
    const text = record("shared/a.css").replace(
      "\n\n## Proof",
      "\n| `public/page/index.html` | page links | [Page](page.md) |\n<!--\n| `shared/old.css` | gone | [Old](old.md) |\n-->\n\n## Proof",
    );
    expect(ownerTableRows(text)).toEqual([
      { path: "shared/a.css", owner: "[A record](a.md)" },
      { path: "public/page/index.html", owner: "[Page](page.md)" },
    ]);
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
  it("reports a stylesheet with two rows, and a row with no owner", () => {
    const files = [
      web("shared/a.css", ".a { transition: opacity var(--duration-short); }"),
      web("shared/b.css", ".b { transition: opacity var(--duration-short); }"),
    ];
    const text = record("shared/a.css", "shared/a.css", "shared/b.css").replace(
      "| `shared/b.css` | something | [A record](a.md) |",
      "| `shared/b.css` | something | |",
    );
    expect(motionOwnerProblems(files, text, tokens)).toEqual([
      "motion-owner-duplicate src/interfaces/web/shared/a.css: 2 rows",
      "motion-owner-unowned src/interfaces/web/shared/b.css",
    ]);
  });
  it("needs a row for the token file only when motion beyond its definitions is written into it", () => {
    const quiet = [web("shared/tokens.css", ":root { --time-state: 180ms; }")];
    expect(motionOwnerProblems(quiet, record("shared/a.css").replace("shared/a.css", "x.css"), tokens)).toEqual([
      "motion-owner-stale src/interfaces/web/x.css",
    ]);
    const moving = [web("shared/tokens.css", ":root { --time-state: 180ms; } .a { transition: opacity 1s; }")];
    expect(motionOwnerProblems(moving, record("x.css"), tokens)).toEqual([
      "motion-owner-missing src/interfaces/web/shared/tokens.css",
      "motion-owner-stale src/interfaces/web/x.css",
    ]);
  });
  it("reports a missing table rather than passing silently", () => {
    expect(motionOwnerProblems([], "# Motion layer\n", tokens)).toEqual([
      "motion-owner-table docs/design/motion-layer.md: no owner table found",
    ]);
  });
});
