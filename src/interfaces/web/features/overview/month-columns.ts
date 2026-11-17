import type { IsoDate } from "../../../../core/iso-date";

/** Cues on a statement column: a rule where a new calendar year starts, and a tint on the statement chosen below. */
export function columnClass(dates: readonly IsoDate[], position: number, selected: number): string {
  const previous = dates[position - 1];
  const yearStart = previous !== undefined && previous.slice(0, 4) !== dates[position]?.slice(0, 4);
  return [yearStart ? "matrix-year-start" : "", position === selected ? "matrix-selected" : ""]
    .filter((name) => name !== "")
    .join(" ");
}
