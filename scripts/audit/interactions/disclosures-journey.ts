// Disclosures, fund page and Month by month matrix journey.
import { setTimeout as delay } from "node:timers/promises";
import type { JourneyContext } from "./browser-steps.ts";

export async function disclosuresJourney({
  evaluate,
  check,
  visit,
  openDetails,
  survey,
}: JourneyContext): Promise<void> {
  await openDetails();
  await survey("Portfolio / desktop / disclosures open");
  await check(
    "(()=>{const groups=[...document.querySelectorAll('.recent-fund-history-group')];return groups.length>0&&groups.every(group=>group.querySelectorAll('tbody tr').length===3)&&document.querySelector('.recent-fund-history a[href=\"#months\"]')!==null})()",
    "recent fund history shows three dated statements and the full comparison link",
  );
  await evaluate("document.querySelector('.privacy-toggle').click()");
  await check(
    "[...document.querySelectorAll('.recent-fund-history .amount')].every(amount=>amount.classList.contains('masked')||amount.textContent.trim()==='-')",
    "recent fund history hides amounts immediately",
  );
  await evaluate("document.querySelector('.privacy-toggle').click()");
  const fund = (await evaluate(
    "[...document.querySelectorAll('.holdings-table a')].find(link=>link.textContent.trim()==='Demo Global Equity')?.getAttribute('href')",
  )) as string;
  await visit(fund.slice(1));
  await openDetails();
  // Fund journey: figures first, then the chart, then the statement history, newest first, in reading order.
  await check(
    "(()=>{const hero=document.querySelector('.fund-hero');const chart=document.querySelector('#fund-chart, .chart');const history=document.querySelector('.fund-history');return !!hero&&!!chart&&!!history&&!!(hero.compareDocumentPosition(chart)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(chart.compareDocumentPosition(history)&Node.DOCUMENT_POSITION_FOLLOWING)&&hero.querySelectorAll('.fund-figure').length===5})()",
    "fund page leads with its figures, then the chart, then its history",
  );
  await check(
    "(()=>{const tables=[...document.querySelectorAll('.fund-history table')];const dates=tables.flatMap(table=>[...table.querySelectorAll('tbody th')].map(cell=>Date.parse(cell.textContent)));return tables.length===2&&tables[0].tBodies[0].rows.length===12&&dates.length===46&&dates.every((date,index)=>index===0||dates[index-1]>date)&&document.querySelector('.fund-history details').open})()",
    "fund history shows the 12 newest statements first and the rest in Earlier statements",
  );
  await check(
    "document.querySelector('.fund-hero').getBoundingClientRect().height<320",
    "fund figures do not stretch into an empty card",
  );
  await survey("Fund / desktop / disclosures open");
  await evaluate(
    "window.auditFundSelector=document.querySelector('.range-selector');window.auditFundOption=window.auditFundSelector.querySelectorAll('button')[0];window.auditFundOption.focus();window.auditFundOption.click()",
  );
  await delay(50);
  await check(
    "document.querySelector('.range-selector')===window.auditFundSelector && document.activeElement===window.auditFundOption",
    "fund period change also preserves selector and focus",
  );
  await visit("months");
  await openDetails();
  // Best and worst marks are off until asked for; when on, each portfolio row marks exactly its largest and smallest displayed figures, in text as well as colour, without moving any column.
  await check(
    "document.querySelectorAll('.matrix-mark').length===0&&!document.querySelector('.matrix-marks-toggle input').checked",
    "best and worst marks are off by default",
  );
  await evaluate(
    "window.auditHeadLefts=()=>[...document.querySelectorAll('.month-matrices thead')].map(head=>[...head.querySelectorAll('th')].map(th=>Math.round(th.getBoundingClientRect().left)).join(','))",
  );
  await evaluate("window.auditHeadsBefore=window.auditHeadLefts()");
  await evaluate("document.querySelector('.matrix-marks-toggle input').click()");
  await delay(300);
  await check(
    "(()=>{const n=text=>{const t=text.replace(/[^0-9,\\-+]/g,'');return t===''||t==='-'?null:parseFloat(t.replace(',','.'))};const rows=[...document.querySelectorAll('.matrix.totals tbody tr')];return rows.length>=9&&rows.every(row=>{const cells=[...row.querySelectorAll('td')];const values=cells.map(cell=>n(cell.textContent));const present=values.filter(v=>v!==null);const marked=cells.some(cell=>cell.matches('.matrix-best, .matrix-worst'));if(present.length<3||Math.max(...present)===Math.min(...present))return !marked;const high=Math.max(...present);const low=Math.min(...present);return cells.every((cell,i)=>cell.classList.contains('matrix-best')===(values[i]===high)&&cell.classList.contains('matrix-worst')===(values[i]===low))})})()",
    "each portfolio row marks exactly its largest and smallest displayed figures",
  );
  await check(
    "(()=>{const cells=[...document.querySelectorAll('.matrix td.matrix-best, .matrix td.matrix-worst')];return cells.length>0&&cells.every(cell=>{const glyph=cell.querySelector('.matrix-mark');const text=cell.querySelector('.visually-hidden')?.textContent??'';return glyph?.getAttribute('aria-hidden')==='true'&&(cell.classList.contains('matrix-best')?text.includes('Best in row'):text.includes('Worst in row'))})&&document.querySelectorAll('.month-matrices .table-scroll')[1].querySelectorAll('.matrix-mark').length===0})()",
    "every mark is also written in text, and the fund table carries none",
  );
  await check(
    "window.auditHeadLefts().join('|')===window.auditHeadsBefore.join('|')",
    "turning marks on moves no column",
  );
  await evaluate("document.querySelector('.matrix-marks-toggle input').click()");
  await delay(300);
  await check(
    "document.querySelectorAll('.matrix-mark').length===0&&window.auditHeadLefts().join('|')===window.auditHeadsBefore.join('|')",
    "turning marks off removes them and restores the matrix exactly",
  );
  await survey("Months / desktop / disclosures open");
}
