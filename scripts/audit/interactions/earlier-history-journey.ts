// Earlier history journey on a synthetic checked device copy.
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import type { JourneyContext } from "./browser-steps.ts";

export async function earlierHistoryJourney({
  call,
  evaluate,
  waitFor,
  check,
  visit,
  survey,
}: JourneyContext): Promise<void> {
  // Use a synthetic checked device copy to exercise earlier-history review without Google writes.
  await visit("import");
  const funds = [
    { isin: "US0378331005", name: "Synthetic Fund A", fullName: "Synthetic Fund A", firstDate: "2026-01-31" },
    { isin: "AU0000XVGZA3", name: "Synthetic Fund B", fullName: "Synthetic Fund B", firstDate: "2026-01-31" },
  ];
  const holdings = (action: string) =>
    Object.fromEntries(
      funds.map((fund) => [
        fund.isin,
        {
          value: 100000,
          netInvested: 100000,
          moneyIn: 0,
          moneyOut: 0,
          status: "active",
          action,
          cashVerified: true,
          comment: "",
        },
      ]),
    );
  const ledger = {
    revision: "synthetic-revision",
    funds,
    snapshots: [
      { date: "2026-01-31", fundsSubtotal: 200000, holdings: holdings("Start") },
      { date: "2026-02-28", fundsSubtotal: 200000, holdings: holdings("Keep") },
    ],
  };
  const syntheticCopy = {
    version: 1,
    workbook: { id: "synthetic-audit", url: "https://example.invalid/synthetic-audit" },
    ledger,
    syncedAt: 1,
  };
  await evaluate(`localStorage.setItem('foliodash.ledger.v1',${JSON.stringify(JSON.stringify(syntheticCopy))})`);
  // A release build has a Google client ID and prepares sign-in for a remembered
  // workbook. This offline fixture never signs in or saves to Google.
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "window.google={accounts:{oauth2:{initTokenClient:()=>({requestAccessToken:()=>{throw new Error('Synthetic audit must not sign in')}})}}}",
  });
  await call("Page.reload", { ignoreCache: true });
  await waitFor(
    async () =>
      (await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Add earlier history')")) ===
      true,
    "earlier history entry",
  );
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Add earlier history').click()");
  await waitFor(
    async () => (await evaluate("!!document.querySelector('#backfill-date')")) === true,
    "earlier history form",
  );
  await survey("Earlier history / manual values / desktop");
  await evaluate("document.querySelector('#backfill-add-fund').click()");
  await waitFor(
    async () => (await evaluate("document.activeElement?.id==='backfill-name-2'")) === true,
    "focus on the added fund",
  );
  await evaluate("document.querySelector('[aria-label=\"Remove fund 2 from this draft\"]').click()");
  await waitFor(
    async () => (await evaluate("document.activeElement?.id==='backfill-name-1'")) === true,
    "focus after removing a fund",
  );
  await check(
    "document.querySelectorAll('.backfill-entry .manual-fund').length===1",
    "Earlier history: adding and removing a draft fund restores focus",
  );
  await evaluate(
    `(()=>{const entries={'backfill-date':'2025-11-30','backfill-name-1':'Synthetic Fund A','backfill-isin-1':'US0378331005','backfill-value-1':'1.000,00'};for(const [id,value] of Object.entries(entries)){const n=document.getElementById(id);n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}))}})()`,
  );
  await delay(100);
  await evaluate("document.querySelector('.manual-entry form').requestSubmit()");
  await waitFor(
    async () => (await evaluate("!!document.querySelector('.questions input[type=text]')")) === true,
    "earlier opening review",
  );
  await evaluate(
    "(()=>{const n=document.querySelector('.questions input[type=text]');n.value='1.000,00';n.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await delay(100);
  await evaluate(
    "[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()",
  );
  await waitFor(
    async () => (await evaluate("document.body.innerText.includes('Earlier month reviewed')")) === true,
    "earlier month accepted",
  );
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent==='Add another earlier month').click()",
  );
  await evaluate("document.querySelectorAll('input[name=backfill-method]')[1].click()");
  await waitFor(
    async () => (await evaluate("!!document.querySelector('#backfill-file')")) === true,
    "earlier Excel file input",
  );
  const backfillDoc = await call("DOM.getDocument");
  const backfillFile = await call("DOM.querySelector", {
    nodeId: (backfillDoc["root"] as { nodeId: number }).nodeId,
    selector: "#backfill-file",
  });
  await call("DOM.setFileInputFiles", {
    nodeId: backfillFile["nodeId"],
    files: [resolve("dist/acceptance/onboarding/individual/synthetic-bank-2026-01-31.xlsx")],
  });
  await waitFor(
    async () => (await evaluate("document.body.innerText.includes('Statement ready:')")) === true,
    "earlier Excel statement read",
  );
  await survey("Earlier history / Excel selection / desktop");
  await evaluate(
    "(()=>{const n=document.querySelector('#backfill-date');n.value='2025-12-31';n.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await delay(100);
  await evaluate("document.querySelector('.manual-entry form').requestSubmit()");
  await waitFor(
    async () => (await evaluate("!!document.querySelector('.questions .choice input')")) === true,
    "earlier Excel movements",
  );
  await evaluate("document.querySelectorAll('.questions .choice input')[1].click()");
  await evaluate(
    "(()=>{const n=document.querySelector('.fund-question input[id$=\"-in-AU0000XVGZA3\"]');n.value='1.000,00';n.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await delay(100);
  await evaluate(
    "[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()",
  );
  await waitFor(
    async () => (await evaluate("document.body.innerText.includes('Earlier month reviewed')")) === true,
    "earlier Excel month accepted",
  );
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent==='Review movements to first saved month').click()",
  );
  await waitFor(
    async () => (await evaluate("!!document.querySelector('.questions .choice input')")) === true,
    "earlier boundary review",
  );
  await evaluate("document.querySelectorAll('.questions .choice input')[1].click()");
  await delay(100);
  await evaluate(
    "[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()",
  );
  await waitFor(
    async () => (await evaluate("document.body.innerText.includes('Review changes before saving')")) === true,
    "earlier history preview",
  );
  await check(
    "document.querySelector('.summary table')?.rows.length===3",
    "Earlier history: the preview includes both saved months",
  );
  await evaluate("document.querySelector('.summary details').open=true");
  await check(
    "document.querySelector('.summary details table')?.textContent.includes('Synthetic Fund A')",
    "Earlier history: the preview exposes fund-level changes",
  );
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Back to movements').click()");
  await waitFor(
    async () => (await evaluate("!!document.querySelectorAll('.questions .choice input')[1]?.checked")) === true,
    "retained boundary answer",
  );
  await evaluate(
    "[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()",
  );
  await waitFor(
    async () => (await evaluate("document.body.innerText.includes('Review changes before saving')")) === true,
    "earlier preview restored",
  );
  await check(
    "document.querySelector('.summary table')?.rows.length===3",
    "Earlier history: returning to the preview keeps reviewed movements",
  );
  await survey("Earlier history / preview / desktop");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await call("Emulation.setTouchEmulationEnabled", { enabled: true });
  await survey("Earlier history / preview / phone");
  await check(
    "document.documentElement.scrollWidth<=innerWidth && !!document.querySelector('[aria-label=\"Changes by month\"].table-scroll')",
    "Earlier history: the comparison scrolls inside the phone layout",
  );
  await evaluate("document.documentElement.style.fontSize='200%'");
  await check(
    "document.documentElement.scrollWidth<=innerWidth",
    "Earlier history: phone comparison remains contained at 200% text",
  );
  await evaluate("document.documentElement.style.fontSize=''");
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Back to movements').click()");
  await waitFor(
    async () => (await evaluate("!!document.querySelectorAll('.questions .choice input')[1]?.checked")) === true,
    "earlier boundary in reduced motion",
  );
  await evaluate(
    "[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()",
  );
  await waitFor(
    async () => (await evaluate("document.body.innerText.includes('Review changes before saving')")) === true,
    "earlier preview in reduced motion",
  );
  await check(
    "document.querySelector('.backfill-phase').getAnimations({subtree:true}).every(a=>a.playState!=='running')",
    "Earlier history: reduced motion keeps the preview without running transitions",
  );
  await evaluate("localStorage.removeItem('foliodash.ledger.v1')");
}
