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
