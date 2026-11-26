// The style contract as pure functions (docs/architecture/cleanstack.md UXC-12): one token system owns motion and
// colour, and no layout-forcing property animates. Each violation is a string that names the rule, the file and the
// declaration, so a finding is specific and stable.

export interface StyleFile {
  readonly path: string;
  readonly text: string;
}

/** Files that define the tokens: the only place a duration, an easing or a colour may be written out. */
export const TOKEN_FILES: readonly string[] = ["src/interfaces/web/shared/tokens.css"];

const MOTION_PROPERTY = /^(?:transition|animation)(?:-duration|-delay|-timing-function)?$/;
// Zero is the reduced-motion value and `linear` is a constant rotation: neither is a design choice to tokenise.
const MOTION_LITERAL =
  /(?<![\w.-])(?:(?:\d*\.?\d*[1-9]\d*m?s|ease(?:-in|-out|-in-out)?)(?![\w-])|cubic-bezier\(|steps\()/;
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
// A vendor-prefixed property applies like its standard name, so the rules read it by that name.
const VENDOR_PREFIX = /^-(?:webkit|moz|ms|o)-/;
const KEYFRAMES = /^@(?:-(?:webkit|moz|ms|o)-)?keyframes\b/;
// The rebound easing overshoots its end. It belongs only to the bounded rebound of a selected chart mark, named in the
// same `animation` declaration; hover, press, arrivals and state changes settle without overshoot (FD-029, decision 5).
// The earlier name `--ease-spring` is retired.
const REBOUND_EASING = /var\(\s*--ease-(?:rebound|spring)\b/;
const RETIRED_EASING = /var\(\s*--ease-spring\b/;
const SELECTION_REBOUND = /(?<![\w-])[\w-]*selection-rebound(?![\w-])/;
// Properties that force layout of other elements when animated, in physical and logical spelling. Transform, opacity
// and paint-only properties are not listed.
const SIDE = "(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?";
const LAYOUT_PROPERTY = new RegExp(
  "(?<![\\w-])(?:" +
    [
      "(?:min-|max-)?(?:width|height|block-size|inline-size)",
      "top|left|right|bottom",
      `inset${SIDE}`,
      `margin${SIDE}`,
      `padding${SIDE}`,
      `border${SIDE}-width`,
      "(?:row-|column-)?gap",
      "flex-basis",
      "font-size|line-height",
      "grid-template-rows|grid-template-columns",
      "stroke-width",
      "all",
    ].join("|") +
    ")(?![\\w-])",
);

/**
 * A deliberate exception is written inside the block, directly above the declaration it covers:
 * `/* style-allow layout-motion: the reason *\/`. It covers that one declaration, needs a real reason, and is a
 * violation when nothing used it, so a waiver cannot outlive the code it excused. Only `layout-motion` can be
 * waived: a duration, an easing or a colour becomes a token instead.
 */
const WAIVER_COMMENT = /\/\*\s*style-allow\s+([a-z-]+)\s*:([\s\S]*?)\*\//g;
const WAIVER_PROPERTY = "--style-allow-";
const WAIVABLE = new Set(["layout-motion"]);
const MIN_REASON_LENGTH = 12;

const withoutVariables = (value: string): string => value.replace(/var\((?:[^()]|\([^()]*\))*\)/g, "");

/** Every declaration as [property, value, whether it sits inside @keyframes]. Waiver comments are kept as pseudo declarations. */
function declarations(source: string): [string, string, boolean][] {
  const text = source
    .replace(
      WAIVER_COMMENT,
      (_all, rule: string, reason: string) => ` ${WAIVER_PROPERTY}${rule}: ${reason.replace(/[{};]/g, " ").trim()};`,
    )
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const found: [string, string, boolean][] = [];
  const stack: string[] = [];
  let buffer = "";
  const take = (): void => {
    const match = /^([a-z-]+)\s*:\s*([\s\S]*)$/.exec(buffer.trim());
    if (match !== null) found.push([match[1] ?? "", match[2] ?? "", stack.some((s) => KEYFRAMES.test(s))]);
    buffer = "";
  };
  for (const character of text) {
    if (character === "{") {
      stack.push(buffer.trim());
      buffer = "";
    } else if (character === "}") {
      take();
      stack.pop();
    } else if (character === ";") take();
    else buffer += character;
  }
  return found;
}

/**
 * Rules: `motion-literal` (a duration or easing written out instead of a token), `raw-color` (a colour written out
 * instead of a token), `layout-motion` (a layout property transitioned or animated) and `rebound-easing` (the
 * overshooting easing used anywhere but a selected chart mark's rebound, or under its retired name), plus the waiver rules
 * `unknown-waiver`, `waiver-without-reason` and `unused-waiver`. A repeated identical declaration in one file gets a
 * numeric suffix, so a second copy is reported too.
 */
export function styleViolations(files: readonly StyleFile[]): string[] {
  const violations: string[] = [];
  for (const { path, text } of files) {
    if (!path.endsWith(".css") && !path.endsWith(".html")) continue;
    // A standalone page served without the app defines the tokens it uses in its own style block.
    const isTokenFile = TOKEN_FILES.includes(path) || path.endsWith(".html");
    const seen = new Map<string, number>();
    const pending = new Set<string>();
    const add = (rule: string, property: string, value: string): void => {
      const key = `${rule} ${path} ${property}: ${value.replace(/\s+/g, " ").trim().slice(0, 90)}`;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      violations.push(count === 1 ? key : `${key} #${String(count)}`);
    };
    const unused = (): void => {
      for (const rule of pending) add("unused-waiver", `${WAIVER_PROPERTY}${rule}`, rule);
      pending.clear();
    };
    for (const [property, value, inKeyframes] of declarations(text)) {
      if (property.startsWith(WAIVER_PROPERTY)) {
        const rule = property.slice(WAIVER_PROPERTY.length);
        if (!WAIVABLE.has(rule)) add("unknown-waiver", property, rule);
        else if (value.trim().length < MIN_REASON_LENGTH) add("waiver-without-reason", property, rule);
        else pending.add(rule);
        continue;
      }
      const bare = withoutVariables(value);
      const name = property.replace(VENDOR_PREFIX, "");
      // The token file may write values out, but only in the token definitions themselves.
      const definesToken = isTokenFile && property.startsWith("--");
      if (!definesToken && MOTION_PROPERTY.test(name) && MOTION_LITERAL.test(bare)) {
        add("motion-literal", property, value);
      }
      if (!definesToken && COLOR_LITERAL.test(bare)) add("raw-color", property, value);
      if (
        !definesToken &&
        REBOUND_EASING.test(value) &&
        (RETIRED_EASING.test(value) || name !== "animation" || !SELECTION_REBOUND.test(value))
      ) {
        add("rebound-easing", property, value);
      }
      const animated =
        name === "transition" || name === "transition-property" || name === "will-change"
          ? bare.replace(/\b(?:transform|opacity)\b/g, "")
          : inKeyframes && name !== "opacity" && name !== "transform"
            ? name
            : "";
      if (animated !== "" && LAYOUT_PROPERTY.test(animated)) {
        if (pending.has("layout-motion")) pending.delete("layout-motion");
        else add("layout-motion", property, value);
      }
      unused();
    }
    unused();
  }
  return violations.sort();
}

/** Custom properties defined in a stylesheet, first definition wins, with whitespace normalised. */
function definitions(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [property, value] of declarations(text)) {
    if (property.startsWith("--") && !found.has(property)) found.set(property, value.replace(/\s+/g, " ").trim());
  }
  return found;
}

/**
 * Rule `token-drift`: a standalone page that carries a shared token must give it the same value as the token file, so
 * there is still one token system (UXC-1). Page-only names, such as its own palette, are not compared.
 */
export function tokenDrift(pages: readonly StyleFile[], tokens: StyleFile): string[] {
  const shared = definitions(tokens.text);
  const problems: string[] = [];
  for (const page of pages) {
    for (const [name, value] of definitions(page.text)) {
      const expected = shared.get(name);
      if (expected !== undefined && expected !== value) {
        problems.push(`token-drift ${page.path} ${name}: ${value} differs from ${tokens.path} (${expected})`);
      }
    }
  }
  return problems.sort();
}
