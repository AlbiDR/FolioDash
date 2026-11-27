import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { motionMilliseconds } from "../ui/motion-timing";
import { prefersReducedMotion } from "./reduced-motion";

export interface LeavingRow<T> {
  readonly item: T;
  readonly leaving: boolean;
}

interface Ghost<T> {
  readonly item: T;
  readonly index: number;
}

/**
 * The rows to draw: every current item, plus each item that was drawn last time and is gone now, kept at the place
 * it held (clamped to the list) and marked as leaving. Presence cannot do this for table rows or list items, because
 * it wraps its content in a `div`; this keeps the row's own element instead.
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
      if (!current.has(key) && !next.has(key)) next.set(key, { item, index });
    });
  }
  const rows: LeavingRow<T>[] = items.map((item) => ({ item, leaving: false }));
  const ordered = [...next.values()].sort((a, b) => a.index - b.index);
  for (const ghost of ordered) rows.splice(Math.min(ghost.index, rows.length), 0, { item: ghost.item, leaving: true });
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
  useEffect(() => {
    if (leavingKeys === "") return undefined;
    const duration = motionMilliseconds(getComputedStyle(document.documentElement).getPropertyValue("--duration-cue"));
    const timeout = setTimeout(() => {
      ghosts.current = new Map();
      setVersion((value) => value + 1);
    }, duration + 60);
    return () => {
      clearTimeout(timeout);
    };
  }, [leavingKeys]);
  return { rows: merged.rows, version };
}
