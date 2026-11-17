// Portfolio journey: sorting, orientation and the direct route to the months.
import { setTimeout as delay } from "node:timers/promises";
import type { JourneyContext } from "./browser-steps.ts";

export async function portfolioJourney({ evaluate, waitFor, check, visit, survey }: JourneyContext): Promise<void> {
  // Portfolio: inspect the complete range-to-chart journey, not only selector declarations.
  await visit("overview");
  await survey("Portfolio / desktop / initial");
  // The wide Performance card spans the hero and Changes rows: its plot uses the spare height instead of leaving a void.
  await waitFor(
    async () =>
      (await evaluate(
        "(()=>{const card=document.querySelector('.portfolio-trend .chart');const last=card.lastElementChild.getBoundingClientRect();return card.getBoundingClientRect().bottom-last.bottom<=40&&document.querySelector('.portfolio-trend .chart-svg').getBoundingClientRect().height>300})()",
      )) === true,
    "wide Performance plot filling its card",
  );
  await check(
    "(()=>{const svg=document.querySelector('.portfolio-trend .chart-svg');const box=svg.getBoundingClientRect();return box.height<=box.width*0.8+1&&box.height<=561})()",
    "filled Performance plot stays a wide, bounded shape",
  );
  // The headline carries the change since last month beside the total.
  await check(
    "!!document.querySelector('.hero .hero-delta .pill') && document.querySelector('.hero .hero-delta').getBoundingClientRect().top>document.querySelector('.hero .hero-value').getBoundingClientRect().top",
    "the hero shows the month's change beside the total",
  );
  // Each held fund shows its weight as a bar that matches its percentage, and a trend line under its value; the rail names what moved most.
  await check(
    "(()=>{const rows=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.closed):not(.holdings-group)')];const pcts=rows.map(row=>parseFloat(row.children[2].textContent.replace(/\\./g,'').replace(',','.')));const top=Math.max(...pcts);return rows.length>0&&rows.every((row,i)=>{const bar=row.querySelector('.share-bar > span');return !!bar&&Math.abs(parseFloat(bar.style.inlineSize)-pcts[i]/top*100)<0.2&&row.querySelector('.share-bar').getAttribute('aria-hidden')==='true'})&&Math.abs(parseFloat(rows[pcts.indexOf(top)].querySelector('.share-bar > span').style.inlineSize)-100)<0.01})()",
    "each held fund's weight bar compares its share with the largest holding",
  );
  await check(
    "(()=>{const lines=[...document.querySelectorAll('.desktop-holdings .holdings-table td .sparkline')];return lines.length>0&&lines.every(line=>line.getAttribute('aria-hidden')==='true'&&!!line.querySelector('.spark-line'))})()",
    "held funds show a decorative trend line under their value",
  );
  await check(
    "(()=>{const card=document.querySelector('.movers-card');const links=[...card.querySelectorAll('a.mover')];const size=a=>Math.abs(parseFloat(a.querySelector('.mover-figures').firstElementChild.textContent.replace(/[^0-9,]/g,'').replace(',','.')));return links.length>=1&&links.length<=3&&links.every(a=>a.getAttribute('href').startsWith('#fund/'))&&links.every((a,i)=>i===0||size(links[i-1])>=size(a))&&!!card.closest('.portfolio-rail')?.querySelector('.allocation-card')})()",
    "the rail names up to three funds by size of change, each linking to its fund, beside allocation",
  );
  // The total row repeats the portfolio's own figures and agrees with the rows it sums.
  await check(
    "(()=>{const n=text=>parseFloat(text.replace(/[^0-9,\\-]/g,'').replace(',','.'));const body=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.holdings-group)')];const total=document.querySelector('.desktop-holdings .holdings-table tfoot tr.holdings-total');const sum=index=>body.reduce((acc,row)=>acc+(Number.isNaN(n(row.children[index].textContent))?0:n(row.children[index].textContent)),0);return !!total&&total.children[1].textContent===document.querySelector('.hero .hero-value').textContent&&Math.abs(n(total.children[1].textContent)-sum(1))<0.02&&Math.abs(n(total.children[4].textContent)-sum(4))<0.02&&Math.abs(n(total.children[5].textContent)-sum(5))<0.02})()",
    "the holdings total row matches the headline and the sum of its rows",
  );
  await check(
    "document.querySelectorAll('.desktop-holdings .holdings-group').length===0",
    "a short list stays one table without group headers",
  );
  // The holdings table fits its card: every column keeps its full figure and nothing is clipped at the card edge.
  await check(
    "(()=>{const region=document.querySelector('.desktop-holdings');return getComputedStyle(region).display!=='none'&&region.scrollWidth<=region.clientWidth+1&&[...region.querySelectorAll('td, th')].every(cell=>cell.scrollWidth<=cell.clientWidth+1)})()",
    "no holdings figure is clipped by its column or the card edge",
  );
  // Holdings sort: a header sorts, repeating reverses, a third choice restores the saved order, and the order is announced.
  await evaluate(
    "window.auditHoldingNames=()=>[...document.querySelectorAll('.desktop-holdings .holdings-table tbody th a')].map(a=>a.textContent)",
  );
  await evaluate("window.auditDefaultOrder=window.auditHoldingNames().join('|')");
  await evaluate("[...document.querySelectorAll('.sort-button')].find(button=>button.textContent==='Gain %').click()");
  await delay(300);
  await check(
    "(()=>{const th=[...document.querySelectorAll('.desktop-holdings .holdings-table thead th')].find(n=>n.textContent.trim()==='Gain %');const held=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.closed):not(.holdings-group)')].map(row=>parseFloat(row.children[3].textContent.replace('+','').replace('.','').replace(',','.')));const last=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.holdings-group)')].at(-1);return th.getAttribute('aria-sort')==='descending'&&held.length>1&&held.every((value,index)=>index===0||held[index-1]>=value)&&last.classList.contains('closed')&&[...document.querySelectorAll('[role=status]')].some(n=>n.textContent.includes('sorted by Gain %, highest first'))})()",
    "a column sorts holdings high to low, keeps sold funds last and announces it",
  );
  await evaluate("[...document.querySelectorAll('.sort-button')].find(button=>button.textContent==='Gain %').click()");
  await delay(300);
  await check(
    "[...document.querySelectorAll('.desktop-holdings .holdings-table thead th')].find(n=>n.textContent.trim()==='Gain %').getAttribute('aria-sort')==='ascending'",
    "choosing the column again reverses it",
  );
  await evaluate("[...document.querySelectorAll('.sort-button')].find(button=>button.textContent==='Gain %').click()");
  await delay(300);
  await check(
    "window.auditHoldingNames().join('|')===window.auditDefaultOrder && [...document.querySelectorAll('.desktop-holdings .holdings-table thead th')].every(n=>n.getAttribute('aria-sort')==='none')",
    "a third choice restores the saved order",
  );
  // Journey order: summary and performance, then the fund list, then analysis. Analysis cards end with their content.
  await check(
    "(()=>{const holdings=document.querySelector('.portfolio-holdings');const analysis=document.querySelector('.dashboard-analysis');return !!holdings&&!!analysis&&holdings.getBoundingClientRect().top<analysis.getBoundingClientRect().top&&!!(holdings.compareDocumentPosition(analysis)&Node.DOCUMENT_POSITION_FOLLOWING)})()",
    "holdings come before trends and comparisons",
  );
  await check(
    "[...document.querySelectorAll('.analysis-grid > .card')].every(card=>{const style=getComputedStyle(card);const room=card.getBoundingClientRect().bottom-card.lastElementChild.getBoundingClientRect().bottom;return room<=parseFloat(style.paddingBottom)+16})",
    "analysis cards end with their content instead of stretching into empty space",
  );
  await evaluate(
    "[...document.querySelectorAll('.portfolio-explore .page-nav button')].find(button=>button.textContent==='Holdings').click()",
  );
  await check(
    "document.activeElement?.id==='holdings-heading' && location.hash==='#overview'",
    "portfolio orientation moves focus to holdings without changing route",
  );
  await evaluate(
    "[...document.querySelectorAll('.portfolio-explore .page-nav button')].find(button=>button.textContent==='Trends and comparisons').click()",
  );
  await check(
    "document.activeElement?.id==='portfolio-analysis' && !!document.querySelector('.dashboard-analysis .analysis-grid') && !document.querySelector('#portfolio-analysis')?.closest('details:not([open])')",
    "portfolio orientation focuses visible trends",
  );
  await evaluate("document.querySelector('.portfolio-history-link').click()");
  await waitFor(
    async () =>
      (await evaluate("location.hash==='#months' && !!document.querySelector('.mobile-months select')")) === true,
    "direct month-by-month navigation",
  );
  await check(
    "getComputedStyle(document.querySelector('.mobile-months')).display!=='none'",
    "statement selector is visible on desktop",
  );
  await check(
    "(()=>{const sections=[...document.querySelector('.months').children];return sections.findIndex(n=>n.classList.contains('month-matrices'))<sections.findIndex(n=>n.classList.contains('mobile-months')) && !!document.querySelector('.month-matrices .totals') && !document.querySelector('.month-matrices')?.closest('details:not([open])')})()",
    "month comparison is visible before the statement inspector",
  );
}
