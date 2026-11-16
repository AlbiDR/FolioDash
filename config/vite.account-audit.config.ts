import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import app from "./vite.config.ts";

/** A local-only synthetic harness, isolated from the production artifact. */
export default mergeConfig(app, {
  build: { outDir: fileURLToPath(new URL("../dist/acceptance/account-audit", import.meta.url)) },
});
