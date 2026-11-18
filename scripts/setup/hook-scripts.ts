// The local Git hooks, as text. They are generated into .git/hooks, never tracked, so no shell script and no root
// file is added to the repository, and one install serves every worktree of the clone.

export const HOOK_MARKER = "# Installed by npm run setup:hooks (docs/architecture/cleanstack.md STD-4, STD-5).";

/** Hook name to file content. Each runs from the repository root, where Git starts it. */
export function hookScripts(): Readonly<Record<string, string>> {
  return {
    "commit-msg": `#!/bin/sh\n${HOOK_MARKER}\nexec node scripts/verify/project/commit-message.ts "$1"\n`,
    "pre-commit": `#!/bin/sh\n${HOOK_MARKER}\nnpm run -s format:check && npm run -s verify:structure && npm run -s verify:docs && npm run -s verify:style\n`,
  };
}
