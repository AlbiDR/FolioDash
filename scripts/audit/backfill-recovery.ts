// Runs the real Preact component and Session against FakeGoogle, never a live account.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { withLocalBrowser } from "../lib/local-browser.ts";

const directory = resolve("dist/acceptance/backfill-audit");
const html = resolve(directory, "index.html");
const bundle = resolve(directory, "synthetic-backfill-audit.js");
const stylesheet = resolve(directory, "styles.css");
let assertions = 0;
if ([html, bundle, stylesheet].some(existsSync))
  throw new Error("The synthetic harness destination is already in use.");
mkdirSync(directory, { recursive: true });
try {
  execFileSync(
    "node_modules/.bin/esbuild",
    [
      "tests/fixtures/backfill-browser.ts",
      "--bundle",
      "--platform=browser",
      "--format=esm",
      "--jsx=automatic",
      "--jsx-import-source=preact",
      `--outfile=${bundle}`,
    ],
    { stdio: "pipe" },
  );
  const stylesheetPath = readFileSync(resolve("dist/web/index.html"), "utf8").match(
    /href="(\.\/assets\/[^"/]+\.css)"/u,
  )?.[1];
  if (stylesheetPath === undefined) throw new Error("Build the app before running the synthetic recovery audit.");
  copyFileSync(resolve("dist/web", stylesheetPath), stylesheet);
  writeFileSync(
    html,
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="./styles.css"><title>Synthetic recovery test</title></head><body><div class="shell"><main class="content-inner" id="root"></main></div><script type="module" src="./synthetic-backfill-audit.js"></script></body></html>',
  );
  await withLocalBrowser(
    async ({ origin, call, evaluate, waitFor }) => {
      const check = async (expression: string, label: string): Promise<void> => {
        if ((await evaluate(expression)) !== true) throw new Error(`Backfill recovery: ${label}`);
        assertions++;
      };
      const click = async (label: string): Promise<void> => {
        await evaluate(
          `[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)}).click()`,
        );
      };
      await call("Page.navigate", { url: `${origin}/` });
      await waitFor(
        async () =>
          (await evaluate(
            "!!document.querySelector('#backfill-date') || document.body.innerText.includes('Synthetic setup error:')",
          )) === true,
        "synthetic earlier-history form",
      );
      const setupError = await evaluate(
        "document.body.innerText.includes('Synthetic setup error:') ? document.body.innerText : ''",
      );
      if (typeof setupError === "string" && setupError !== "") throw new Error(setupError);
      await evaluate(
        `(()=>{const fields={'backfill-date':'2025-12-31','backfill-name-1':'Synthetic Fund A','backfill-isin-1':'US0378331005','backfill-value-1':'1.000,00'};for(const [id,value] of Object.entries(fields)){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}})()`,
      );
      await evaluate("document.querySelector('.backfill-entry form').requestSubmit()");
      await waitFor(
        async () => (await evaluate("!!document.querySelector('.questions input[type=text]')")) === true,
        "opening balances",
      );
      await evaluate(
        "(()=>{const input=document.querySelector('.questions input[type=text]');input.value='1.000,00';input.dispatchEvent(new Event('input',{bubbles:true}))})()",
      );
      await click("Keep these answers and continue");
      await waitFor(
        async () => (await evaluate("document.body.innerText.includes('Earlier month reviewed')")) === true,
        "reviewed earlier month",
      );
      await click("Review movements to first saved month");
      await waitFor(
        async () => (await evaluate("document.querySelectorAll('.questions .choice input').length===2")) === true,
        "boundary movements",
      );
      await evaluate("document.querySelectorAll('.questions .choice input')[1].click()");
      await click("Keep these answers and continue");
      await waitFor(
        async () => (await evaluate("document.body.innerText.includes('Review changes before saving')")) === true,
        "backfill confirmation",
      );
      await check("window.syntheticBackfill.dates().join(',')==='2026-01-31'", "preview does not save");
      await click("Confirm and save earlier statement");
      await waitFor(
        async () => (await evaluate("document.body.innerText.includes('Do not submit this change again')")) === true,
        "uncertain save outcome",
      );
      await check(
        "window.syntheticBackfill.pending()!==null && ![...document.querySelectorAll('button')].some(button=>button.textContent==='Confirm and save earlier statement')",
        "unknown save blocks resubmission",
      );
      await click("Check what happened");
      await waitFor(
        async () => (await evaluate("document.body.innerText.includes('History saved and checked.')")) === true,
        "checked save result",
      );
      await check(
        "window.syntheticBackfill.dates().join(',')==='2025-12-31,2026-01-31' && window.syntheticBackfill.pending()===null",
        "checked save reads back both statements",
      );
      await check("document.querySelector('.notice-success button').disabled", "restore needs explicit consent");
      await evaluate("document.querySelector('.notice-success input[type=checkbox]').click()");
      await click("Restore the history from before this change");
      await waitFor(
        async () => (await evaluate("document.body.innerText.includes('Do not submit this change again')")) === true,
        "uncertain restore outcome",
      );
      await check("window.syntheticBackfill.pending()!==null", "unknown restore retains a receipt");
      await click("Check what happened");
      await waitFor(
        async () =>
          (await evaluate("document.body.innerText.includes('The previous history was restored and checked.')")) ===
          true,
        "checked recovery result",
      );
      await check(
        "window.syntheticBackfill.dates().join(',')==='2026-01-31' && window.syntheticBackfill.pending()===null",
        "recovery restores the original history and clears the receipt",
      );
    },
    Number(process.env["FOLIODASH_BACKFILL_AUDIT_PORT"] ?? 4198),
    "config/vite.backfill-audit.config.ts",
  );
  console.log(`Synthetic rendered backfill recovery passed: ${String(assertions)} assertions.`);
} finally {
  rmSync(html, { force: true });
  rmSync(bundle, { force: true });
  rmSync(stylesheet, { force: true });
}
