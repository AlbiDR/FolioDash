// The repository's health, measured from its files alone: no test run, no network, the same answer twice.
// It is pure so it can be tested, and so it can be pointed at an older checkout to compare a before and an after.

export interface Health {
  readonly rootEntries: number;
  readonly code: {
    readonly files: number;
    readonly lines: number;
    readonly largest: { readonly path: string; readonly lines: number };
    readonly percentile95: number;
    readonly over400: number;
    readonly crowdedFolders: number;
    readonly largestFolder: { readonly path: string; readonly files: number };
  };
  readonly tests: { readonly files: number };
  readonly docs: { readonly documents: number; readonly ruleIds: number };
  readonly dependencies: { readonly production: number; readonly development: number };
  readonly checks: { readonly verifySteps: number; readonly npmScripts: number };
}

const CODE = /\.(?:ts|tsx|css)$/;
const AREAS = /^(?:src|tests|scripts|config)\//;
const MAX_LINES = 400;
const MAX_FILES_PER_FOLDER = 20;

const lineCount = (text: string): number =>
  text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;

/** The nearest-rank 95th percentile of a list of numbers. */
export function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)] ?? 0;
}

/** Counts rule IDs such as `PRN-3` defined at the start of a list item in the architecture reference. */
export function countRuleIds(adr: string): number {
  return (adr.match(/^\s*(?:[-*]|\d+\.)\s+\*\*[A-Z]{3}-\d+\b/gm) ?? []).length;
}

/**
 * @param files tracked paths, relative to the repository root
 * @param read file text, or null when the file cannot be read
 */
export function healthMetrics(files: readonly string[], read: (path: string) => string | null): Health {
  const code = files.filter((file) => AREAS.test(file) && CODE.test(file));
  const sizes = code.map((path) => ({ path, lines: lineCount(read(path) ?? "") }));
  const largest = sizes.reduce((best, entry) => (entry.lines > best.lines ? entry : best), { path: "", lines: 0 });
  const perFolder = new Map<string, number>();
  for (const { path } of sizes) {
    const folder = path.split("/").slice(0, -1).join("/");
    perFolder.set(folder, (perFolder.get(folder) ?? 0) + 1);
  }
  const largestFolder = [...perFolder].reduce(
    (best, [path, count]) => (count > best.files ? { path, files: count } : best),
    {
      path: "",
      files: 0,
    },
  );
  const manifest = JSON.parse(read("package.json") ?? "{}") as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const verify = manifest.scripts?.["verify"] ?? "";
  return {
    rootEntries: new Set(files.map((file) => file.split("/")[0])).size,
    code: {
      files: code.length,
      lines: sizes.reduce((sum, entry) => sum + entry.lines, 0),
      largest,
      percentile95: percentile95(sizes.map((entry) => entry.lines)),
      over400: sizes.filter((entry) => entry.lines > MAX_LINES).length,
      crowdedFolders: [...perFolder.values()].filter((count) => count > MAX_FILES_PER_FOLDER).length,
      largestFolder,
    },
    tests: { files: files.filter((file) => /\.test\.tsx?$/.test(file)).length },
    docs: {
      documents: files.filter((file) => file.startsWith("docs/") && file.endsWith(".md")).length,
      ruleIds: countRuleIds(read("docs/architecture/cleanstack.md") ?? ""),
    },
    dependencies: {
      production: Object.keys(manifest.dependencies ?? {}).length,
      development: Object.keys(manifest.devDependencies ?? {}).length,
    },
    checks: {
      verifySteps: (verify.match(/npm (?:run )?[\w:-]+/g) ?? []).length,
      npmScripts: Object.keys(manifest.scripts ?? {}).length,
    },
  };
}
