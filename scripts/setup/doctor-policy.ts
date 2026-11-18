// What a healthy development machine looks like, as pure functions: a Node release the project supports, and the
// installed packages matching what package.json pins. The doctor entry gathers the facts; this judges them.

export type Level = "pass" | "warn" | "fail" | "info";

export interface Finding {
  readonly level: Level;
  readonly name: string;
  readonly detail: string;
}

/** `v26.13.1` or `22.18.0` as three numbers; anything else is null. */
export function parseVersion(text: string): readonly [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** The minimum of an `engines` range such as `>=22.18.0`, or null for a shape this does not understand. */
export function minimumOf(range: string): string | null {
  const match = /^>=\s*(\d+\.\d+\.\d+)$/.exec(range.trim());
  return match === null ? null : (match[1] ?? null);
}

export function isAtLeast(version: string, minimum: string): boolean {
  const have = parseVersion(version);
  const need = parseVersion(minimum);
  if (have === null || need === null) return false;
  for (let index = 0; index < 3; index++) {
    if ((have[index] ?? 0) !== (need[index] ?? 0)) return (have[index] ?? 0) > (need[index] ?? 0);
  }
  return true;
}

export function nodeFinding(version: string, enginesRange: string, ciMajor: number): Finding {
  const minimum = minimumOf(enginesRange);
  if (minimum === null)
    return { level: "warn", name: "Node", detail: `cannot read the engines range "${enginesRange}"` };
  if (!isAtLeast(version, minimum)) {
    return { level: "fail", name: "Node", detail: `${version} is older than the supported minimum ${minimum}` };
  }
  const major = parseVersion(version)?.[0] ?? 0;
  return major === ciMajor
    ? { level: "pass", name: "Node", detail: `${version}, the release CI runs` }
    : { level: "pass", name: "Node", detail: `${version} (minimum ${minimum}; CI runs ${String(ciMajor)})` };
}

/**
 * Installed versus declared. A pinned version (no range operator) must match exactly, because a formatter or a test
 * runner that drifts changes the output of checks; a ranged one only has to be installed.
 */
export function driftFindings(
  declared: Readonly<Record<string, string>>,
  installed: (name: string) => string | null,
): Finding[] {
  const problems: Finding[] = [];
  for (const [name, wanted] of Object.entries(declared)) {
    const have = installed(name);
    if (have === null)
      problems.push({ level: "fail", name, detail: "is declared but not installed; run npm run setup" });
    else if (/^\d/.test(wanted) && have !== wanted) {
      problems.push({ level: "fail", name, detail: `pinned to ${wanted} but ${have} is installed; run npm ci` });
    }
  }
  return problems;
}
