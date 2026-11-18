// The coverage ratchet as pure functions. Coverage is measured per area of the source tree, and each area's
// recorded floor can only rise: a drop fails, and raising a floor never lowers one.

export interface Counts {
  readonly total: number;
  readonly covered: number;
}

export interface FileCoverage {
  readonly lines: Counts;
  readonly branches: Counts;
}

export interface AreaCoverage {
  readonly lines: number;
  readonly branches: number;
}

export type Floors = Readonly<Record<string, AreaCoverage>>;

/** `src/core/values/money.ts` belongs to `src/core`; interfaces are split deeper (`src/interfaces/server`, `src/interfaces/web/features`). */
export function areaOf(path: string): string {
  const parts = path.split("/");
  const depth = path.startsWith("src/interfaces/web/") ? 4 : path.startsWith("src/interfaces/") ? 3 : 2;
  return parts.slice(0, depth).join("/");
}

const percent = (counts: Counts): number => (counts.total === 0 ? 100 : (100 * counts.covered) / counts.total);
const floorTenth = (value: number): number => Math.floor(value * 10) / 10;

/** Per-area line and branch coverage, rounded down to a tenth so a floor never overstates what was measured. */
export function coverageByArea(files: Readonly<Record<string, FileCoverage>>): Record<string, AreaCoverage> {
  const sums = new Map<string, { lines: Counts; branches: Counts }>();
  for (const [path, file] of Object.entries(files)) {
    const area = areaOf(path);
    const sum = sums.get(area) ?? { lines: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 } };
    sums.set(area, {
      lines: { total: sum.lines.total + file.lines.total, covered: sum.lines.covered + file.lines.covered },
      branches: {
        total: sum.branches.total + file.branches.total,
        covered: sum.branches.covered + file.branches.covered,
      },
    });
  }
  return Object.fromEntries(
    [...sums]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([area, sum]) => [
        area,
        { lines: floorTenth(percent(sum.lines)), branches: floorTenth(percent(sum.branches)) },
      ]),
  );
}

/** A drop below a floor, an area that has no floor yet, and a floor for an area that no longer exists. */
export function coverageProblems(current: Readonly<Record<string, AreaCoverage>>, floors: Floors): string[] {
  const problems: string[] = [];
  for (const [area, now] of Object.entries(current)) {
    const floor = floors[area];
    if (floor === undefined) {
      problems.push(`${area}: no coverage floor recorded; run npm run verify:coverage -- --raise`);
      continue;
    }
    for (const metric of ["lines", "branches"] as const) {
      if (now[metric] < floor[metric]) {
        problems.push(
          `${area}: ${metric} coverage ${now[metric].toFixed(1)}% is below the floor ${floor[metric].toFixed(1)}%`,
        );
      }
    }
  }
  for (const area of Object.keys(floors)) {
    if (current[area] === undefined) problems.push(`${area}: has a coverage floor but no measured files`);
  }
  return problems;
}

/** New floors: every floor rises to the measured value when that is higher and never falls. */
export function raisedFloors(
  current: Readonly<Record<string, AreaCoverage>>,
  floors: Floors,
): Record<string, AreaCoverage> {
  return Object.fromEntries(
    Object.entries(current).map(([area, now]) => {
      const floor = floors[area];
      return [
        area,
        {
          lines: Math.max(now.lines, floor?.lines ?? 0),
          branches: Math.max(now.branches, floor?.branches ?? 0),
        },
      ];
    }),
  );
}
