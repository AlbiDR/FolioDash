/** A row needs at least this many figures before best and worst mean anything: with two, each is both. */
export const MIN_MARKED_VALUES = 3;

export interface RowMarks {
  /** Positions holding the largest figure in the row. Equal figures are all marked. */
  readonly best: ReadonlySet<number>;
  /** Positions holding the smallest figure in the row. */
  readonly worst: ReadonlySet<number>;
}

const NONE: RowMarks = { best: new Set(), worst: new Set() };

/**
 * Which months are the best and worst in one row, higher being better. It only compares figures the matrix already
 * shows; nothing is added or averaged. A missing figure never wins, and a row with too few figures or all the same
 * figure marks nothing.
 */
export function rowMarks(values: readonly (number | null)[]): RowMarks {
  const present = values.flatMap((value, position) => (value !== null && Number.isFinite(value) ? [{ value, position }] : []));
  if (present.length < MIN_MARKED_VALUES) return NONE;
  const high = Math.max(...present.map((entry) => entry.value));
  const low = Math.min(...present.map((entry) => entry.value));
  if (high === low) return NONE;
  return {
    best: new Set(present.filter((entry) => entry.value === high).map((entry) => entry.position)),
    worst: new Set(present.filter((entry) => entry.value === low).map((entry) => entry.position)),
  };
}

/**
 * A percentage as the screen shows it, in hundredths of a percent and rounded the same way, so two months that read
 * the same are compared as the same. Marking by the unrounded figure would single out one of two identical readings.
 */
export function displayedHundredths(ratio: number | null): number | null {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  const hundredths = Math.round(Math.abs(ratio) * 10_000);
  return hundredths === 0 ? 0 : ratio < 0 ? -hundredths : hundredths;
}
