import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import app from "./vite.config.ts";

/** Local, explicitly marked build. This is never the production build or a deployment target. */
export default mergeConfig(app, {
  define: { __SYNTHETIC_ACCEPTANCE__: "true" },
  build: { outDir: fileURLToPath(new URL("../dist/acceptance/web", import.meta.url)) },
  preview: { host: "localhost", port: 4173, strictPort: true },
});
