import { createMotion, type Motion, timingFrom } from "../motion/animate";
import { createSettle } from "../motion/settle";

/** Movements under half a pixel are not drawn, so rounding never starts a glide. */
const MIN_DISTANCE = 0.5;

/**
 * The vertical distance a row must travel to appear where it was drawn. Its
 * visual start is its last resting position plus any glide still running; the
 * glide begins there and ends at its new position. Zero means nothing moves.
 */
export function glideDistance(previousTop: number, carriedOffset: number, nowTop: number): number {
  const distance = previousTop + carriedOffset - nowTop;
  return Math.abs(distance) < MIN_DISTANCE ? 0 : distance;
}

/** The vertical translation a computed CSS transform carries, or zero when it carries none. */
export function translationY(transform: string): number {
  const match = /^matrix\(([^)]*)\)$/u.exec(transform.trim());
  if (match === null) return 0;
  const translation = (match[1] ?? "").split(",")[5];
  const value = translation === undefined ? Number.NaN : Number.parseFloat(translation);
  return Number.isFinite(value) ? value : 0;
}

export interface RowGlide {
  /** Call after every render with the order the rows are shown in. A change in that order glides the rows that moved. */
  settle(orderKey: string): void;
}

/**
 * Glides rows to their new places when the order they are shown in changes.
 * Each row keeps its element, so it leaves from where it is drawn (including a
 * glide still running) and arrives where it now sits. Every row shares one
 * duration and none waits for another. Only position moves: a row's text and
 * figures stay as they are. Reduced motion, rows without the Web Animations API
 * and rows that are not drawn take their place at once.
 *
 * The resting position is recorded on every settle, not only when the order
 * changes, so an unrelated render cannot make a later re-sort glide a distance
 * the rows never moved.
 */
export function createRowGlide(
  root: () => HTMLElement | null,
  rowSelector: string,
  motion: Motion = createMotion(),
): RowGlide {
  const restingTops = new WeakMap<Element, number>();
  const settle = createSettle<null>();
  return {
    settle(orderKey) {
      const { changed } = settle(null, orderKey);
      const node = root();
      if (node === null) return;
      const timing = timingFrom(getComputedStyle(node));
      // Measure within the card: its arrival motion, page scroll or a notice above it must not become a row glide.
      const rootTop = node.getBoundingClientRect().top;
      for (const row of node.querySelectorAll<HTMLElement>(rowSelector)) {
        // A glide still running is part of what the row shows now: read it first. When the order changed, retire it so the
        // row is measured where it rests; otherwise the running glide is subtracted from the measurement.
        const carried = translationY(getComputedStyle(row).transform);
        if (changed) motion.stop(row);
        const box = row.getBoundingClientRect();
        if (box.height === 0) {
          restingTops.delete(row);
          continue;
        }
        const top = box.top - rootTop - (changed ? 0 : carried);
        const previous = restingTops.get(row);
        restingTops.set(row, top);
        if (!changed || previous === undefined) continue;
        const distance = glideDistance(previous, carried, top);
        if (distance === 0) continue;
        motion.play(
          row,
          [{ transform: `translateY(${distance.toFixed(2)}px)` }, { transform: "translateY(0px)" }],
          timing,
        );
      }
    },
  };
}
