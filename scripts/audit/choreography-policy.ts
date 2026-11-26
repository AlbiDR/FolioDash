// The page choreography ceilings as pure functions (docs/design/polished-by-default.md, phase 1). Each screen's
// arrival is measured in the production renderer: how many kinds of animation start, on how many elements, when the
// last finite one ends, and how many never end. A ceiling may only fall: a rise fails, and recording never raises one.

export interface Choreography {
  /** Distinct motions: each keyframes name, each transitioned property, and script-driven motion as one kind. */
  readonly kinds: number;
  /** Elements that animate. */
  readonly elements: number;
  /** Milliseconds from the start of the arrival until the last finite animation ends, delays included. */
  readonly settle: number;
  /** Animations that never end on their own, such as a busy indicator (WCAG 2.2.2 in the record). */
  readonly loops: number;
}

export type Ceilings = Readonly<Record<string, Choreography>>;

const MEASURES = ["kinds", "elements", "settle", "loops"] as const;

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A recorded measure must be a whole, finite, non-negative number; anything else would compare as never exceeded. */
const valid = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Rules: `choreography-<measure>` (a case measured above its ceiling), `choreography-unrecorded` (a case with no
 * ceiling yet), `choreography-unmeasured` (a ceiling whose case no longer runs, so it cannot silently go stale) and
 * `choreography-invalid` (a ceiling with a missing or malformed measure, which would otherwise disable that check).
 */
export function choreographyProblems(measured: Readonly<Record<string, Choreography>>, ceilings: Ceilings): string[] {
  const problems: string[] = [];
  for (const name of Object.keys(ceilings).sort(byName)) {
    const ceiling = ceilings[name] as Readonly<Record<string, unknown>> | undefined;
    for (const measure of MEASURES) {
      if (!valid(ceiling?.[measure])) problems.push(`choreography-invalid ${name}: ${measure}`);
    }
  }
  for (const name of Object.keys(measured).sort(byName)) {
    const values = measured[name];
    const ceiling = ceilings[name];
    if (values === undefined) continue;
    if (ceiling === undefined) {
      problems.push(`choreography-unrecorded ${name}`);
      continue;
    }
    for (const measure of MEASURES) {
      const limit = ceiling[measure];
      if (valid(limit) && values[measure] > limit) {
        problems.push(`choreography-${measure} ${name}: ${String(values[measure])} > ${String(limit)}`);
      }
    }
  }
  for (const name of Object.keys(ceilings).sort(byName)) {
    if (!(name in measured)) problems.push(`choreography-unmeasured ${name}`);
  }
  return problems;
}

/**
 * The ceilings to record after a measurement: each measure of a known case falls to what was measured and never rises,
 * and a new case starts at its measurement. Cases that no longer run are dropped, which is the only way one leaves.
 */
export function loweredCeilings(
  measured: Readonly<Record<string, Choreography>>,
  ceilings: Ceilings,
): Record<string, Choreography> {
  const result: Record<string, Choreography> = {};
  for (const name of Object.keys(measured).sort(byName)) {
    const values = measured[name];
    if (values === undefined) continue;
    const ceiling = ceilings[name];
    // A malformed measure is reported by choreographyProblems; here it falls back to the measurement, never to NaN.
    const lower = (measure: (typeof MEASURES)[number]): number => {
      const limit = ceiling?.[measure];
      return valid(limit) ? Math.min(values[measure], limit) : values[measure];
    };
    result[name] = {
      kinds: lower("kinds"),
      elements: lower("elements"),
      settle: lower("settle"),
      loops: lower("loops"),
    };
  }
  return result;
}
