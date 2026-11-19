/** What the previous render drew, and whether the choice behind this render differs from the choice behind it. */
export interface Settled<Snapshot> {
  /** The snapshot of the previous render, or null on the first one. */
  readonly before: Snapshot | null;
  /** True when the key identifying the choice (a period, an order) differs from the previous render's key. */
  readonly changed: boolean;
}

/**
 * Remembers each render's snapshot and key. Call it once per render, after the render. It reports the previous
 * snapshot and whether the key changed, and leaves deciding what to move to the caller. The first render never
 * reports a change, so nothing moves on first paint.
 */
export function createSettle<Snapshot>(): (snapshot: Snapshot, key: string | undefined) => Settled<Snapshot> {
  let previous: Snapshot | null = null;
  let previousKey: string | undefined;
  let rendered = false;
  return (snapshot, key) => {
    const settled: Settled<Snapshot> = { before: previous, changed: rendered && previousKey !== key };
    previous = snapshot;
    previousKey = key;
    rendered = true;
    return settled;
  };
}
