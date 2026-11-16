// Runs the real checkpoint screen and CheckpointSession against FakeGoogle in a browser, never a live account.
import { runSyntheticJourney } from "./syntheticHarness.ts";

const assertions = await runSyntheticJourney({
  name: "Checkpoints",
  entry: "tests/fixtures/CheckpointsBrowser.ts",
  directory: "dist/acceptance/checkpoints-audit",
  port: Number(process.env["FOLIODASH_CHECKPOINTS_AUDIT_PORT"] ?? 4201),
  config: "config/vite.checkpoints-audit.config.ts",
  readySelector: ".checkpoint-form",
  run: async ({ evaluate, waitFor, check, click, text }) => {
    const set = async (selector: string, value: string): Promise<void> => {
      await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    };
    const amount = ".checkpoint-form input[inputmode=decimal]";
    const note = ".checkpoint-form input[maxlength]";
    const enabled = "!document.querySelector('.checkpoint-form button[type=submit]').disabled";

    // The enabled form: an invalid amount is refused before anything is sent.
    await waitFor(async () => await evaluate(enabled) === true, "the checkpoint form enabled once the log is read");
    await set(amount, "not an amount");
    await click("Save checkpoint");
    await waitFor(async () => await evaluate(text("positive amount in Italian notation")) === true, "an invalid amount is explained");
    await check("window.syntheticCheckpoints.appends()===0", "an invalid amount sends nothing");

    // A valid checkpoint is saved, read back and listed; no receipt is left behind.
    await set(amount, "12.345,67");
    await set(note, "after bonus");
    await click("Save checkpoint");
    await waitFor(async () => await evaluate(text("Checkpoint saved.")) === true, "a saved checkpoint is confirmed");
    await check("document.querySelectorAll('.checkpoint-list > li').length===1 && window.syntheticCheckpoints.remoteCommands()===1 && !window.syntheticCheckpoints.receipt()", "the checkpoint is listed and in Google, with no receipt left");
    await check("document.querySelector('.checkpoint-list').textContent.includes('after bonus')", "the note is shown");

    // Several checkpoints on one date are all listed.
    await set(amount, "12.400,00");
    await click("Save checkpoint");
    await waitFor(async () => await evaluate("document.querySelectorAll('.checkpoint-list > li').length===2") === true, "a second checkpoint on the same date is listed");

    // Withdrawing asks first, Keep changes nothing, Withdraw removes it from the list and keeps it in the log.
    await evaluate("document.querySelector('.checkpoint-list > li button.quiet-action').click()");
    await check("!!document.querySelector('.checkpoint-confirm') && [...document.querySelectorAll('.checkpoint-confirm button')].map(b=>b.textContent.trim()).join()==='Withdraw,Keep'", "withdrawing asks for confirmation");
    await click("Keep");
    await check("!document.querySelector('.checkpoint-confirm') && document.querySelectorAll('.checkpoint-list > li').length===2 && window.syntheticCheckpoints.remoteCommands()===2", "Keep changes nothing");
    await evaluate("document.querySelector('.checkpoint-list > li button.quiet-action').click()");
    await evaluate("[...document.querySelectorAll('.checkpoint-confirm button')].find(b=>b.textContent.trim()==='Withdraw').click()");
    await waitFor(async () => await evaluate("document.querySelectorAll('.checkpoint-list > li').length===1 && window.syntheticCheckpoints.remoteCommands()===3") === true, "a withdrawn checkpoint leaves the list and stays in the log");

    // Privacy hides the amounts in the list at once.
    await evaluate("window.syntheticCheckpoints.setHidden(true)");
    await check("!!document.querySelector('.checkpoint-list .amount.masked')", "hiding amounts masks the list");
    await evaluate("window.syntheticCheckpoints.setHidden(false)");

    // A lost answer is unknown: nothing else can be saved, checking only reads, and the original is never resent.
    await evaluate("window.syntheticCheckpoints.loseNextAppend()");
    await set(amount, "12.500,00");
    await click("Save checkpoint");
    await waitFor(async () => await evaluate("[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Check outcome')") === true, "an unknown save offers Check outcome");
    await check("window.syntheticCheckpoints.receipt() && !!document.querySelector('.checkpoint-form button[type=submit]').disabled", "an unknown save keeps a receipt and blocks other saves");
    await check("(document.querySelector('.checkpoint-pending')?.textContent ?? '').includes('12.500') && (document.querySelector('.checkpoint-pending')?.textContent ?? '').includes('Save of')", "the unconfirmed save is described, not only counted");
    const sent = await evaluate("window.syntheticCheckpoints.appends()");
    await click("Check outcome");
    await waitFor(async () => await evaluate(text("not visible in Google yet")) === true || await evaluate(text("could not be checked")) === true, "checking while it is still missing stays unknown");
    await check(`window.syntheticCheckpoints.appends()===${String(sent)} && window.syntheticCheckpoints.receipt()`, "checking never resends and keeps the receipt");
    // A page reload keeps the unresolved save and still blocks writes.
    await evaluate("window.syntheticCheckpoints.reload()");
    await waitFor(async () => await evaluate("[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Check outcome')") === true, "the unresolved save survives a reload");
    await check("!!document.querySelector('.checkpoint-form button[type=submit]').disabled", "writes stay blocked after the reload");
    // The delayed command arrives and the check resolves it.
    await evaluate("window.syntheticCheckpoints.deliverPending()");
    await click("Check outcome");
    await waitFor(async () => await evaluate(`${enabled} && !window.syntheticCheckpoints.receipt()`) === true, "the confirmed save clears the receipt and unblocks the form");
    await check("document.querySelectorAll('.checkpoint-list > li').length===2", "the delayed checkpoint is listed once");

    // A refusal before any write clears itself and leaves the form usable.
    await evaluate("window.syntheticCheckpoints.refuseNextAppend()");
    await set(amount, "12.600,00");
    await click("Save checkpoint");
    await waitFor(async () => await evaluate(text("Google refused this save")) === true, "a refused save is explained");
    await check(`!window.syntheticCheckpoints.receipt() && ${enabled}`, "a refusal leaves no receipt and the form enabled");

    // A receipt that cannot be read blocks every write and is left untouched.
    await evaluate("window.syntheticCheckpoints.loseNextAppend()");
    await set(amount, "12.700,00");
    await click("Save checkpoint");
    await waitFor(async () => await evaluate("window.syntheticCheckpoints.receipt()") === true, "another unknown save");
    await evaluate("window.syntheticCheckpoints.corruptReceipt()");
    await evaluate("window.syntheticCheckpoints.reload()");
    await waitFor(async () => await evaluate(text("could not be read, so nothing can be saved")) === true, "an unreadable receipt is reported");
    await check("!!document.querySelector('.checkpoint-form button[type=submit]').disabled", "an unreadable receipt blocks saving");

    // A missing log is reported and nothing is recreated; the device copy stays listed.
    await evaluate("window.localStorage.removeItem('foliodash.synthetic-acceptance.checkpoints.pending.v1:' + 'workbook-1')");
    await evaluate("window.syntheticCheckpoints.deleteLog()");
    await evaluate("window.syntheticCheckpoints.reload()");
    await waitFor(async () => await evaluate("document.querySelectorAll('.checkpoint-list > li').length>=1") === true, "the device copy is still listed after the log is deleted");
    await check("!!document.querySelector('.checkpoint-form button[type=submit]').disabled", "a missing log blocks saving and is not recreated");

    // Recovery to a different workbook preserves the old copy read only and never restores it.
    await evaluate("window.syntheticCheckpoints.switchWorkbook()");
    await waitFor(async () => await evaluate("!!document.querySelector('.checkpoint-preserved')") === true, "the old workbook's checkpoints are kept");
    await check("!!document.querySelector('.checkpoint-preserved textarea[readonly]') && document.querySelector('.checkpoint-preserved textarea').value.includes('12.345,67'.replace('.','').replace(',','.'))", "the preserved list is read only and copyable as text");
    // The kept copy is shown at once; the replacement workbook becomes writable when its own log has been read.
    await waitFor(async () => await evaluate(`${enabled} && document.querySelectorAll('.card:not(.checkpoint-preserved) .checkpoint-list > li').length===0`) === true, "the replacement workbook starts with no checkpoints and can be written");
    // With amounts hidden, the preserved text and the copy leave the amounts out.
    await evaluate("window.syntheticCheckpoints.setHidden(true)");
    await check("!!document.querySelector('.checkpoint-preserved .amount.masked') && !/\\d{2}\\.\\d{2}/.test(document.querySelector('.checkpoint-preserved textarea').value) && document.querySelector('.checkpoint-preserved textarea').value.includes('hidden')", "hidden amounts are left out of the preserved text too");
    // Forgetting this device (as another window may) discards what was being typed, not only the stored data.
    await waitFor(async () => await evaluate("!document.querySelector('.checkpoint-form input[type=text]').disabled") === true, "the replacement workbook's form is writable");
    await set(amount, "99,00");
    await set(note, "private note");
    await check(`document.querySelector(${JSON.stringify(amount)}).value==='99,00'`, "a draft is on screen");
    await evaluate("window.syntheticCheckpoints.forgetDevice()");
    await waitFor(async () => await evaluate(`document.querySelector(${JSON.stringify(amount)}).value===''`) === true, "forgetting the device discards the amount being typed");
    await check(`document.querySelector(${JSON.stringify(note)}).value==='' && !document.body.innerText.includes('private note')`, "forgetting the device discards the note being typed");
  },
}).then((count) => count);
console.log(`Synthetic rendered checkpoints passed: ${String(assertions)} assertions.`);
