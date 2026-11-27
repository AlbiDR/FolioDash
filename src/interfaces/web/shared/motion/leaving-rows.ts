import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { motionMilliseconds } from "../ui/motion-timing";
import { prefersReducedMotion } from "./reduced-motion";

export interface LeavingRow<T> {
  readonly item: T;
  readonly leaving: boolean;
}

interface Ghost<T> {
  readonly item: T;
  /** Where it was, as a fallback when the row it followed has gone too. */
  readonly index: number;
  /** The key of the live row it followed, so a row inserted above it does not move it. Null when it was first. */
  readonly after: string | null;
}

/**
 * The rows to draw: every current item, plus each item that was drawn last time and is gone now, kept after the row it
 * followed and marked as leaving. Presence cannot do this for table rows or list items, because it wraps its content in
 * a `div`; this keeps the row's own element instead.
 */
export function mergeLeaving<T>(
  items: readonly T[],
  drawn: readonly T[],
  keyOf: (item: T) => string,
  ghosts: ReadonlyMap<string, Ghost<T>>,
  retain: boolean,
): { readonly rows: readonly LeavingRow<T>[]; readonly ghosts: ReadonlyMap<string, Ghost<T>> } {
  const current = new Set(items.map(keyOf));
  const next = new Map<string, Ghost<T>>();
  if (retain) {
    for (const [key, ghost] of ghosts) if (!current.has(key)) next.set(key, ghost);
    drawn.forEach((item, index) => {
      const key = keyOf(item);
      if (current.has(key) || next.has(key)) return;
      const before = drawn[index - 1];
      next.set(key, { item, index, after: before === undefined ? null : keyOf(before) });
    });
  }
  const rows: LeavingRow<T>[] = items.map((item) => ({ item, leaving: false }));
  const ordered = [...next.values()].sort((a, b) => a.index - b.index);
  for (const ghost of ordered) {
    const anchor = ghost.after === null ? -1 : rows.findIndex((row) => keyOf(row.item) === ghost.after);
    let at = ghost.after !== null && anchor === -1 ? Math.min(ghost.index, rows.length) : anchor + 1;
    // Rows that left after the same row keep their old order.
    while (ghost.after !== null && anchor !== -1 && rows[at]?.leaving === true) at += 1;
    while (ghost.after === null && rows[at]?.leaving === true) at += 1;
    rows.splice(at, 0, { item: ghost.item, leaving: true });
  }
  return { rows, ghosts: next };
}

/**
 * Keeps rows that have just left on screen while they fade, then drops them. `version` changes each time rows are
 * dropped, so a row glide can run when the space closes. Reduced motion drops them at once.
 */
export function useLeavingRows<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): { readonly rows: readonly LeavingRow<T>[]; readonly version: number } {
  const drawn = useRef<readonly T[]>([]);
  const ghosts = useRef<ReadonlyMap<string, Ghost<T>>>(new Map());
  const [version, setVersion] = useState(0);
  const merged = mergeLeaving(items, drawn.current, keyOf, ghosts.current, !prefersReducedMotion());
  useLayoutEffect(() => {
    // Only live rows count as drawn: a ghost that has been dropped must not be recreated from the last render.
    drawn.current = merged.rows.filter((row) => !row.leaving).map((row) => row.item);
    ghosts.current = merged.ghosts;
  });
  const leavingKeys = merged.rows
    .filter((row) => row.leaving)
    .map((row) => keyOf(row.item))
    .join("\u0000");
  // Each leaving row has its own deadline, so a row that leaves later never holds an earlier one on screen.
  const deadlines = useRef(new Map<string, number>());
  useEffect(() => {
    const keys = leavingKeys === "" ? [] : leavingKeys.split("\u0000");
    const now = performance.now();
    const hold = motionMilliseconds(getComputedStyle(document.documentElement).getPropertyValue("--duration-cue")) + 60;
    for (const key of keys) if (!deadlines.current.has(key)) deadlines.current.set(key, now + hold);
    for (const key of [...deadlines.current.keys()]) if (!keys.includes(key)) deadlines.current.delete(key);
    if (keys.length === 0) return undefined;
    const earliest = Math.min(...keys.map((key) => deadlines.current.get(key) ?? now));
    const timeout = setTimeout(
      () => {
        const at = performance.now() + 4;
        ghosts.current = new Map([...ghosts.current].filter(([key]) => (deadlines.current.get(key) ?? 0) > at));
        setVersion((value) => value + 1);
      },
      Math.max(0, earliest - now),
    );
    return () => {
      clearTimeout(timeout);
    };
  }, [leavingKeys]);
  return { rows: merged.rows, version };
}
