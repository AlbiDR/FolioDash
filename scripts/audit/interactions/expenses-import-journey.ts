// Expenses, manual entry and single statement import journey.
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import type { JourneyContext } from "./browser-steps.ts";

export async function expensesImportJourney({
  call,
  evaluate,
  waitFor,
  check,
  visit,
  openDetails,
  survey,
}: JourneyContext): Promise<void> {
  await visit("expenses");
  await openDetails();
  // A long record uses the wide card's width (two columns, still newest first) without overflowing; the phone keeps one column.
  await check(
    "(()=>{const list=document.querySelector('.expense-record-list');const rows=[...list.children];return rows.length>=6&&getComputedStyle(list).columnCount==='2'&&list.scrollWidth<=list.clientWidth+1&&rows.every(row=>row.getBoundingClientRect().width>200)&&document.documentElement.scrollWidth<=innerWidth})()",
    "a long expense record flows into two columns on a wide screen",
  );
  await survey("Expenses / desktop / initial and disclosures");
  if (
    (await evaluate(
      "![...document.querySelectorAll('.expense-week-list button')].some(b=>b.querySelector('.expense-week-state').textContent==='Recorded')",
    )) === true
  ) {
    await evaluate("document.querySelector('.expense-week-controls button[aria-label=\"Previous week\"]').click()");
    await waitFor(
      async () =>
        (await evaluate(
          "[...document.querySelectorAll('.expense-week-list button')].some(b=>b.querySelector('.expense-week-state').textContent==='Recorded')",
        )) === true,
      "a recorded synthetic workday in the previous week",
    );
  }
  await evaluate(
    "[...document.querySelectorAll('.expense-week-list button')].find(b=>b.querySelector('.expense-week-state').textContent==='Recorded').click()",
  );
  await delay(100);
  await evaluate(
    "const addedCost=document.querySelector('#expense-4');addedCost.value='4,50';addedCost.dispatchEvent(new Event('input',{bubbles:true}))",
  );
  await delay(100);
  await check(
    "document.querySelector('.expense-save-button').textContent==='Save added expenses'",
    "Expenses: adding to a saved blank is a direct save",
  );
  await evaluate("document.querySelector('.expense-save-button').click()");
  await delay(250);
  await check(
    "!document.querySelector('.expense-review') && document.querySelector('#expense-4').value==='4,50' && document.querySelector('.expense-save-button').disabled",
    "Expenses: incremental addition saved without correction review",
  );
  await evaluate(
    "const input=document.querySelector('#expense-0');if(input){input.value='7,50';input.dispatchEvent(new Event('input',{bubbles:true}))}",
  );
  await delay(100);
  await evaluate(
    "[...document.querySelectorAll('.expense-entry button')].find(b=>b.textContent==='Review correction')?.click()",
  );
  await delay(250);
  await check(
    "document.querySelector('.expense-review dl').children.length===1",
    "Expenses: correction review shows only changed fields",
  );
  await survey("Expenses / correction review / synthetic draft only");
  await evaluate(
    "[...document.querySelectorAll('.expense-review button')].find(b=>b.textContent==='Keep editing')?.click()",
  );
  await delay(100);
  await evaluate(
    "[...document.querySelectorAll('.expense-entry button')].find(b=>b.textContent==='Discard draft')?.click()",
  );
  await delay(150);
  await visit("import");
  await openDetails();
  await survey("Import / file entry and JSON tools");
  await evaluate("document.querySelector('[aria-controls=manual-entry-panel]').click()");
  await delay(250);
  await survey("Import / manual fields");
  await check(
    "document.querySelector('.manual-fund button').textContent==='Remove fund'",
    "Manual entry: a new row has a draft-removal action",
  );
  await evaluate("document.querySelector('.manual-fund button').click()");
  await delay(450);
  await check(
    "document.querySelector('.manual-entry .notice').textContent.includes('Nothing has been saved.') && !document.querySelector('.manual-entry .notice').textContent.includes('sale')",
    "Manual entry: new-row removal has no sale implication",
  );
  await survey("Import / removal and undo notice");
  await evaluate("document.querySelector('#undo-removed-fund').click()");
  await delay(450);
  await check(
    "!!document.querySelector('.manual-fund') && document.activeElement?.id.endsWith('-name')",
    "Manual entry: undo restores the row and field focus",
  );
  // One statement, start to review: the journey shows what is done, the categories are reference, and each explanation is said once.
  await visit("import", 1440, "many");
  const singleDocument = await call("DOM.getDocument");
  const singleInput = await call("DOM.querySelector", {
    nodeId: (singleDocument["root"] as { nodeId: number }).nodeId,
    selector: "input[type=file]",
  });
  await call("DOM.setFileInputFiles", {
    nodeId: singleInput["nodeId"],
    files: [resolve("dist/acceptance/onboarding/individual/synthetic-bank-2026-03-31.xlsx")],
  });
  await waitFor(
    async () => (await evaluate("document.body.innerText.includes('Review ready')")) === true,
    "single statement review",
  );
  await check(
    "(()=>{const steps=[...document.querySelectorAll('.journey-steps li')];return steps[0].dataset.done==='true'&&steps[1].getAttribute('aria-current')==='step'&&!steps[2].dataset.done&&steps[0].textContent.includes('completed')})()",
    "the import journey marks finished steps and the current one",
  );
  await check(
    "(()=>{const details=[...document.querySelectorAll('.review .more details')].find(d=>d.querySelector('summary')?.textContent.includes('Categories in the file'));return !!details&&!details.open&&!!details.querySelector('table')})()",
    "the file's categories are reference material behind a closed disclosure",
  );
  await check(
    "(()=>{const inputs=[...document.querySelectorAll('.fund-question input[type=text]')];return inputs.length>0&&inputs.every(input=>{const ids=(input.getAttribute('aria-describedby')??'').split(' ').filter(Boolean);return ids.length>0&&ids.every(id=>!!document.getElementById(id))})&&document.querySelectorAll('.fund-question .cash-field-help').length===0})()",
    "starting balance fields share one explanation and every field still points to real help text",
  );
  await check(
    "(()=>{const rail=document.querySelector('.questions-rail');const body=document.querySelector('.questions-body');const r=rail.getBoundingClientRect();const b=body.getBoundingClientRect();return getComputedStyle(rail).position==='sticky'&&r.left>=b.right-1&&Math.abs(r.top-b.top)<4&&rail.querySelector('progress').max>0&&rail.querySelector('[role=status]').textContent.includes('answered')})()",
    "a wide import review keeps its running summary beside the questions, sticky, with its progress",
  );
}
