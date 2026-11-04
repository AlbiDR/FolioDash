// Runs the same pinned workflow checker locally and in CI, before npm dependencies
// are installed. Archives stay in the OS temporary cache, never in the repository.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const VERSION = "1.7.12";
// Published checksums: https://github.com/rhysd/actionlint/releases/tag/v1.7.12
const CHECKSUMS: Readonly<Record<string, string>> = {
  darwin_amd64: "5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644",
  darwin_arm64: "aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f",
  linux_amd64: "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
  linux_arm64: "325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6",
};

const architecture = process.arch === "x64" ? "amd64" : process.arch;
const target = `${process.platform}_${architecture}`;
const checksum = CHECKSUMS[target];
if (checksum === undefined) throw new Error(`Workflow verification supports Linux and macOS on x64/arm64, not ${target}.`);

const root = fileURLToPath(new URL("..", import.meta.url));
const cache = join(tmpdir(), "foliodash-actionlint");
mkdirSync(cache, { recursive: true, mode: 0o700 });
const archiveName = `actionlint_${VERSION}_${target}.tar.gz`;
const cachedArchive = join(cache, archiveName);
const temporary = mkdtempSync(join(tmpdir(), "foliodash-actionlint-run-"));

try {
  if (!existsSync(cachedArchive)) {
    const response = await fetch(`https://github.com/rhysd/actionlint/releases/download/v${VERSION}/${archiveName}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Cannot download actionlint ${VERSION}: HTTP ${String(response.status)}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== checksum) {
      throw new Error(`Downloaded actionlint ${VERSION} checksum does not match the pinned release.`);
    }
    const downloadedArchive = join(temporary, archiveName);
    writeFileSync(downloadedArchive, bytes, { mode: 0o600 });
    renameSync(downloadedArchive, cachedArchive);
  }

  // Recheck cached bytes too. Never trust a previous extraction or execute a
  // mutable tool discovered on PATH instead of the reviewed version.
  const bytes = readFileSync(cachedArchive);
  if (createHash("sha256").update(bytes).digest("hex") !== checksum) {
    throw new Error(`Cached actionlint ${VERSION} checksum mismatch. Remove ${cachedArchive} and rerun.`);
  }
  const archive = join(temporary, archiveName);
  writeFileSync(archive, bytes, { mode: 0o600 });
  const extracted = spawnSync("tar", ["-xzf", archive, "-C", temporary, "actionlint"], { stdio: "inherit" });
  if (extracted.error !== undefined) throw extracted.error;
  if (extracted.status !== 0) throw new Error("Cannot extract the verified actionlint binary.");

  const suppliedFiles = process.argv.slice(2);
  const files = suppliedFiles.length > 0 ? suppliedFiles : readdirSync(join(root, ".github/workflows"))
    .filter((file) => /\.ya?ml$/u.test(file))
    .sort()
    .map((file) => join(root, ".github/workflows", file));
  if (files.length === 0) throw new Error("No workflow definitions found.");
  // Optional external linters are disabled so a machine's PATH cannot silently
  // change the checks. actionlint still validates syntax, expressions and jobs.
  const checked = spawnSync(join(temporary, "actionlint"), ["-color", "-shellcheck=", "-pyflakes=", ...files], {
    cwd: root,
    stdio: "inherit",
  });
  if (checked.error !== undefined) throw checked.error;
  process.exitCode = checked.status ?? 1;
  if (process.exitCode === 0) console.log(`Workflow verification passed: actionlint ${VERSION}, ${String(files.length)} files.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
