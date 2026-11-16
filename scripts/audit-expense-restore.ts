// Runs the real expense data tools and ExpenseSession against FakeGoogle, never a live account.
import { runSyntheticJourney } from "./syntheticHarness.ts";

const assertions = await runSyntheticJourney({
  name: "Expense restore",
  entry: "tests/fixtures/ExpenseRestoreBrowser.ts",
  directory: "dist/acceptance/expense-restore-audit",
  port: Number(process.env["FOLIODASH_EXPENSE_RESTORE_AUDIT_PORT"] ?? 4200),
  config: "config/vite.expense-restore-audit.config.ts",
  readySelector: "#expense-data-heading",
  run: async ({ evaluate, waitFor, check, click, text }) => {
    await evaluate("document.querySelector('.more details').open=true");

    // A damaged backup is refused before anything is previewed or written.
    await evaluate("window.syntheticRestore.chooseBackup(window.syntheticRestore.corruptedBackup())");
    await waitFor(async () => await evaluate(text("failed its format, history or checksum checks")) === true, "damaged backup refusal");
    await check("!document.querySelector('.review-adjustments') && window.syntheticRestore.commands()===0 && window.syntheticRestore.writes()===0", "a damaged backup offers no restore and writes nothing");

    // A valid backup is previewed first; choosing it writes nothing and restore needs explicit consent.
    await evaluate("window.syntheticRestore.chooseBackup()");
    await waitFor(async () => await evaluate(text("1 recorded days, 1 saved entries and corrections")) === true, "backup preview");
    await check("window.syntheticRestore.writes()===0 && window.syntheticRestore.commands()===0", "previewing a backup writes nothing");
    await check("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Restore expense history').disabled", "restore stays disabled until confirmed");
    await evaluate("document.querySelector('.review-adjustments input[type=checkbox]').click()");
    await check("![...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Restore expense history').disabled", "confirmation enables restore");

    // A lost answer is unknown: restore cannot be submitted again; only the original is checked.
    await evaluate("window.syntheticRestore.loseAnswerAndFirstCheck()");
    await click("Restore expense history");
    await waitFor(async () => await evaluate("[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Check original recovery or save')") === true, "unknown restore outcome");
    await check("window.syntheticRestore.pending()===true", "an unknown restore retains a receipt");
    await check("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Restore expense history').disabled && document.querySelector('input[type=file]').disabled", "an unknown restore blocks resubmission and choosing another backup");
    await click("Check original recovery or save");
    await waitFor(async () => await evaluate(text("The original operation is confirmed and your expense records are checked.")) === true, "checked restore result");
    await check("window.syntheticRestore.commands()===1 && window.syntheticRestore.pending()===false", "the checked restore holds the backed-up history and clears the receipt");
    await check("window.syntheticRestore.recoveryBatches()===1", "checking the original did not submit the recovery again");
    await check("!document.querySelector('.review-adjustments') && ![...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Check original recovery or save')", "the recovery controls clear once settled");
  },
}).then(count => count);
console.log(`Synthetic rendered expense restore passed: ${String(assertions)} assertions.`);
