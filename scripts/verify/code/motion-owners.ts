// The motion owner table as pure functions (docs/design/motion-layer.md, docs/design/polished-by-default.md phase 1).
// Every stylesheet that carries motion has exactly one owner listed in the motion layer's table, and the table lists
// nothing that no longer moves. Polish written as a new, unlisted layer was how a large share of tuned motion ended up
// overridden and never seen.

import type { StyleFile } from "./style-policy.ts";

/** Where motion may be written (decision 7): the role owners, control feedback, the chart owner and standalone pages,
 * which carry the tokens they use. A feature or page stylesheet gets its motion from these, never writes its own. */
export const MOTION_LOCATIONS: readonly string[] = [
  "src/interfaces/web/shared/ui/motion/",
  "src/interfaces/web/shared/ui/control-feedback.css",
  "src/interfaces/web/presentation/charts/chart-arrival.css",
  "src/interfaces/web/public/",
];

/** The design record whose table names each motion stylesheet's owner. */
export const MOTION_OWNER_RECORD = "docs/design/motion-layer.md";
const TABLE_HEADING = "## Motion stylesheets and their owners";
/** Table paths are written relative to the web interface, as the rest of that record writes them. */
const WEB_ROOT = "src/interfaces/web/";

const PREFIX = "(?:-(?:webkit|moz|ms|o)-)?";
// A transition or animation declaration, with or without a vendor prefix, in any longhand.
const MOTION_DECLARATION = new RegExp(`(?:^|[{;\\s])${PREFIX}(?:transition|animation)(?:-[a-z-]+)?\\s*:`);
// Keyframes, and the entry styles that start a transition when an element appears.
const MOTION_AT_RULE = new RegExp(`@(?:${PREFIX}keyframes|starting-style)\\b`);
// Redefining a motion token retimes or rescales every transition that reads it.
const MOTION_TOKEN = /(?:^|[{;\s])--(?:time|ease|duration|motion)-[\w-]*\s*:/;

/** Code without comments, and with each string's contents removed, so neither can hide or fake a declaration. */
export function cssCode(text: string): string {
  let code = "";
  let index = 0;
  while (index < text.length) {
    const character = text[index] ?? "";
    if (character === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 2;
      code += " ";
    } else if (character === '"' || character === "'") {
      let end = index + 1;
      while (end < text.length && text[end] !== character) end += text[end] === "\\" ? 2 : 1;
      code += `${character}${character}`;
      index = end + 1;
    } else {
      code += character;
      index++;
    }
  }
  return code;
}

/** Whether a stylesheet declares a transition or an animation, defines keyframes or entry styles, or redefines a
 * motion token. The token file defines those tokens, so only its other motion counts. Comments and strings do not. */
export function carriesMotion(text: string, definesTokens = false): boolean {
  const code = cssCode(text);
  return MOTION_AT_RULE.test(code) || MOTION_DECLARATION.test(code) || (!definesTokens && MOTION_TOKEN.test(code));
}

interface OwnerRow {
  readonly path: string;
  readonly owner: string;
}

/** The owner table's rows: each stylesheet path, relative to the web interface, and its owner cell. HTML comments are
 * not part of the table. */
export function ownerTableRows(record: string): OwnerRow[] {
  const start = record.indexOf(TABLE_HEADING);
  if (start < 0) return [];
  const rest = record.slice(start + TABLE_HEADING.length);
  const end = rest.search(/\n## /);
  const section = (end < 0 ? rest : rest.slice(0, end)).replace(/<!--[\s\S]*?-->/g, "");
  return [...section.matchAll(/^\| `([^`]+\.(?:css|html))` \|(.*)\|\s*$/gm)].map((match) => {
    const cells = (match[2] ?? "").split("|");
    return { path: match[1] ?? "", owner: (cells[cells.length - 1] ?? "").trim() };
  });
}

/** The stylesheet paths listed in the owner table, relative to the web interface. */
export function ownerTablePaths(record: string): string[] {
  return ownerTableRows(record).map((row) => row.path);
}

/**
 * Rules: `motion-owner-missing` (a stylesheet under the web interface carries motion but has no row),
 * `motion-owner-stale` (a row names a stylesheet that no longer exists or no longer carries motion),
 * `motion-owner-duplicate` (a stylesheet has more than one row), `motion-owner-unowned` (a row with an empty owner
 * cell) and `motion-outside-owner` (motion written outside the owner locations). A token file is held to the same rule: defining the motion tokens is its job, so it needs a row only if a
 * transition, an animation, keyframes or entry styles are written into it.
 */
export function motionOwnerProblems(
  files: readonly StyleFile[],
  record: string,
  tokenFiles: readonly string[],
): string[] {
  const rows = ownerTableRows(record);
  const listed = new Map<string, number>();
  for (const row of rows) listed.set(row.path, (listed.get(row.path) ?? 0) + 1);
  const moving = new Set(
    files
      .filter((file) => file.path.startsWith(WEB_ROOT) && carriesMotion(file.text, tokenFiles.includes(file.path)))
      .map((file) => file.path.slice(WEB_ROOT.length)),
  );
  const problems: string[] = [];
  if (rows.length === 0) problems.push(`motion-owner-table ${MOTION_OWNER_RECORD}: no owner table found`);
  for (const path of [...moving].sort()) {
    if (!listed.has(path)) problems.push(`motion-owner-missing ${WEB_ROOT}${path}`);
    if (!MOTION_LOCATIONS.some((location) => `${WEB_ROOT}${path}`.startsWith(location))) {
      problems.push(`motion-outside-owner ${WEB_ROOT}${path}`);
    }
  }
  for (const [path, count] of [...listed.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!moving.has(path)) problems.push(`motion-owner-stale ${WEB_ROOT}${path}`);
    if (count > 1) problems.push(`motion-owner-duplicate ${WEB_ROOT}${path}: ${String(count)} rows`);
  }
  for (const row of rows) {
    if (row.owner === "") problems.push(`motion-owner-unowned ${WEB_ROOT}${row.path}`);
  }
  return problems;
}
