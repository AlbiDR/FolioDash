// Checkpoints, twelve-fund holdings and three-year returns journey.
import { setTimeout as delay } from "node:timers/promises";
import type { JourneyContext } from "./browser-steps.ts";

export async function holdingsJourney({
  call,
  evaluate,
  waitFor,
  check,
  visit,
  openDetails,
  survey,
}: JourneyContext): Promise<void> {
  // Checkpoints: the sample chart draws value-only markers (never joined), and the screen lists them with the form switched off while signed out.
  await visit("overview");
  await evaluate("[...document.querySelectorAll('.range-selector button')].find(b=>b.textContent==='All').click()");
  await waitFor(
    async () => (await evaluate("document.querySelectorAll('.portfolio-trend .checkpoint-marker').length>=1")) === true,
    "sample checkpoint markers on the Performance chart",
  );
  await check(
    "[...document.querySelectorAll('.portfolio-trend .chart-series')].filter(g=>g.querySelector('.checkpoint-marker')).every(g=>!g.querySelector('path.line'))",
    "checkpoint markers are never joined by a line",
  );
  await visit("checkpoints");
  await survey("Checkpoints / desktop / signed out");
  await check(
    "document.querySelectorAll('.checkpoint-list > li').length===4 && !!document.querySelector('.checkpoint-form button[type=submit]').disabled",
    "the sample checkpoints for each demo year are listed and saving is switched off while signed out",
  );
  await visit("overview", 1440, "many");
  await openDetails();
  await survey("Portfolio / twelve funds / search and disclosures");
  // With twelve funds the total still equals the sum of its rows; a search hides it behind an explanation instead of a partial sum.
  await check(
    "(()=>{const n=text=>parseFloat(text.replace(/[^0-9,\\-]/g,'').replace(',','.'));const body=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.holdings-group)')];const total=document.querySelector('.desktop-holdings .holdings-table tfoot tr.holdings-total');const sum=index=>body.reduce((acc,row)=>acc+(Number.isNaN(n(row.children[index].textContent))?0:n(row.children[index].textContent)),0);return body.length>=10&&!!total&&Math.abs(n(total.children[1].textContent)-sum(1))<0.05&&Math.abs(n(total.children[4].textContent)-sum(4))<0.05&&Math.abs(n(total.children[5].textContent)-sum(5))<0.05})()",
    "twelve funds: the total row still equals the sum of its rows",
  );
  // Rows a search removes stay while they fade, then leave: watch for the marker, then check none remain and the list shrank.
  await evaluate(
    "(()=>{window.auditLeaving=false;window.auditRowsBefore=document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.holdings-group)').length;new MutationObserver(()=>{if(document.querySelector('.desktop-holdings .holdings-table tbody tr.row-leaving'))window.auditLeaving=true}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})})()",
  );
  await evaluate(
    "(()=>{const input=document.getElementById('fund-search');input.value='Fund A';input.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await delay(400);
  await check(
    "window.auditLeaving===true&&!document.querySelector('.desktop-holdings .holdings-table tr.row-leaving')&&document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.holdings-group)').length<window.auditRowsBefore",
    "rows a search removes fade out in place and are gone afterwards",
  );
  await check(
    "(()=>{const foot=document.querySelector('.desktop-holdings .holdings-table tfoot');return foot.querySelectorAll('td[colspan]').length===1&&foot.textContent.includes('Totals cover every fund')&&!foot.querySelector('.pill')})()",
    "a search replaces the totals with an explanation instead of a partial sum",
  );
  await evaluate(
    "(()=>{const input=document.getElementById('fund-search');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await delay(400);
  await check(
    "!!document.querySelector('.desktop-holdings .holdings-table tfoot .pill')",
    "clearing the search brings the totals back",
  );
  // Twelve funds with two sold read as two blocks with their counts; the sold block folds away without changing the total.
  await check(
    "(()=>{const heads=[...document.querySelectorAll('.desktop-holdings .holdings-group')];const text=heads.map(row=>row.textContent.replace(/\\s+/g,' ').trim());const held=document.querySelectorAll('#holdings-held-rows tr:not(.holdings-group)').length;const closed=document.querySelectorAll('#holdings-closed-rows tr:not(.holdings-group)').length;return heads.length===2&&text[0].startsWith('Held funds')&&text[0].endsWith(String(held))&&text[1].startsWith('Closed funds')&&text[1].endsWith(String(closed))&&held>0&&closed>0&&document.querySelector('.group-toggle').getAttribute('aria-expanded')==='true'})()",
    "long holdings lists group held and closed funds with their counts",
  );
  await evaluate("document.querySelector('.group-toggle').click()");
  await delay(300);
  await check(
    "document.querySelector('.group-toggle').getAttribute('aria-expanded')==='false'&&document.querySelectorAll('#holdings-closed-rows tr:not(.holdings-group)').length===0&&!!document.querySelector('.desktop-holdings .holdings-table tfoot .pill')",
    "folding the closed funds keeps the total row",
  );
  await evaluate("document.querySelector('.group-toggle').click()");
  await delay(300);
  await check(
    "document.querySelector('.group-toggle').getAttribute('aria-expanded')==='true'&&document.querySelectorAll('#holdings-closed-rows tr:not(.holdings-group)').length>0",
    "opening the closed funds shows them again",
  );
  // A re-sort glides every row to its new place together: no row waits, each row keeps the text it shows, and the order is the one the header names.
  await evaluate(
    "window.auditRows=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.holdings-group)')];window.auditRowText=window.auditRows.map(r=>r.textContent);window.auditHeader=label=>[...document.querySelectorAll('.holdings-table thead .sort-button')].find(b=>b.textContent.trim()===label);window.auditHeader('Value').click()",
  );
  await delay(40);
  await check(
    "window.auditRows.some(r=>r.getAnimations().some(a=>a.playState==='running'))",
    "a holdings re-sort glides rows to their new places",
  );
  await check(
    "window.auditRows.flatMap(r=>r.getAnimations()).every(a=>a.effect.getComputedTiming().delay===0)&&new Set(window.auditRows.flatMap(r=>r.getAnimations()).map(a=>a.effect.getComputedTiming().duration)).size<=1",
    "gliding rows share one duration and none waits for another",
  );
  await check(
    "window.auditRows.every((r,i)=>r.textContent===window.auditRowText[i])",
    "gliding rows keep the text and figures they show",
  );
  await check(
    "window.auditHeader('Value').closest('th').getAttribute('aria-sort')==='descending'",
    "the re-sorted header names the order the rows now follow",
  );
  await waitFor(
    async () =>
      (await evaluate(
        "window.auditRows.every(r=>r.getAnimations().length===0&&getComputedStyle(r).transform==='none')",
      )) === true,
    "re-sorted rows settle with no transform",
  );
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("window.auditHeader('Gain').click()");
  await delay(40);
  await check(
    "window.auditRows.every(r=>r.getAnimations().length===0)",
    "reduced motion re-sorts holdings at once without a glide",
  );
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  // The phone's list uses the same glide: its order follows the sort choice and its rows move together.
  await visit("overview", 390, "many");
  await evaluate(
    "(()=>{const select=document.getElementById('holdings-sort');select.value='value:desc';select.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await delay(40);
  await check(
    "[...document.querySelectorAll('.mobile-holdings > li')].some(li=>li.getAnimations().some(a=>a.playState==='running'))",
    "the phone holdings list glides to its new order",
  );
  // Short histories have no returns grid; three years of demo history show it, with no reminder (the demo's dates are synthetic), and its figures are the Month by month matrix's own.
  await check(
    "!document.querySelector('.returns-card') && !document.querySelector('.attention')",
    "a history within one calendar year has no returns grid and demo data asks for nothing",
  );
  await visit("overview", 1440, "long");
  await openDetails();
  await check(
    "(()=>{const rows=[...document.querySelectorAll('.returns-table tbody tr')];return rows.length===3&&rows.every(row=>row.querySelectorAll('td').length===12)&&!document.querySelector('.attention')&&document.querySelector('.returns-card').getBoundingClientRect().width>600})()",
    "three years of demo history show the monthly returns grid and no reminder",
  );
  await survey("Portfolio / three years / monthly returns");
  await evaluate(
    "window.auditGridValues=[...document.querySelectorAll('.returns-cell')].map(cell=>cell.textContent.trim()).filter(text=>text!=='-')",
  );
  await evaluate("location.hash='#months'");
  await waitFor(
    async () => (await evaluate("!!document.querySelector('.matrix.totals')")) === true,
    "month matrix for the long history",
  );
  await check(
    "(()=>{const rows=[...document.querySelectorAll('.matrix.totals tbody tr')];const at=rows.findIndex(row=>row.textContent.includes('Growth from previous month'));const cells=[...rows[at+1].querySelectorAll('td')].map(cell=>cell.textContent.trim()).filter(text=>text!=='-');return cells.length===window.auditGridValues.length&&cells.every((text,index)=>text===window.auditGridValues[index])})()",
    "the returns grid shows exactly the month-on-month percentages of the Month by month matrix, in order",
  );
}
