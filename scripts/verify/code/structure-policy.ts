// The naming and size contract from docs/architecture/naming-contract.md, as a pure function.
// Each violation is the string "<rule> <path>", so a violation list reads and compares as plain text.

export interface StructureOptions {
  readonly codeExtensions: readonly string[];
  readonly namedAreas: readonly string[];
  readonly maxLinesPerFile: number;
  readonly maxCodeFilesPerDirectory: number;
}

export interface CodeFile {
  readonly path: string;
  readonly lines: number;
}

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const directoryOf = (path: string): string => path.split("/").slice(0, -1).join("/");

/** Rule ids: file-name, directory-name, max-lines and max-files. The result is sorted and has no duplicates. */
export function structureViolations(files: readonly CodeFile[], options: StructureOptions): string[] {
  const violations = new Set<string>();
  const perDirectory = new Map<string, number>();
  const checkedDirectories = new Set<string>();
  for (const { path, lines } of files) {
    const name = path.split("/").at(-1) ?? "";
    const stem = name.slice(0, name.lastIndexOf("."));
    if (!stem.split(".").every((part) => KEBAB_CASE.test(part))) violations.add(`file-name ${path}`);
    const parts = path.split("/").slice(0, -1);
    for (let depth = 1; depth <= parts.length; depth++) {
      const directory = parts.slice(0, depth).join("/");
      if (checkedDirectories.has(directory)) continue;
      checkedDirectories.add(directory);
      if (depth > 1 && !KEBAB_CASE.test(parts[depth - 1] ?? "")) violations.add(`directory-name ${directory}`);
    }
    if (lines > options.maxLinesPerFile) violations.add(`max-lines ${path}`);
    const directory = directoryOf(path);
    perDirectory.set(directory, (perDirectory.get(directory) ?? 0) + 1);
  }
  for (const [directory, count] of perDirectory) {
    if (count > options.maxCodeFilesPerDirectory) violations.add(`max-files ${directory}`);
  }
  return [...violations].sort();
}
