import { describe, expect, it } from "vitest";
import { TOKEN_FILES, styleViolations } from "../../scripts/verify/code/style-policy";

const sheet = (text: string, path = "src/interfaces/web/app/styles/example.css") => [{ path, text }];
const rules = (text: string, path?: string): string[] =>
  styleViolations(sheet(text, path)).map((violation) => violation.split(" ")[0] ?? "");

describe("motion values", () => {
  it("accepts durations and easings that come from tokens", () => {
    expect(rules(".a { transition: opacity var(--duration-short) var(--ease-standard); }")).toEqual([]);
    expect(rules(".a { animation: busy-turn var(--duration-busy) linear infinite; }")).toEqual([]);
  });
  it("accepts zero, which is how reduced motion switches an animation off", () => {
    expect(rules(".a { transition-duration: 0s; animation-duration: 0ms; }")).toEqual([]);
  });
  it.each([
    ".a { transition: opacity 180ms ease; }",
    ".a { transition-duration: 0.2s; }",
    ".a { animation: fade 1s; }",
    ".a { transition-timing-function: cubic-bezier(0.2, 0, 0, 1); }",
    ".a { transition: opacity var(--duration-short) ease-in-out; }",
  ])("reports a literal in %s", (css) => {
    expect(rules(css)).toEqual(["motion-literal"]);
  });
  it("is allowed in the token file, and only there", () => {
    const css = ":root { --duration-short: 180ms; --ease-standard: cubic-bezier(0.2, 0, 0, 1); }";
    expect(rules(css, TOKEN_FILES[0])).toEqual([]);
  });
});

describe("colours", () => {
  it("accepts tokens and mixes of tokens", () => {
    expect(rules(".a { color: var(--text); background: color-mix(in srgb, var(--a) 40%, transparent); }")).toEqual([]);
  });
  it.each([
    ".a { color: #fff; }",
    ".a { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2); }",
    ".a { --tint: #ff9500; }",
    ".a { color: hsl(10 20% 30%); }",
  ])("reports a raw colour in %s", (css) => {
    expect(rules(css)).toEqual(["raw-color"]);
  });
  it("is allowed in the token file", () => {
    expect(rules(":root { --surface: #ffffff; }", TOKEN_FILES[0])).toEqual([]);
  });
});

describe("animated properties", () => {
  it("accepts transform and opacity", () => {
    expect(rules(".a { transition: transform var(--duration-press), opacity var(--duration-short); }")).toEqual([]);
    expect(rules("@keyframes pop { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; } }")).toEqual([]);
  });
  it.each([
    ".a { transition: width var(--duration-short); }",
    ".a { transition: all var(--duration-short); }",
    ".a { transition: grid-template-rows var(--duration-medium); }",
    ".a { transition-property: height; }",
    ".a { will-change: top; }",
  ])("reports a layout property in %s", (css) => {
    expect(rules(css)).toEqual(["layout-motion"]);
  });
  it("reports each layout declaration inside keyframes", () => {
    expect(rules("@keyframes grow { from { height: 0; } to { height: 10px; } }")).toEqual([
      "layout-motion",
      "layout-motion",
    ]);
  });
  it("does not mind a layout property that is not animated", () => {
    expect(rules(".a { width: 10px; margin: 0 auto; }")).toEqual([]);
  });
  it("reads a transition split over several lines", () => {
    const css = ".a {\n  transition:\n    transform var(--duration-press),\n    width var(--duration-short);\n}";
    expect(rules(css)).toEqual(["layout-motion"]);
  });
});

describe("bookkeeping", () => {
  it("ignores comments and non-CSS files", () => {
    expect(rules("/* transition: width 1s; color: #fff; */ .a { color: var(--text); }")).toEqual([]);
    expect(styleViolations([{ path: "src/x.ts", text: "color: #fff; transition: all 1s;" }])).toEqual([]);
  });
  it("numbers a repeated identical declaration so a second copy is a new violation", () => {
    const css = ".a { color: #fff; } .b { color: #fff; }";
    expect(styleViolations(sheet(css)).map((v) => v.endsWith("#2"))).toEqual([false, true]);
  });
});

describe("waivers", () => {
  const waived = (declaration: string, rule = "layout-motion", reason = "the bar grows to its completion"): string =>
    `.a {\n  /* style-allow ${rule}: ${reason} */\n  ${declaration}\n}`;

  it("lets a reasoned waiver cover the declaration directly below it", () => {
    expect(rules(waived("transition: width var(--duration-short);"))).toEqual([]);
    expect(
      rules(waived("transition:\n    transform var(--duration-press),\n    width var(--duration-short);")),
    ).toEqual([]);
  });

  it("covers that one declaration and no other", () => {
    const css =
      ".a {\n  /* style-allow layout-motion: the bar grows to its completion */\n  transition: width var(--duration-short);\n  transition: height var(--duration-short);\n}";
    expect(rules(css)).toEqual(["layout-motion"]);
  });

  it("does not accept a waiver with no real reason, and still reports the declaration", () => {
    expect(rules(waived("transition: width var(--duration-short);", "layout-motion", "ok")).sort()).toEqual([
      "layout-motion",
      "waiver-without-reason",
    ]);
  });

  it("does not accept a waiver for a rule that cannot be waived, so a colour still becomes a token", () => {
    expect(rules(waived("color: #fff;", "raw-color", "brand colour of the mark")).sort()).toEqual([
      "raw-color",
      "unknown-waiver",
    ]);
  });

  it("reports a waiver that nothing used, so it cannot outlive the code it excused", () => {
    expect(rules(waived("transition: opacity var(--duration-short);"))).toEqual(["unused-waiver"]);
    expect(
      rules(".a {\n  color: var(--text);\n  /* style-allow layout-motion: the bar grows to its completion */\n}"),
    ).toEqual(["unused-waiver"]);
  });
});
