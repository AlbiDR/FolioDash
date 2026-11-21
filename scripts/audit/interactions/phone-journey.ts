// Phone layouts, 320px reflow and the static privacy page.
import { setTimeout as delay } from "node:timers/promises";
import type { JourneyContext } from "./browser-steps.ts";
import { counters } from "./state.ts";

export async function phoneJourney({
  origin,
  call,
  evaluate,
  waitFor,
  check,
  visit,
  openDetails,
  survey,
}: JourneyContext): Promise<void> {
  for (const route of ["overview", "expenses", "months", "checkpoints", "import", "connection"]) {
    await visit(route, 390);
    if (route === "expenses")
      await waitFor(
        async () => (await evaluate("!!document.querySelector('.expense-record-list')")) === true,
        "the deferred phone expense record",
      );
    if (route === "months") {
      // Opening state: both tables open on the newest statement, which is tinted, and they line up column for column.
      // The tables keep following the end while layout settles (fonts, scrollbars), so wait for that rather than asserting at the first paint.
      const atNewest =
        "[...document.querySelectorAll('.month-matrices .table-scroll')].every(region=>region.scrollLeft>=region.scrollWidth-region.clientWidth-2)";
      try {
        await waitFor(
          async () => (await evaluate(atNewest)) === true,
          "both month tables open on the newest statement",
        );
        counters.assertions++;
      } catch (error) {
        console.log(
          `Month tables geometry: ${String(await evaluate("JSON.stringify([...document.querySelectorAll('.month-matrices .table-scroll')].map(region=>({left:region.scrollLeft,width:region.scrollWidth,client:region.clientWidth})))"))}`,
        );
        throw error;
      }
      await check(
        "(()=>{const heads=[...document.querySelectorAll('.month-matrices thead')].map(head=>[...head.querySelectorAll('th')].slice(2));const tinted=heads.map(row=>row.filter(th=>th.classList.contains('matrix-selected')));return tinted.every(row=>row.length===1&&row[0]===[...row[0].parentElement.children].at(-1))&&heads[0].every((th,i)=>Math.abs(th.getBoundingClientRect().left-heads[1][i].getBoundingClientRect().left)<=2)})()",
        "the newest column is tinted and both tables share column positions",
      );
      // Linked scrolling and frozen names, in both tables.
      await evaluate(
        "(()=>{const regions=document.querySelectorAll('.month-matrices .table-scroll');window.auditFundNameLeft=regions[1].querySelector('tbody th.matrix-label').getBoundingClientRect().left;regions[1].scrollLeft=Math.max(0,regions[1].scrollLeft-200)})()",
      );
      await delay(300);
      await check(
        "(()=>{const regions=[...document.querySelectorAll('.month-matrices .table-scroll')];return Math.abs(regions[0].scrollLeft-regions[1].scrollLeft)<=1&&regions[1].scrollLeft<regions[1].scrollWidth-regions[1].clientWidth-50&&Math.abs(regions[1].querySelector('tbody th.matrix-label').getBoundingClientRect().left-window.auditFundNameLeft)<2})()",
        "scrolling either month table moves both, and fund names stay frozen",
      );
      // The statement picker drives the tint.
      await evaluate(
        "(()=>{const select=document.querySelector('.mobile-months select');select.value=select.options[select.options.length-1].value;select.dispatchEvent(new Event('change',{bubbles:true}))})()",
      );
      await delay(300);
      await check(
        "(()=>{const heads=[...document.querySelectorAll('.month-matrices thead')].map(head=>[...head.querySelectorAll('th')].slice(2));return heads.every(row=>row.filter(th=>th.classList.contains('matrix-selected')).length===1&&row[0].classList.contains('matrix-selected'))})()",
        "choosing an earlier statement moves the tint to its column in both tables",
      );
      await evaluate(
        "(()=>{const select=document.querySelector('.mobile-months select');select.value=select.options[0].value;select.dispatchEvent(new Event('change',{bubbles:true}))})()",
      );
      await delay(300);
      await check(
        "!!document.querySelector('.month-matrices .totals') && !document.querySelector('.month-matrices')?.closest('details:not([open])')",
        "month comparison is visible without expansion on phone",
      );
      await evaluate(
        "window.auditTotalsScroll=document.querySelector('[aria-label=\"Portfolio totals by month\"].table-scroll');window.auditTotalsScroll.scrollLeft=0;window.auditLabels=[...window.auditTotalsScroll.querySelectorAll('.matrix-label')];window.auditLefts=window.auditLabels.map(label=>label.getBoundingClientRect().left);window.auditFirstValue=window.auditTotalsScroll.querySelector('tbody td').getBoundingClientRect().left;window.auditTotalsScroll.scrollLeft=200",
      );
      await check(
        "window.auditTotalsScroll.scrollLeft>0 && window.auditLabels.length===6 && window.auditLabels.every((label,index)=>Math.abs(label.getBoundingClientRect().left-window.auditLefts[index])<2) && window.auditTotalsScroll.querySelector('tbody td').getBoundingClientRect().left<window.auditFirstValue-10",
        "portfolio row labels stay pinned while statement values scroll",
      );
    }
    await openDetails();
    await survey(`${route} / phone / disclosures open`);
    if (route === "expenses")
      await check(
        "getComputedStyle(document.querySelector('.expense-record-list')).columnCount==='auto'&&document.documentElement.scrollWidth<=innerWidth",
        "the phone expense record stays one column",
      );
    if (route === "overview")
      await check(
        "Math.round(document.querySelector('.portfolio-trend .chart-svg').getBoundingClientRect().height)===200",
        "phone Performance plot keeps its compact height",
      );
    if (route === "overview") {
      await check(
        "getComputedStyle(document.querySelector('.holdings-sort-mobile')).display!=='none'&&getComputedStyle(document.querySelector('.desktop-holdings')).display==='none'",
        "phone holdings offer one sort list instead of table headers",
      );
      await evaluate(
        "window.auditPhoneNames=()=>[...document.querySelectorAll('.mobile-holdings .holding-name')].map(n=>n.textContent).join('|');window.auditPhoneDefault=window.auditPhoneNames();(()=>{const select=document.getElementById('holdings-sort');select.value='gainPercent:asc';select.dispatchEvent(new Event('change',{bubbles:true}))})()",
      );
      await delay(300);
      await check(
        "window.auditPhoneNames()!==window.auditPhoneDefault && document.getElementById('holdings-sort').value==='gainPercent:asc'",
        "the phone sort list reorders holdings",
      );
      await evaluate(
        "(()=>{const select=document.getElementById('holdings-sort');select.value='';select.dispatchEvent(new Event('change',{bubbles:true}))})()",
      );
      await delay(300);
      await check(
        "window.auditPhoneNames()===window.auditPhoneDefault",
        "choosing the default order restores the saved order",
      );
    }
    if (route === "overview") {
      const point = (await evaluate(
        "(()=>{const n=document.querySelector('.chart-svg');n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()",
      )) as { x: number; y: number };
      await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await delay(60);
      await check("!!document.querySelector('.chart-guide')", "touch chart inspection produces a visible guide");
    }
    await check("document.documentElement.scrollWidth<=innerWidth", `${route}: phone reflow`);
  }
  await visit("overview", 320);
  await evaluate("document.documentElement.style.fontSize='200%'");
  await check(
    "document.documentElement.scrollWidth<=innerWidth",
    "Portfolio: 320px layout has no horizontal overflow at 200% text",
  );
  await evaluate("document.documentElement.style.fontSize=''");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Emulation.setTouchEmulationEnabled", { enabled: false });
  await call("Page.navigate", { url: `${origin}/privacy/` });
  await waitFor(
    async () => (await evaluate("document.querySelector('h1')?.textContent==='FolioDash privacy policy'")) === true,
    "static privacy page",
  );
  await survey("Privacy / static public page links");
}
