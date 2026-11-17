import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Built file path (relative to the digested root, `/`-separated) mapped to its SHA-256. */
export type TreeDigest = Readonly<Record<string, string>>;

/** Digest every built file under a root. Source maps are debugging aids, not product, so they are skipped. */
export function digestTree(root: string): TreeDigest {
  const digest: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && !entry.name.endsWith(".map")) {
        digest[relative(root, path).split(sep).join("/")] = createHash("sha256").update(readFileSync(path)).digest("hex");
      }
    }
  };
  walk(root);
  return Object.fromEntries(Object.entries(digest).sort(([left], [right]) => (left < right ? -1 : 1)));
}

/** Human-readable differences between two digests; empty when the built output is byte-identical. */
export function digestDifferences(before: TreeDigest, after: TreeDigest): string[] {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return names.flatMap((name) => {
    const was = before[name];
    const now = after[name];
    if (was === now) return [];
    if (was === undefined) return [`added: ${name}`];
    if (now === undefined) return [`removed: ${name}`];
    return [`changed: ${name}`];
  });
}

/** Narrow parsed JSON to a digest; anything else is a corrupt snapshot. */
export function parseDigest(value: unknown): TreeDigest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("snapshot is not a digest object");
  const entries = Object.entries(value);
  if (!entries.every((entry): entry is [string, string] => typeof entry[1] === "string")) {
    throw new Error("snapshot holds a non-string digest");
  }
  return Object.fromEntries(entries);
}
