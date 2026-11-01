import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { Plugin } from "vite";

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/**
 * After the app is built, bundles the service worker with the list of every built file
 * and a fingerprint of their contents. The fingerprint changes only when a file does, so
 * an unchanged site keeps its saved copy and a changed one replaces it.
 */
export function serviceWorkerPlugin(): Plugin {
  return {
    name: "foliodash-service-worker",
    apply: "build",
    async writeBundle(options) {
      const outDir = options.dir;
      if (outDir === undefined) throw new Error("The build has no output folder, so the service worker cannot be written.");
      const files = filesUnder(outDir)
        .map((path) => relative(outDir, path).split("\\").join("/"))
        .filter((file) => file !== "sw.js" && !file.endsWith(".map"))
        .sort();
      const hash = createHash("sha256");
      for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
      const result = await build({
        entryPoints: [fileURLToPath(new URL("../src/interfaces/web/serviceWorker/sw.ts", import.meta.url))],
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        target: "es2022",
        minify: true,
        legalComments: "none",
        logLevel: "error",
        define: { __PRECACHE__: JSON.stringify(["./", ...files.filter((file) => file !== "index.html")]), __BUILD__: JSON.stringify(hash.digest("hex").slice(0, 12)) },
      });
      writeFileSync(join(outDir, "sw.js"), result.outputFiles[0]?.text ?? "");
    },
  };
}
