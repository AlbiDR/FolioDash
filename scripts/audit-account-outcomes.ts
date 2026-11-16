// Runs the real Your data screen and Session against FakeGoogle, never a live account.
import { runSyntheticJourney } from "./syntheticHarness.ts";

const assertions = await runSyntheticJourney({
  name: "Your data outcomes",
  entry: "tests/fixtures/AccountBrowser.ts",
  directory: "dist/acceptance/account-audit",
  port: Number(process.env["FOLIODASH_ACCOUNT_AUDIT_PORT"] ?? 4202),
  config: "config/vite.account-audit.config.ts",
  readySelector: "#account-connection-heading",
  run: async ({ evaluate, waitFor, check, click, text, call }) => {
    const seen = async (value: string, label: string): Promise<void> => { await waitFor(async () => await evaluate(text(value)) === true, label); };
    const idle = async (): Promise<void> => { await waitFor(async () => await evaluate("document.querySelector('.status')?.getAttribute('data-busy')==='false'") === true, "idle screen"); };

    // Signed out: nothing exists until the owner chooses to connect.
    await check("window.syntheticAccount.mode()==='signed-out'", "starts signed out");
    await check("!document.querySelector('#account-health-heading') && !document.querySelector('#account-maintenance-heading')", "verification and maintenance are absent while signed out");
    await click("Continue with Google");
    await seen("Your Google Sheet is ready", "created sheet");
    await check("window.syntheticAccount.mode()==='online' && window.syntheticAccount.workbookExists()", "connecting creates one workbook and goes online");
    await evaluate("window.syntheticAccount.addStatement()");
    await waitFor(async () => await evaluate("window.syntheticAccount.statements()===1") === true, "saved statement");

    // Sync, verify and organize report their own outcomes.
    // Settings rows: on a wide screen the action is a compact control beside its title; on a phone it stays a full-width action.
    await call("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await check("(()=>{const rows=['.account-health','.account-maintenance'].map(selector=>{const section=document.querySelector(selector);const button=section.querySelector(':scope > button').getBoundingClientRect();const title=section.querySelector(':scope > .card-title').getBoundingClientRect();const sentence=section.querySelector(':scope > .card-subtitle').getBoundingClientRect();const box=section.getBoundingClientRect();return button.width<320&&button.top<sentence.bottom&&button.bottom>title.top&&box.right-button.right<4});return rows.every(Boolean)})()", "Your data actions are compact controls beside their titles on a wide screen");
    await check("(()=>{const forget=[...document.querySelectorAll('.account-section > button')].find(button=>button.textContent.trim()==='Forget this device');return !!forget&&forget.getBoundingClientRect().width<320})()", "Forget this device is a compact control, not a bar");
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await check("(()=>{const button=document.querySelector('.account-health > button').getBoundingClientRect();return button.width>250})()", "on a phone the Your data action stays full width");
    await call("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
    await idle();
    await click("Sync now");
    await seen("Already up to date", "sync result");
    await click("Check my history");
    await seen("Saved records are valid", "verification result");
    await check("document.querySelector('.account-health .notice-success, .account-health .review-adjustments')!==null", "a valid history is reported as a success");
    await click("Organize spreadsheet");
    await seen("Spreadsheet organized", "organization result");
    await idle();

    // A refused session is a known non-write: the saved copy stays, and the next step is to reconnect.
    await evaluate("window.syntheticAccount.refuseNextRead()");
    await click("Sync now");
    await seen("Reconnect to Google", "refused session");
    await check("window.syntheticAccount.statements()===1", "a refused sync leaves the saved copy untouched");
    await check("[...document.querySelectorAll('button')].some(button=>button.textContent.includes('Reconnect with Google'))", "a refused sync offers reconnecting");
    await idle();
    await click("Reconnect with Google");
    await seen("Already up to date", "reconnected");

    // A lost connection says so, keeps the copy and offers a way back.
    await evaluate("window.syntheticAccount.loseNextRead()");
    await click("Sync now");
    await seen("Could not reach your Google Sheet", "lost connection");
    await check("window.syntheticAccount.statements()===1 && document.body.innerText.includes('Your saved copy was not changed.')", "a lost connection keeps the saved copy and says so");
    await idle();

    // Maintenance with a lost answer is not claimed as done.
    await evaluate("window.syntheticAccount.loseNextWrite()");
    await click("Organize spreadsheet");
    await seen("Organization not confirmed", "unconfirmed organization");
    await check("window.syntheticAccount.statements()===1", "an unconfirmed organization leaves the portfolio history alone");
    await idle();

    // The Google workbook vanishes: the device copy is offered back only with explicit consent.
    await evaluate("window.syntheticAccount.deleteWorkbook()");
    await click("Sync now");
    await waitFor(async () => await evaluate("window.syntheticAccount.sheet()==='missing'") === true, "missing workbook noticed");
    await idle();
    await seen("Restore your Google Sheet", "restore offer");
    await seen("Your sheet cannot be opened.", "why restore is offered");
    await check("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Restore from this device').disabled", "restore stays disabled until confirmed");
    await check("window.syntheticAccount.statements()===1", "the device copy is kept while the sheet is missing");
    await evaluate("document.querySelector('.card input[type=checkbox]').click()");
    await check("![...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Restore from this device').disabled", "confirmation enables restore");
    await click("Restore from this device");
    await seen("Your Google Sheet was restored", "restored sheet");
    await check("window.syntheticAccount.workbookExists() && window.syntheticAccount.sheet()==='ok' && window.syntheticAccount.statements()===1", "restore writes a new workbook, reads it back and keeps the history");
    await check("!document.body.innerText.includes('Restore your Google Sheet')", "the restore offer clears once the sheet is healthy");
    await idle();

    // Forgetting is a confirmed, reversible-until-chosen step that leaves Google untouched.
    const googleBefore = await evaluate("window.syntheticAccount.googleWorkbooks()");
    await click("Forget this device");
    await seen("Forget this device?", "forget confirmation");
    await click("Keep it");
    await check("window.syntheticAccount.mode()==='online' && window.syntheticAccount.statements()===1", "keeping the device changes nothing");
    await click("Forget this device");
    await click("Yes, forget this device");
    await seen("This device was forgotten", "forgotten device");
    await check("window.syntheticAccount.mode()==='signed-out' && window.syntheticAccount.statements()===0", "forgetting clears this device");
    await check(`window.syntheticAccount.googleWorkbooks()===${String(googleBefore)} && ${String(googleBefore)}>0`, "forgetting leaves the Google workbook in place");
    await check("document.body.innerText.includes('Your Google Sheet is unchanged.')", "forgetting says the Google Sheet is unchanged");
  },
}).then(count => count);
console.log(`Synthetic rendered Your data outcomes passed: ${String(assertions)} assertions.`);
