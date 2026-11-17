// Runs the real Preact expenses view and ExpenseSession against FakeGoogle, never a live account.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { withLocalBrowser } from "../lib/local-browser.ts";

const directory = resolve("dist/acceptance/expense-audit");
const html = resolve(directory, "index.html");
const bundle = resolve(directory, "synthetic-expense-audit.js");
const stylesheet = resolve(directory, "styles.css");
let assertions = 0;
if ([html, bundle, stylesheet].some(existsSync))
  throw new Error("The synthetic harness destination is already in use.");
mkdirSync(directory, { recursive: true });
try {
  execFileSync(
    "node_modules/.bin/esbuild",
    [
      "tests/fixtures/expense-browser.ts",
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
  if (stylesheetPath === undefined) throw new Error("Build the app before running the synthetic expense audit.");
  copyFileSync(resolve("dist/web", stylesheetPath), stylesheet);
  writeFileSync(
    html,
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="./styles.css"><title>Synthetic expense recovery test</title></head><body><div class="shell"><main class="content-inner" id="root"></main></div><script type="module" src="./synthetic-expense-audit.js"></script></body></html>',
  );
  await withLocalBrowser(
    async ({ origin, call, evaluate, waitFor }) => {
      const check = async (expression: string, label: string): Promise<void> => {
        if ((await evaluate(expression)) !== true) throw new Error(`Expense recovery: ${label}`);
        assertions++;
      };
      const text = (value: string): string => `document.body.innerText.includes(${JSON.stringify(value)})`;
      const click = async (label: string): Promise<void> => {
        if (
          (await evaluate(
            `[...document.querySelectorAll('button')].some(button=>button.textContent.trim()===${JSON.stringify(label)})`,
          )) !== true
        )
          throw new Error(
            `No button named "${label}"; found: ${String(await evaluate("[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).join(' | ')"))}`,
          );
        await evaluate(
          `[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)}).click()`,
        );
      };
      await call("Page.navigate", { url: `${origin}/` });
      await waitFor(
        async () =>
          (await evaluate(
            "!!document.querySelector('.expense-save-button') || document.body.innerText.includes('Synthetic setup error:')",
          )) === true,
        "synthetic expense form",
      );
      const setupError = await evaluate(
        "document.body.innerText.includes('Synthetic setup error:') ? document.body.innerText : ''",
      );
      if (typeof setupError === "string" && setupError !== "") throw new Error(setupError);

      // A refusal known not to have committed keeps the draft and allows another attempt.
      await evaluate("window.syntheticExpenses.refuseNextWrite()");
      await click("No costs today");
      await click("Save day");
      await waitFor(async () => (await evaluate(text("Google refused this save"))) === true, "refused save message");
      await check(
        "window.syntheticExpenses.commands()===0 && !window.syntheticExpenses.pending()",
        "a refused save records nothing and leaves no unknown receipt",
      );
      await check(
        "![...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Check save outcome')",
        "a refused save offers no outcome check",
      );
      await check(
        "!document.querySelector('.expense-save-button').disabled",
        "the draft can be saved again after a refusal",
      );

      // A lost answer is unknown: the entry is held and only the original save is checked.
      await evaluate("window.syntheticExpenses.loseAnswerAndFirstCheck()");
      await click("Save day");
      await waitFor(
        async () =>
          (await evaluate(
            "[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Check save outcome')",
          )) === true,
        "unknown save outcome",
      );
      await check("window.syntheticExpenses.pending()===true", "an unknown save retains a receipt");
      await check(
        "[...document.querySelectorAll('.expense-week-list button')].every(button=>button.disabled)",
        "days are locked while the outcome is unknown",
      );
      const appendsBefore = await evaluate("window.syntheticExpenses.appends()");
      await click("Check save outcome");
      await waitFor(
        async () =>
          (await evaluate(text("Saved to your Google Sheet.") + "||" + text("Your entry is saved."))) === true,
        "checked save result",
      );
      await check(
        "window.syntheticExpenses.commands()===1 && window.syntheticExpenses.pending()===false",
        "the lost answer is confirmed once, without a second write",
      );
      await check(
        "![...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Check save outcome')",
        "the outcome check disappears once settled",
      );
      await check(
        `window.syntheticExpenses.appends()===${String(appendsBefore)}`,
        "the check read the original without appending again",
      );

      // Two devices write the same day: neither version replaces the other until the owner resolves it.
      await waitFor(
        async () => (await evaluate("!document.body.innerText.includes('Check original save')")) === true,
        "settled save notice leaving",
      );
      await click("Show amounts to edit");
      await waitFor(
        async () =>
          (await evaluate(
            "!!document.getElementById('expense-0') && !document.getElementById('expense-0').readOnly",
          )) === true,
        "editable day",
      );
      // The as-it-comes journey: adding to a blank category on a recorded day is an addition, saved in one step without a correction review.
      await evaluate(
        "(()=>{const input=document.getElementById('expense-3');input.value='12,50';input.dispatchEvent(new Event('input',{bubbles:true}))})()",
      );
      await check(
        "[...document.querySelectorAll('.expense-save-button')].some(button=>button.textContent.trim()==='Save added expenses')",
        "filling a blank category offers Save added expenses, not a correction",
      );
      await click("Save added expenses");
      await waitFor(
        async () =>
          (await evaluate(text("Saved to your Google Sheet.") + "||" + text("Your entry is saved."))) === true,
        "added expense saved",
      );
      await check(
        "!document.querySelector('.expense-review') && window.syntheticExpenses.commands()===2",
        "an addition saves directly with no review step",
      );
      await waitFor(
        async () => (await evaluate("!document.body.innerText.includes('Check original save')")) === true,
        "settled addition notice leaving",
      );
      await click("Show amounts to edit");
      await waitFor(
        async () =>
          (await evaluate(
            "!!document.getElementById('expense-0') && !document.getElementById('expense-0').readOnly",
          )) === true,
        "editable day after addition",
      );
      await evaluate("window.syntheticExpenses.raceFromAnotherDevice()");
      await evaluate(
        "(()=>{const input=document.getElementById('expense-0');input.value='5,00';input.dispatchEvent(new Event('input',{bubbles:true}))})()",
      );
      await click("Review correction");
      await waitFor(
        async () => (await evaluate(text("Review your correction"))) === true,
        "correction review before the race",
      );
      await click("Confirm correction");
      await waitFor(async () => (await evaluate(text("also changed on another device"))) === true, "conflict message");
      await check(
        "window.syntheticExpenses.conflicts()===1 && window.syntheticExpenses.pending()===false",
        "a collision is a known conflict, not an unknown outcome",
      );
      await check("window.syntheticExpenses.commands()===4", "both versions are kept in history");
      await check(text("Conflicting versions"), "the day is labelled as conflicting");
      await check(
        "[...document.querySelectorAll('.expense-entry-card input[type=text], #expense-0')].every(input=>input.disabled)",
        "entry fields are locked until a version is chosen",
      );
      await check(
        "!!document.querySelector('.notice-warning') && !![...document.querySelectorAll('.expense-conflict details')].length",
        "the conflict list shows both saved versions",
      );
      await check(
        "[...document.querySelectorAll('.expense-conflict')].length===1 && document.querySelectorAll('.expense-conflict details').length===2",
        "exactly two versions are offered",
      );
      await evaluate("document.querySelector('.expense-conflict details').open=true");
      await check(
        "[...document.querySelectorAll('.expense-conflict button')].every(button=>button.disabled)",
        "versions cannot be reviewed over an unsaved draft",
      );
      await click("Discard draft");
      await check(
        "[...document.querySelectorAll('.expense-conflict button')].every(button=>!button.disabled)",
        "discarding the draft allows a version to be reviewed",
      );
      await click("Review this version");
      await waitFor(
        async () => (await evaluate(text("Review these amounts, then save the correction"))) === true,
        "version review",
      );
      await waitFor(
        async () =>
          (await evaluate(
            "!!document.getElementById('expense-0') && !document.getElementById('expense-0').disabled",
          )) === true,
        "unlocked editor",
      );
      await check(
        "!document.getElementById('expense-0').disabled",
        "choosing a version unlocks the editor for a resolving correction",
      );
      await click("Save resolution");
      await waitFor(
        async () => (await evaluate(text("Resolve these conflicting versions?"))) === true,
        "resolution review",
      );
      await check("window.syntheticExpenses.conflicts()===1", "review alone does not resolve the conflict");
      await click("Confirm correction");
      await waitFor(
        async () => (await evaluate("window.syntheticExpenses.conflicts()===0")) === true,
        "resolved conflict",
      );
      await check(
        "window.syntheticExpenses.commands()===5 && !window.syntheticExpenses.pending()",
        "resolution is one new revision and earlier versions remain",
      );
      await check("!document.querySelector('.expense-conflict')", "the conflict card clears once resolved");
    },
    Number(process.env["FOLIODASH_EXPENSE_AUDIT_PORT"] ?? 4199),
    "config/vite.expense-audit.config.ts",
  );
  console.log(`Synthetic rendered expense recovery passed: ${String(assertions)} assertions.`);
} finally {
  rmSync(html, { force: true });
  rmSync(bundle, { force: true });
  rmSync(stylesheet, { force: true });
}
