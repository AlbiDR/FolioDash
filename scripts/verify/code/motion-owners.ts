// The motion owner table as pure functions (docs/design/motion-layer.md, docs/design/polished-by-default.md phase 1).
// Every stylesheet that declares a transition or an animation, or defines keyframes, has one owner listed in the
// motion layer's table, and the table lists nothing that no longer moves. Polish written as a new, unlisted layer was
// how a large share of tuned motion ended up overridden and never seen.

import type { StyleFile } from "./style-policy.ts";

/** The design record whose table names each motion stylesheet's owner. */
export const MOTION_OWNER_RECORD = "docs/design/motion-layer.md";
const TABLE_HEADING = "## Motion stylesheets and their owners";
/** Table paths are written relative to the web interface, as the rest of that record writes them. */
const WEB_ROOT = "src/interfaces/web/";

/** Whether a stylesheet declares any transition or animation property, or defines keyframes. Comments do not count. */
export function carriesMotion(text: string): boolean {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
  return /@keyframes\b/.test(code) || /(?:^|[{;\s])(?:transition|animation)(?:-[a-z-]+)?\s*:/.test(code);
}

/** The stylesheet paths listed in the owner table, relative to the web interface. */
export function ownerTablePaths(record: string): string[] {
  const start = record.indexOf(TABLE_HEADING);
  if (start < 0) return [];
  const rest = record.slice(start + TABLE_HEADING.length);
  const end = rest.search(/\n## /);
  const section = end < 0 ? rest : rest.slice(0, end);
  return [...section.matchAll(/^\| `([^`]+\.css)` \|/gm)].map((match) => match[1] ?? "");
}

/**
 * Rules: `motion-owner-missing` (a stylesheet under the web interface carries motion but has no row) and
 * `motion-owner-stale` (a row names a stylesheet that no longer exists or no longer carries motion). Token files are
 * the motion vocabulary, not a place where motion happens, so they need no row.
 */
export function motionOwnerProblems(
  files: readonly StyleFile[],
  record: string,
  tokenFiles: readonly string[],
): string[] {
  const listed = new Set(ownerTablePaths(record));
  const moving = new Set(
    files
      .filter((file) => file.path.startsWith(WEB_ROOT) && !tokenFiles.includes(file.path) && carriesMotion(file.text))
      .map((file) => file.path.slice(WEB_ROOT.length)),
  );
  const problems: string[] = [];
  if (listed.size === 0) problems.push(`motion-owner-table ${MOTION_OWNER_RECORD}: no owner table found`);
  for (const path of [...moving].sort()) {
    if (!listed.has(path)) problems.push(`motion-owner-missing ${WEB_ROOT}${path}`);
  }
  for (const path of [...listed].sort()) {
    if (!moving.has(path)) problems.push(`motion-owner-stale ${WEB_ROOT}${path}`);
  }
  return problems;
}
