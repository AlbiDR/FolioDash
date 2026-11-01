// Bundles the server entry into the plain files Apps Script accepts: one Code.js
// and a manifest. clasp 3 does not transpile TypeScript, so what is pushed is
// this build output, never the source files.

import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

export const OPERATIONS = ["foliodashCheck", "foliodashRead", "foliodashCommit", "foliodashOutcome"];
export const OUTPUT_DIRECTORY = "dist/apps-script";

// Only spreadsheet access. No Drive, no mail, no external requests.
const MANIFEST = {
  timeZone: "Europe/Rome",
  dependencies: {},
  exceptionLogging: "STACKDRIVER",
  runtimeVersion: "V8",
  oauthScopes: ["https://www.googleapis.com/auth/spreadsheets"],
};

export async function buildAppsScript() {
  const result = await build({
    entryPoints: ["src/interfaces/server/main.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "FolioDashBundle",
    platform: "neutral",
    target: "es2020",
    tsconfig: "config/tsconfig.json",
    legalComments: "none",
    logLevel: "error",
  });
  const bundle = result.outputFiles[0]?.text ?? "";
  // Apps Script finds callable functions by their top-level names.
  const wrappers = OPERATIONS.map(
    (name) => `function ${name}() {\n  return FolioDashBundle.${name}.apply(null, arguments);\n}`,
  ).join("\n");
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  writeFileSync(`${OUTPUT_DIRECTORY}/Code.js`, `${bundle}\n${wrappers}\n`);
  writeFileSync(`${OUTPUT_DIRECTORY}/appsscript.json`, `${JSON.stringify(MANIFEST, null, 2)}\n`);
  return { code: `${bundle}\n${wrappers}\n`, manifest: MANIFEST };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { code } = await buildAppsScript();
  process.stdout.write(`Built ${OUTPUT_DIRECTORY}/Code.js (${String(code.length)} bytes) and appsscript.json\n`);
}
