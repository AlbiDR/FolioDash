// The style contract as pure functions (docs/architecture/cleanstack.md UXC-1): one token system owns motion and
// colour, and only cheap properties animate. Each violation is a string, so a list can be held by a ratchet.

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
// Properties that force layout or paint of other elements when animated; transform and opacity are cheap.
const LAYOUT_PROPERTY =
  /(?<![\w-])(?:width|height|min-width|max-width|min-height|max-height|top|left|right|bottom|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|font-size|line-height|gap|inset|border-width|grid-template-rows|grid-template-columns|stroke-width|all)(?![\w-])/;

const withoutVariables = (value: string): string => value.replace(/var\((?:[^()]|\([^()]*\))*\)/g, "");

/** Every declaration as [property, value, whether it sits inside @keyframes]; comments are removed first. */
function declarations(text: string): [string, string, boolean][] {
  const found: [string, string, boolean][] = [];
  const stack: string[] = [];
  let buffer = "";
  for (const character of text.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (character === "{") {
      stack.push(buffer.trim());
      buffer = "";
    } else if (character === "}") {
      const last = buffer.trim();
      const match = /^([a-z-]+)\s*:\s*([\s\S]*)$/.exec(last);
      if (match !== null) found.push([match[1] ?? "", match[2] ?? "", stack.some((s) => s.startsWith("@keyframes"))]);
      stack.pop();
      buffer = "";
    } else if (character === ";") {
      const match = /^([a-z-]+)\s*:\s*([\s\S]*)$/.exec(buffer.trim());
      if (match !== null) found.push([match[1] ?? "", match[2] ?? "", stack.some((s) => s.startsWith("@keyframes"))]);
      buffer = "";
    } else buffer += character;
  }
  return found;
}

/**
 * Rules: `motion-literal` (a duration or easing written out instead of a token), `raw-color` (a colour written out
 * instead of a token) and `layout-motion` (a layout property transitioned or animated). A repeated identical
 * declaration in one file gets a numeric suffix so a second copy is a new violation.
 */
export function styleViolations(files: readonly StyleFile[]): string[] {
  const violations: string[] = [];
  for (const { path, text } of files) {
    if (!path.endsWith(".css")) continue;
    const isTokenFile = TOKEN_FILES.includes(path);
    const seen = new Map<string, number>();
    const add = (rule: string, property: string, value: string): void => {
      const key = `${rule} ${path} ${property}: ${value.replace(/\s+/g, " ").trim().slice(0, 90)}`;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      violations.push(count === 1 ? key : `${key} #${String(count)}`);
    };
    for (const [property, value, inKeyframes] of declarations(text)) {
      const bare = withoutVariables(value);
      if (!isTokenFile && MOTION_PROPERTY.test(property) && MOTION_LITERAL.test(bare))
        add("motion-literal", property, value);
      if (!isTokenFile && COLOR_LITERAL.test(bare)) add("raw-color", property, value);
      const animated =
        property === "transition" || property === "transition-property" || property === "will-change"
          ? bare.replace(/\b(?:transform|opacity)\b/g, "")
          : inKeyframes && property !== "opacity" && property !== "transform"
            ? property
            : "";
      if (animated !== "" && LAYOUT_PROPERTY.test(animated)) add("layout-motion", property, value);
    }
  }
  return violations.sort();
}
