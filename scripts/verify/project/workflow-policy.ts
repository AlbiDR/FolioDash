// A workflow may run only code it has pinned: every `uses:` names a full commit SHA, or a local path. GitHub
// enforces this when a run starts; checking it here fails a bad edit before it is pushed.

/** The `uses:` values in a workflow that are neither a local path nor pinned to a 40-character commit SHA. */
export function unpinnedActions(workflow: string): string[] {
  const unpinned: string[] = [];
  workflow.split("\n").forEach((line, index) => {
    const match = /^\s*(?:-\s+)?uses:\s*(\S+)/.exec(line);
    if (match === null) return;
    const reference = (match[1] ?? "").replace(/^["']|["']$/g, "");
    if (reference.startsWith("./")) return;
    if (/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(reference)) return;
    if (/^docker:\/\/\S+@sha256:[0-9a-f]{64}$/.test(reference)) return;
    unpinned.push(`line ${String(index + 1)}: ${reference}`);
  });
  return unpinned;
}

/**
 * A workflow's file name is the kebab-case form of its display name, so the Actions page, the file list and the
 * documents name one thing the same way. The display name starts with a capital and uses single spaces only.
 */
export function workflowNameViolations(fileName: string, workflow: string): string[] {
  const name = /^name:[ \t]*(.+?)[ \t]*$/mu.exec(workflow)?.[1];
  if (name === undefined) return [`${fileName}: no top-level display name`];
  const violations: string[] = [];
  if (!/^[A-Z][A-Za-z]*(?: [A-Za-z]+)*$/u.test(name))
    violations.push(`${fileName}: display name "${name}" must start with a capital and use single spaces`);
  const expected = `${name.toLowerCase().replace(/ /gu, "-")}.yml`;
  if (fileName !== expected)
    violations.push(`${fileName}: file name must be ${expected} to match display name "${name}"`);
  return violations;
}

/** The same action used at two different commits, as `owner/repo[/path] -> [SHA, ...]` across the given files. */
export function actionVersionConflicts(files: ReadonlyMap<string, string>): string[] {
  const versions = new Map<string, Map<string, string[]>>();
  for (const [file, text] of files) {
    for (const line of text.split("\n")) {
      const match = /^\s*(?:-\s+)?uses:\s*["']?([\w.-]+\/[\w./-]+)@([0-9a-f]{40})/.exec(line);
      if (match === null) continue;
      const action = match[1] ?? "";
      const sha = match[2] ?? "";
      const byVersion = versions.get(action) ?? new Map<string, string[]>();
      byVersion.set(sha, [...(byVersion.get(sha) ?? []), file]);
      versions.set(action, byVersion);
    }
  }
  const conflicts: string[] = [];
  for (const [action, byVersion] of versions) {
    if (byVersion.size < 2) continue;
    const detail = [...byVersion].map(([sha, where]) => `${sha.slice(0, 7)} in ${[...new Set(where)].join(", ")}`);
    conflicts.push(`${action} is pinned to ${String(byVersion.size)} different commits: ${detail.join("; ")}`);
  }
  return conflicts;
}

/** Jobs that run steps and have no `timeout-minutes`. A reusable-workflow caller job has no steps and is skipped. */
export function jobsWithoutTimeout(workflow: string): string[] {
  const lines = workflow.split("\n");
  const start = lines.indexOf("jobs:");
  if (start === -1) return [];
  const missing: string[] = [];
  let job: string | undefined;
  let body: string[] = [];
  const finish = () => {
    if (job === undefined) return;
    const reusable = body.some((line) => /^ {4}uses:/.test(line));
    const bounded = body.some((line) => /^ {4}timeout-minutes:/.test(line));
    if (!reusable && !bounded) missing.push(job);
  };
  for (const line of lines.slice(start + 1)) {
    const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (key !== null) {
      finish();
      job = key[1];
      body = [];
    } else if (/^\S/.test(line)) {
      break;
    } else {
      body.push(line);
    }
  }
  finish();
  return missing;
}

/** Checkouts that keep their credentials in the workspace, so a later step can use them. */
export function checkoutsKeepingCredentials(workflow: string): number[] {
  const lines = workflow.split("\n");
  const kept: number[] = [];
  lines.forEach((line, index) => {
    if (!/^\s*(?:-\s+)?uses:\s*actions\/checkout@/.test(line)) return;
    for (let next = index + 1; next < lines.length; next += 1) {
      const current = lines[next] ?? "";
      if (/^\s*-\s+(name|uses):/.test(current)) break;
      if (/^\S/.test(current)) break;
      if (/persist-credentials:\s*false/.test(current)) return;
    }
    kept.push(index + 1);
  });
  return kept;
}
