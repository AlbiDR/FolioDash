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
