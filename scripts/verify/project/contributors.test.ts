import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const checker = fileURLToPath(new URL("./contributors.ts", import.meta.url));

function audit(author: string, email: string, message: string): ReturnType<typeof spawnSync> {
  const directory = mkdtempSync(join(tmpdir(), "foliodash-attribution-"));
  try {
    execFileSync("git", ["init", "--quiet", directory]);
    execFileSync("git", ["-C", directory, "commit", "--quiet", "--allow-empty", "-m", message], {
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: author,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: "ADR",
        GIT_COMMITTER_EMAIL: "97815338+AlbiDR@users.noreply.github.com",
      },
    });
    return spawnSync(process.execPath, [checker], { cwd: directory, encoding: "utf8" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

void test("approved human authors pass and new bot-authored commits still fail", () => {
  assert.equal(audit("ADR", "97815338+AlbiDR@users.noreply.github.com", "human change").status, 0);
  const result = audit("github-actions[bot]", "41898282+github-actions[bot]@users.noreply.github.com", "bot change");
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /author metadata identifies automation/);
});

void test("unapproved co-authors remain rejected", () => {
  const result = audit(
    "ADR",
    "97815338+AlbiDR@users.noreply.github.com",
    "change\n\nCo-authored-by: Bot <bot@example.com>",
  );
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /co-author metadata identifies automation/);
});
