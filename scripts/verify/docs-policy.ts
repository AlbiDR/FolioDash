// The documentation contract as pure functions: every link and every repository path named in a document must
// exist, every heading anchor must resolve, and every document must be reachable from the documentation index.

export interface DocumentFile {
  readonly path: string;
  readonly text: string;
}

const FENCE = /^(```|~~~)/;

/** Prose lines only: fenced code blocks are examples, not references. */
function prose(text: string): string[] {
  const lines: string[] = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (FENCE.test(line.trim())) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) lines.push(line);
  }
  return lines;
}

/** GitHub's heading anchor: lower case, punctuation removed, spaces to hyphens. */
export function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

export function headingSlugs(text: string): Set<string> {
  const seen = new Map<string, number>();
  const slugs = new Set<string>();
  for (const line of prose(text)) {
    const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (match === null) continue;
    const base = slug(match[1] ?? "");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${String(count)}`);
  }
  return slugs;
}

const dirname = (path: string): string => path.split("/").slice(0, -1).join("/");

function resolve(from: string, target: string): string {
  const parts = dirname(from) === "" ? [] : dirname(from).split("/");
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}

/** Broken inline links, with the heading anchor checked when the target is a Markdown file. */
export function linkProblems(documents: readonly DocumentFile[], exists: (path: string) => boolean): string[] {
  const problems: string[] = [];
  const slugsOf = new Map(documents.map((doc) => [doc.path, headingSlugs(doc.text)]));
  for (const doc of documents) {
    prose(doc.text).forEach((line, index) => {
      for (const match of line.replace(/`[^`]*`/g, "").matchAll(/\]\(([^)\s]+)\)/g)) {
        const raw = match[1] ?? "";
        if (/^(https?:|mailto:)/.test(raw)) continue;
        const [pathPart = "", fragment] = raw.split("#");
        const target = pathPart === "" ? doc.path : resolve(doc.path, pathPart);
        const where = `${doc.path}:${String(index + 1)}`;
        if (!exists(target)) {
          problems.push(`${where}: link to missing ${target}`);
          continue;
        }
        if (fragment === undefined || /^L\d+(-L\d+)?$/.test(fragment)) continue;
        const slugs = slugsOf.get(target);
        if (slugs !== undefined && !slugs.has(fragment))
          problems.push(`${where}: no heading #${fragment} in ${target}`);
      }
    });
  }
  return problems;
}

const REPOSITORY_PATH = /^(?:src|scripts|config|docs|tests|\.github)\/[\w./-]*[\w/]$/;

/** Backticked repository paths that name something that no longer exists. Globs and placeholders are skipped. */
export function pathProblems(documents: readonly DocumentFile[], exists: (path: string) => boolean): string[] {
  const problems: string[] = [];
  for (const doc of documents) {
    prose(doc.text).forEach((line, index) => {
      for (const match of line.matchAll(/`([^`\s]+)`/g)) {
        const token = (match[1] ?? "").replace(/\/$/, "");
        if (!REPOSITORY_PATH.test(match[1] ?? "") || /[*<>{}]/.test(token)) continue;
        if (!exists(token)) problems.push(`${doc.path}:${String(index + 1)}: names missing path ${token}`);
      }
    });
  }
  return problems;
}

/** Every document under docs/ other than the index must be linked from the index. */
export function orphanProblems(documents: readonly DocumentFile[], index = "docs/README.md"): string[] {
  const indexDoc = documents.find((doc) => doc.path === index);
  if (indexDoc === undefined) return [`${index}: the documentation index is missing`];
  const linked = new Set<string>();
  for (const match of indexDoc.text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
    linked.add(resolve(index, match[1] ?? ""));
  }
  return documents
    .filter((doc) => doc.path.startsWith("docs/") && doc.path !== index && !linked.has(doc.path))
    .map((doc) => `${doc.path}: not linked from ${index}`);
}
