// Whole-history import and cash movement review journey.
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import type { JourneyContext } from "./browser-steps.ts";

export async function historyJourney({
  call,
  evaluate,
  waitFor,
  check,
  visit,
  openDetails,
  survey,
}: JourneyContext): Promise<void> {
  await visit("history");
  await openDetails();
  const document = await call("DOM.getDocument");
  const input = await call("DOM.querySelector", {
    nodeId: (document["root"] as { nodeId: number }).nodeId,
    selector: "#statement-file",
  });
  await call("DOM.setFileInputFiles", {
    nodeId: input["nodeId"],
    files: [resolve("dist/acceptance/onboarding/combined/synthetic-history.xlsx")],
  });
  await waitFor(
    async () => (await evaluate("document.body.innerText.includes('Check your statements')")) === true,
    "synthetic history review",
  );
  await openDetails();
  await survey("History / generated synthetic XLSX selection review");
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent==='Review selected statements in date order').click()",
  );
  await waitFor(
    async () => (await evaluate("document.querySelectorAll('.fund-question input[type=text]').length===2")) === true,
    "opening-balance review",
  );
  await evaluate(
    "document.querySelectorAll('.fund-question input[type=text]').forEach(n=>{n.value='1.000,00';n.dispatchEvent(new Event('input',{bubbles:true}))})",
  );
  await delay(100);
  await evaluate(
    "[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()",
  );
  await waitFor(
    async () => (await evaluate("!!document.querySelector('.questions .choice')")) === true,
    "second-statement movement review",
  );
  await evaluate("document.querySelector('.questions .choice input').click()");
  await waitFor(
    async () => (await evaluate("document.querySelectorAll('.cash-movements input').length===4")) === true,
    "movement fields revealed",
  );
  await check(
    "!document.querySelector('.questions .summary')",
    "Cash review: blank movement amounts prevent a completed preview",
  );
  await evaluate(
    "[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()",
  );
  await delay(100);
  await check(
    "document.querySelector('#excel-history-heading').textContent==='Review statement 2 of 3' && !!document.querySelector('.fund-question .field-error')",
    "Cash review: continuing with blank amounts stays on the same review and explains the missing answer",
  );
  await check(
    "[...document.querySelectorAll('.cash-movements label')].every(n=>/Money (added to|received from) this fund/.test(n.textContent))",
    "Cash review: plain-language labels identify money direction",
  );
  await check(
    "(()=>{const inputs=[...document.querySelectorAll('.cash-movements input')];return inputs.length>0&&document.querySelectorAll('.questions [id$=\"-movement-help\"]').length===1&&inputs.every(input=>{const help=document.getElementById(input.getAttribute('aria-describedby')??'');return !!help&&help.textContent.includes('Money received')})})()",
    "Cash review: money added and received are explained once and every amount field points to that explanation",
  );
  await evaluate(
    "(()=>{const fields=document.querySelectorAll('.cash-movements input');['200','50'].forEach((v,i)=>{fields[i].value=v;fields[i].dispatchEvent(new Event('input',{bubbles:true}))});document.querySelectorAll('.cash-movements button')[1].click()})()",
  );
  await delay(100);
  await check(
    "[...document.querySelectorAll('.cash-movements input')].map(n=>n.value).join('|')==='200|50|0|0'",
    "Cash review: the per-fund no-movement action explicitly fills both zeroes",
  );
  await check(
    "document.querySelector('.fund-summary li').textContent.includes('1.150,00') && document.querySelector('.fund-summary').textContent.includes('Still held')",
    "Cash review: preview preserves full money in/out and canonical net invested",
  );
  await survey("History / money added and received / desktop");
  await evaluate("document.querySelectorAll('.questions .choice input')[1].click()");
  await delay(450);
  await check(
    "!document.querySelector('.cash-movements')",
    "Cash review: no-movement selection collapses the amount fields",
  );
  await check(
    "document.querySelector('.fund-summary li').textContent.includes('1.000,00') && !document.querySelector('.fund-summary li').textContent.includes('1.150,00')",
    "Cash review: hidden draft movements do not affect a no-movement preview",
  );
  await evaluate("document.querySelector('.questions .choice input').click()");
  await delay(450);
  await check(
    "[...document.querySelectorAll('.cash-movements input')].map(n=>n.value).join('|')==='200|50|0|0'",
    "Cash review: changing the global answer retains the edited amounts",
  );
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await call("Emulation.setTouchEmulationEnabled", { enabled: true });
  await survey("History / money added and received / phone");
  await evaluate("document.documentElement.style.fontSize='200%'");
  await check(
    "document.documentElement.scrollWidth<=innerWidth",
    "Cash review: phone layout has no horizontal overflow at 200% text",
  );
  await evaluate("document.documentElement.style.fontSize=''");
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("document.querySelectorAll('.questions .choice input')[1].click()");
  await delay(100);
  await evaluate("document.querySelector('.questions .choice input').click()");
  await delay(100);
  await check(
    "document.querySelectorAll('.cash-movements input').length===4 && [...document.querySelectorAll('.cash-movements')].every(n=>n.getAnimations({subtree:true}).every(a=>a.playState!=='running'))",
    "Cash review: reduced motion keeps the same fields without moving them",
  );
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent==='Return to statement selection (reset answers)').click()",
  );
  await delay(450);
  await visit("connection");
  await openDetails();
  await survey("Your data / signed out / advanced controls");
}
