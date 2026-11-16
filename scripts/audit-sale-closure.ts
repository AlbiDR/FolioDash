// Runs the real cash-question step against a synthetic ledger, never a live account.
import { runSyntheticJourney } from "./syntheticHarness.ts";

const assertions = await runSyntheticJourney({
  name: "Sale and reopening",
  entry: "tests/fixtures/SaleBrowser.ts",
  directory: "dist/acceptance/sale-audit",
  port: Number(process.env["FOLIODASH_SALE_AUDIT_PORT"] ?? 4201),
  config: "config/vite.sale-audit.config.ts",
  readySelector: ".fund-question",
  run: async ({ evaluate, waitFor, check, click, text }) => {
    const type = async (selector: string, value: string): Promise<void> => {
      await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    };
    const choose = async (selector: string): Promise<void> => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
    await check("document.querySelectorAll('.fund-question').length===4", "all four funds are asked about");

    // Nothing is recorded until every branch has its own explicit answer.
    await click("Confirm and record this statement");
    await check("!window.syntheticSale.recorded() && !!document.querySelector('[role=alert]')", "unanswered sale, zero and reopening questions block recording");
    await check(text("Confirm whether you sold all of this fund"), "a missing fund must be confirmed sold or still held");
    await check(text("This fund was closed and now has value again. Confirm that it is held again."), "a returning fund must be confirmed held again");

    // Full sale: the proceeds are required; an explicit zero is a real answer.
    await choose('input[type=radio][name$="-sold-US0378331005"]:first-of-type');
    await check("!!document.querySelector('[id$=\"sale-proceeds-US0378331005\"]')", "choosing a full sale asks for the total received");
    await click("Confirm and record this statement");
    await check(text("Enter the total money received from selling this fund, not just the profit"), "a sale without proceeds is refused");
    await type('[id$="sale-proceeds-US0378331005"]', "0");

    // Zero value: keeping it active is the default; closing it asks for proceeds and drops the money-movement fields.
    await check("document.querySelector('input[type=radio][name$=\"-zero-AU0000XVGZA3\"]:checked').parentElement.textContent.includes('Keep it active at zero')", "a zero-value fund defaults to staying active");
    await choose('input[type=radio][name$="-zero-AU0000XVGZA3"]:not(:checked)');
    await check("!!document.querySelector('[id$=\"sale-proceeds-AU0000XVGZA3\"]')", "closing a zero-value fund asks for the total received");
    await type('[id$="sale-proceeds-AU0000XVGZA3"]', "120,00");

    // Reopening is an explicit confirmation, then the shared money question applies.
    await choose('input[type=checkbox][id], fieldset input[type=checkbox]');
    await choose('input[type=radio][name$="-money-moved"]:not(:checked)');
    await check("document.querySelectorAll('.fund-question input[id*=\"-in-\"]').length>0", "money moved asks reopened and held funds for amounts");
    await choose('input[type=radio][name$="-money-moved"]:not(:checked)');
    await waitFor(async () => await evaluate("document.querySelectorAll('.fund-question input[id*=\"-in-\"]').length===0") === true, "money fields leaving");
    await check("document.querySelector('input[type=radio][name$=\"-money-moved\"]:checked').parentElement.textContent.includes('No money moved')", "no money moved removes those fields");

    // Recording: every branch becomes the right command, and the zero-value or sold funds close with their proceeds.
    await check("!window.syntheticSale.recorded()", "answers alone record nothing");
    await click("Confirm and record this statement");
    await waitFor(async () => await evaluate("window.syntheticSale.recorded()") === true, "recorded statement");
    const march = "JSON.stringify(window.syntheticSale.march())";
    await check(`${march}.includes('"US0378331005":{"action":"Close","status":"closed","value":0,"moneyOut":0,"moneyIn":0}')`, "a fully sold fund closes with an explicit zero of proceeds");
    await check(`${march}.includes('"AU0000XVGZA3":{"action":"Close","status":"closed","value":0,"moneyOut":12000,"moneyIn":0}')`, "a zero-value fund closed as sold records its proceeds");
    await check(`${march}.includes('"US5949181045":{"action":"Reopen","status":"active","value":50000')`, "a returning fund is reopened and active");
    await check(`${march}.includes('"US0231351067":{"action":"Keep","status":"active"')`, "a continuing fund stays active");
  },
}).then(count => count);
console.log(`Synthetic rendered sale and reopening passed: ${String(assertions)} assertions.`);
