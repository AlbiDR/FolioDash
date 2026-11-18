import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HOOK_MARKER, hookScripts } from "../../scripts/setup/hook-scripts";

const INSTALLER = resolve("scripts/setup/hooks.ts");
const MESSAGE_CHECK = resolve("scripts/verify/project/commit-message.ts");
const temporary: string[] = [];
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "foliodash-hooks-"));
  temporary.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}
const install = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, [INSTALLER, ...args], { cwd, encoding: "utf8" });

describe("hook scripts", () => {
  it("are marked as ours and each runs a repository script from the root", () => {
    for (const content of Object.values(hookScripts())) {
      expect(content.startsWith("#!/bin/sh\n")).toBe(true);
      expect(content).toContain(HOOK_MARKER);
    }
    expect(hookScripts()["commit-msg"]).toContain("scripts/verify/project/commit-message.ts");
  });
});

describe("installer", () => {
  it("installs executable hooks, again without change, and removes only its own", () => {
    const root = repository();
    expect(install(root).status).toBe(0);
    const hook = join(root, ".git/hooks/commit-msg");
    expect(statSync(hook).mode & 0o111).not.toBe(0);
    expect(readFileSync(hook, "utf8")).toBe(hookScripts()["commit-msg"]);
    expect(install(root).status).toBe(0);
    expect(install(root, "--uninstall").status).toBe(0);
    expect(existsSync(hook)).toBe(false);
  });

  it("never overwrites a hook that is not ours", () => {
    const root = repository();
    const foreign = join(root, ".git/hooks/pre-commit");
    writeFileSync(foreign, "#!/bin/sh\necho mine\n");
    const result = install(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pre-commit");
    expect(readFileSync(foreign, "utf8")).toBe("#!/bin/sh\necho mine\n");
    expect(existsSync(join(root, ".git/hooks/commit-msg"))).toBe(true);
  });
});

describe("the commit-msg check a hook runs", () => {
  const check = (subject: string) => {
    const root = repository();
    const file = join(root, "MESSAGE");
    writeFileSync(file, `${subject}\n`);
    return spawnSync(process.execPath, [MESSAGE_CHECK, file], { encoding: "utf8" });
  };
  it("passes a conforming subject and fails a loose one with the reason", () => {
    expect(check("fix: close the gap").status).toBe(0);
    const bad = check("Fixed some stuff");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("<type>: <summary>");
  });
});
