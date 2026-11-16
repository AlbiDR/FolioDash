// Production-renderer control discovery and state probes. Only the invented, signed-out demo is used.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { withLocalBrowser } from "./localBrowser.ts";

interface RenderedControl { readonly id: string; readonly tag: string; readonly label: string; readonly family: string; readonly disabled: boolean; readonly signature: string; readonly duration: boolean; readonly animated: readonly string[] }
const output = resolve(process.env["FOLIODASH_AUDIT_OUTPUT"] ?? "dist/interaction-audit");
mkdirSync(output, { recursive: true });
const report: { state: string; controls: readonly RenderedControl[] }[] = [];
let assertions = 0;
let controlSamples = 0;
const problems: string[] = [];
execFileSync("npm", ["run", "fixtures:onboarding"], { stdio: "ignore" });

await withLocalBrowser(async ({ origin, call, evaluate, waitFor }) => {
  await call("DOM.enable");
  await call("CSS.enable");
  await call("Emulation.setFocusEmulationEnabled", { enabled: true });
  const check = async (expression: string, label: string): Promise<void> => {
    if (await evaluate(expression) !== true) throw new Error(`Interaction regression: ${label}`);
    assertions++;
  };
  const visit = async (route: string, width = 1440, variant = "typical"): Promise<void> => {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    await call("Emulation.setTouchEmulationEnabled", { enabled: width < 600 });
    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "no-preference" }] });
    const url = `${origin}/?demo=${variant}#${route}`;
    const title = ({overview:"Portfolio",expenses:"Work expenses",months:"Month by month",checkpoints:"Checkpoints",import:"Update your portfolio",history:"Import a whole history",connection:"Your data"} as Readonly<Record<string,string>>)[route];
    await call("Page.navigate", { url });
    await waitFor(async () => await evaluate(`location.href===${JSON.stringify(url)} && document.readyState==='complete' && !!document.querySelector('.privacy-toggle') && !!document.querySelector('#main-content')?.children.length && !document.querySelector('#main-content .notice[data-busy=true]') && ${title === undefined ? "!!document.querySelector('#fund-chart-title')" : `document.querySelector('h1')?.textContent===${JSON.stringify(title)}`}`) === true, route);
    await evaluate("if(document.querySelector('.privacy-toggle').getAttribute('aria-pressed')==='true')document.querySelector('.privacy-toggle').click()");
    await delay(500);
    await check("document.querySelector('.status-chip')?.getAttribute('aria-label')==='Demo data'", `${route}: signed-out synthetic boundary`);
  };
  const openDetails = async (): Promise<void> => {
    await evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)");
    await delay(450);
  };
  const snapshot = async (assign = false): Promise<RenderedControl[]> => await evaluate(`(()=>{
    const selector='button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="option"],[role="slider"],[role="link"],[tabindex]:not([tabindex="-1"]),.chart-svg';
    const nodes=[...document.querySelectorAll(selector)].filter(n=>{const r=n.getBoundingClientRect();let p=n.parentElement;while(p){if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(n))return false;p=p.parentElement}return r.width>0&&r.height>0&&!n.closest('[hidden],[inert],[aria-hidden=true]')&&getComputedStyle(n).visibility!=='hidden'});
    return nodes.map((n,i)=>{if(${String(assign)})n.setAttribute('data-interaction-audit',String(i));const s=getComputedStyle(n);return {id:n.getAttribute('data-interaction-audit'),tag:n.tagName.toLowerCase(),label:n.getAttribute('href')?.startsWith('mailto:')?'Contact email':(n.getAttribute('aria-label')||n.textContent||n.getAttribute('type')||n.tagName).trim().replace(/\\s+/g,' ').slice(0,90),family:s.getPropertyValue('--interaction-family').trim(),disabled:n.matches(':disabled,[aria-disabled=true]'),signature:JSON.stringify({'box-shadow':s.boxShadow,'border-color':s.borderColor,'background-color':s.backgroundColor,opacity:s.opacity,filter:s.filter,scale:s.scale,translate:s.translate,transform:s.transform,'text-underline-offset':s.textUnderlineOffset}),animated:s.transitionProperty.split(',').map((p,i)=>parseFloat(s.transitionDuration.split(',')[i%s.transitionDuration.split(',').length])>0?p.trim():'').filter(Boolean),duration:s.transitionDuration.split(',').some(v=>parseFloat(v)>0)}})
  })()`) as RenderedControl[];
  const survey = async (state: string): Promise<void> => {
    const previousProblems = problems.length;
    // Owner journeys intentionally focus the active period and Undo. CSS state sampling must
    // start unfocused; otherwise applying focus again tests an already-active state.
    await evaluate("document.activeElement?.blur();getComputedStyle(document.documentElement).opacity");
    await waitFor(async () => await evaluate("document.getAnimations().every(a=>a.playState!=='running'||a.effect?.getComputedTiming().iterations===Infinity)") === true, `${state}: neutral animation settlement`);
    const rest = await snapshot(true);
    report.push({ state, controls: rest });
    const document = await call("DOM.getDocument");
    const rootId = (document["root"] as { nodeId: number }).nodeId;
    const selected = await call("DOM.querySelectorAll", { nodeId: rootId, selector: "[data-interaction-audit]" });
    const ids = selected["nodeIds"] as number[];
    const force = async (pseudoClasses: readonly string[]): Promise<void> => {
      await Promise.all(ids.map(nodeId => call("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudoClasses })));
      await delay(60);
    };
    const hover = !process.argv.includes("--focus-only") && await evaluate("matchMedia('(hover:hover) and (pointer:fine)').matches") === true;
    await force(hover ? ["hover"] : ["focus", "focus-visible"]);
    const inspection = await snapshot();
    await force(["focus", "focus-visible"]);
    const focused = await snapshot();
    await force(["active"]);
    const pressed = await snapshot();
    await force([]);
    await waitFor(async () => await evaluate("document.getAnimations().every(a=>a.playState!=='running'||a.effect?.getComputedTiming().iterations===Infinity)") === true, `${state}: release animation settlement`);
    const released = await snapshot();
    const animates = (before: RenderedControl, after: RenderedControl | undefined): boolean => {
      if (after === undefined) return false;
      const a = JSON.parse(before.signature) as Record<string, string>;
      const b = JSON.parse(after.signature) as Record<string, string>;
      return Object.keys(a).some(property => a[property] !== b[property] && (before.animated.includes(property) || before.animated.includes("all")));
    };
    for (const control of rest) {
      if (!control.family) problems.push(`${state}: ${control.tag} ${control.label}: no interaction family`);
      if (control.disabled) continue;
      if (released.find(entry => entry.id === control.id)?.signature !== control.signature) problems.push(`${state}: ${control.family} ${control.label}: release did not settle back to its original state`);
      const seen = inspection.find(entry => entry.id === control.id);
      if (!animates(control, control.family === "chart-inspection" && !hover ? pressed.find(entry => entry.id === control.id) : seen)) problems.push(`${state}: ${control.family} ${control.label}: missing animated ${hover ? "hover" : "focus"} feedback`);
      if (control.family !== "chart-inspection" && !animates(control, focused.find(entry => entry.id === control.id))) problems.push(`${state}: ${control.family} ${control.label}: missing animated keyboard focus feedback`);
      if (["action", "period-option", "choice", "chart-mark"].includes(control.family) && !animates(control, pressed.find(entry => entry.id === control.id))) problems.push(`${state}: ${control.family} ${control.label}: missing press feedback`);
    }
    if (problems.length > previousProblems) console.log(problems.slice(previousProblems).join("\n"));
    controlSamples += rest.length;
    console.log(`Inspected ${String(rest.length)} controls: ${state}.`);
  };

  // Portfolio: inspect the complete range-to-chart journey, not only selector declarations.
  await visit("overview");
  await survey("Portfolio / desktop / initial");
  // The wide Performance card spans the hero and Changes rows: its plot uses the spare height instead of leaving a void.
  await waitFor(async () => await evaluate("(()=>{const card=document.querySelector('.portfolio-trend .chart');const last=card.lastElementChild.getBoundingClientRect();return card.getBoundingClientRect().bottom-last.bottom<=40&&document.querySelector('.portfolio-trend .chart-svg').getBoundingClientRect().height>300})()") === true, "wide Performance plot filling its card");
  await check("(()=>{const svg=document.querySelector('.portfolio-trend .chart-svg');const box=svg.getBoundingClientRect();return box.height<=box.width*0.8+1&&box.height<=561})()", "filled Performance plot stays a wide, bounded shape");
  // The headline carries the change since last month beside the total.
  await check("!!document.querySelector('.hero .hero-delta .pill') && document.querySelector('.hero .hero-delta').getBoundingClientRect().top>document.querySelector('.hero .hero-value').getBoundingClientRect().top", "the hero shows the month's change beside the total");
  // Each held fund shows its weight as a bar that matches its percentage, and a trend line under its value; the rail names what moved most.
  await check("(()=>{const rows=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.closed):not(.holdings-group)')];const pcts=rows.map(row=>parseFloat(row.children[2].textContent.replace(/\\./g,'').replace(',','.')));const top=Math.max(...pcts);return rows.length>0&&rows.every((row,i)=>{const bar=row.querySelector('.share-bar > span');return !!bar&&Math.abs(parseFloat(bar.style.inlineSize)-pcts[i]/top*100)<0.2&&row.querySelector('.share-bar').getAttribute('aria-hidden')==='true'})&&Math.abs(parseFloat(rows[pcts.indexOf(top)].querySelector('.share-bar > span').style.inlineSize)-100)<0.01})()", "each held fund's weight bar compares its share with the largest holding");
  await check("(()=>{const lines=[...document.querySelectorAll('.desktop-holdings .holdings-table td .sparkline')];return lines.length>0&&lines.every(line=>line.getAttribute('aria-hidden')==='true'&&!!line.querySelector('.spark-line'))})()", "held funds show a decorative trend line under their value");
  await check("(()=>{const card=document.querySelector('.movers-card');const links=[...card.querySelectorAll('a.mover')];const size=a=>Math.abs(parseFloat(a.querySelector('.mover-figures').firstElementChild.textContent.replace(/[^0-9,]/g,'').replace(',','.')));return links.length>=1&&links.length<=3&&links.every(a=>a.getAttribute('href').startsWith('#fund/'))&&links.every((a,i)=>i===0||size(links[i-1])>=size(a))&&!!card.closest('.portfolio-rail')?.querySelector('.allocation-card')})()", "the rail names up to three funds by size of change, each linking to its fund, beside allocation");
  // The total row repeats the portfolio's own figures and agrees with the rows it sums.
  await check("(()=>{const n=text=>parseFloat(text.replace(/[^0-9,\\-]/g,'').replace(',','.'));const body=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.holdings-group)')];const total=document.querySelector('.desktop-holdings .holdings-table tfoot tr.holdings-total');const sum=index=>body.reduce((acc,row)=>acc+(Number.isNaN(n(row.children[index].textContent))?0:n(row.children[index].textContent)),0);return !!total&&total.children[1].textContent===document.querySelector('.hero .hero-value').textContent&&Math.abs(n(total.children[1].textContent)-sum(1))<0.02&&Math.abs(n(total.children[4].textContent)-sum(4))<0.02&&Math.abs(n(total.children[5].textContent)-sum(5))<0.02})()", "the holdings total row matches the headline and the sum of its rows");
  await check("document.querySelectorAll('.desktop-holdings .holdings-group').length===0", "a short list stays one table without group headers");
  // The holdings table fits its card: every column keeps its full figure and nothing is clipped at the card edge.
  await check("(()=>{const region=document.querySelector('.desktop-holdings');return getComputedStyle(region).display!=='none'&&region.scrollWidth<=region.clientWidth+1&&[...region.querySelectorAll('td, th')].every(cell=>cell.scrollWidth<=cell.clientWidth+1)})()", "no holdings figure is clipped by its column or the card edge");
  // Holdings sort: a header sorts, repeating reverses, a third choice restores the saved order, and the order is announced.
  await evaluate("window.auditHoldingNames=()=>[...document.querySelectorAll('.desktop-holdings .holdings-table tbody th a')].map(a=>a.textContent)");
  await evaluate("window.auditDefaultOrder=window.auditHoldingNames().join('|')");
  await evaluate("[...document.querySelectorAll('.sort-button')].find(button=>button.textContent==='Gain %').click()");
  await delay(300);
  await check("(()=>{const th=[...document.querySelectorAll('.desktop-holdings .holdings-table thead th')].find(n=>n.textContent.trim()==='Gain %');const held=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.closed):not(.holdings-group)')].map(row=>parseFloat(row.children[3].textContent.replace('+','').replace('.','').replace(',','.')));const last=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.holdings-group)')].at(-1);return th.getAttribute('aria-sort')==='descending'&&held.length>1&&held.every((value,index)=>index===0||held[index-1]>=value)&&last.classList.contains('closed')&&[...document.querySelectorAll('[role=status]')].some(n=>n.textContent.includes('sorted by Gain %, highest first'))})()", "a column sorts holdings high to low, keeps sold funds last and announces it");
  await evaluate("[...document.querySelectorAll('.sort-button')].find(button=>button.textContent==='Gain %').click()");
  await delay(300);
  await check("[...document.querySelectorAll('.desktop-holdings .holdings-table thead th')].find(n=>n.textContent.trim()==='Gain %').getAttribute('aria-sort')==='ascending'", "choosing the column again reverses it");
  await evaluate("[...document.querySelectorAll('.sort-button')].find(button=>button.textContent==='Gain %').click()");
  await delay(300);
  await check("window.auditHoldingNames().join('|')===window.auditDefaultOrder && [...document.querySelectorAll('.desktop-holdings .holdings-table thead th')].every(n=>n.getAttribute('aria-sort')==='none')", "a third choice restores the saved order");
  // Journey order: summary and performance, then the fund list, then analysis. Analysis cards end with their content.
  await check("(()=>{const holdings=document.querySelector('.portfolio-holdings');const analysis=document.querySelector('.dashboard-analysis');return !!holdings&&!!analysis&&holdings.getBoundingClientRect().top<analysis.getBoundingClientRect().top&&!!(holdings.compareDocumentPosition(analysis)&Node.DOCUMENT_POSITION_FOLLOWING)})()", "holdings come before trends and comparisons");
  await check("[...document.querySelectorAll('.analysis-grid > .card')].every(card=>{const style=getComputedStyle(card);const room=card.getBoundingClientRect().bottom-card.lastElementChild.getBoundingClientRect().bottom;return room<=parseFloat(style.paddingBottom)+16})", "analysis cards end with their content instead of stretching into empty space");
  await evaluate("[...document.querySelectorAll('.portfolio-explore .page-nav button')].find(button=>button.textContent==='Holdings').click()");
  await check("document.activeElement?.id==='holdings-heading' && location.hash==='#overview'", "portfolio orientation moves focus to holdings without changing route");
  await evaluate("[...document.querySelectorAll('.portfolio-explore .page-nav button')].find(button=>button.textContent==='Trends and comparisons').click()");
  await check("document.activeElement?.id==='portfolio-analysis' && !!document.querySelector('.dashboard-analysis .analysis-grid') && !document.querySelector('#portfolio-analysis')?.closest('details:not([open])')", "portfolio orientation focuses visible trends");
  await evaluate("document.querySelector('.portfolio-history-link').click()");
  await waitFor(async () => await evaluate("location.hash==='#months' && !!document.querySelector('.mobile-months select')") === true, "direct month-by-month navigation");
  await check("getComputedStyle(document.querySelector('.mobile-months')).display!=='none'", "statement selector is visible on desktop");
  await check("(()=>{const sections=[...document.querySelector('.months').children];return sections.findIndex(n=>n.classList.contains('month-matrices'))<sections.findIndex(n=>n.classList.contains('mobile-months')) && !!document.querySelector('.month-matrices .totals') && !document.querySelector('.month-matrices')?.closest('details:not([open])')})()", "month comparison is visible before the statement inspector");
  await visit("overview");
  await check("[...document.querySelectorAll('.range-selector button')].every(n=>getComputedStyle(n).getPropertyValue('--interaction-family').trim()==='period-option')", "period options retain their specific contract classification");
  await evaluate("window.auditSelector=document.querySelector('.range-selector');window.auditOption=window.auditSelector.querySelector('button');window.auditChart=document.querySelector('#total-chart-title').closest('figure');window.auditPaths=[...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d'));window.auditOption.focus();window.auditOption.click()");
  await delay(70);
  await check("document.querySelector('.range-selector')===window.auditSelector && document.querySelector('.range-selector button')===window.auditOption && document.activeElement===window.auditOption", "range change retains DOM and keyboard focus");
  await check("document.querySelector('.range-selector button[aria-pressed=true]').textContent==='3M' && document.querySelectorAll('.range-selector button[tabindex=\"0\"]').length===1", "range selection and roving tab stop");
  await check("window.auditSelector.getAnimations({subtree:true}).some(a=>a.transitionProperty==='transform'&&a.playState==='running')", "selection pill is moving between positions");
  await check("window.auditChart.querySelector('.chart-svg').getAnimations().some(a=>a.playState==='running')", "resulting chart has an update cue");
  await check("JSON.stringify([...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d')))!==JSON.stringify(window.auditPaths)", "range applies actual chart geometry immediately");
  await evaluate("window.auditGeometry=[...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d'))");
  await delay(250);
  await check("JSON.stringify(window.auditGeometry)===JSON.stringify([...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d')))", "chart cue never interpolates financial paths");
  await evaluate("window.auditPaths=[...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d'));window.auditOption.click()");
  await delay(50);
  await check("!window.auditChart.querySelector('.chart-svg').getAnimations().some(a=>a.playState==='running') && JSON.stringify([...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d')))===JSON.stringify(window.auditPaths)", "active-period reselect does not restart chart or change data");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight" });
  await delay(40);
  await check("document.activeElement.textContent==='6M' && document.activeElement.getAttribute('aria-pressed')==='true'", "arrow key synchronizes focus and selection");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "End", code: "End" });
  await delay(50);
  await check("document.activeElement.textContent==='All' && document.activeElement.getAttribute('aria-pressed')==='true'", "End selects All");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Home", code: "Home" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Home", code: "Home" });
  await delay(40);
  await check("document.activeElement.textContent==='3M'", "Home selects 3M");
  await evaluate("[...window.auditSelector.querySelectorAll('button')].find(b=>b.textContent==='All').click()");
  await delay(50);
  await evaluate("[...window.auditSelector.querySelectorAll('button')].find(b=>b.textContent==='6M').click()");
  await delay(40);
  await evaluate("[...window.auditSelector.querySelectorAll('button')].find(b=>b.textContent==='3M').click()");
  await delay(280);
  await check("window.auditSelector===document.querySelector('.range-selector') && window.auditSelector.querySelector('[aria-pressed=true]').textContent==='3M'", "rapid range changes settle on the latest period");
  await evaluate("[...window.auditSelector.querySelectorAll('button')].find(b=>b.textContent==='All').focus()");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await delay(50);
  await check("document.activeElement.textContent==='All' && document.activeElement.getAttribute('aria-pressed')==='true'", "Enter activates the focused period");
  await evaluate("window.auditOption.focus()");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " ", unmodifiedText: " " });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await delay(50);
  await check("document.activeElement===window.auditOption && document.activeElement.getAttribute('aria-pressed')==='true'", "Space activates the focused period");
  await evaluate("window.auditSelector.dir='rtl'");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight" });
  await delay(50);
  await check("document.activeElement.textContent==='All'", "RTL arrow navigation reverses correctly");
  // Renderer scheduling on CI can outlast a fixed delay; inspect final geometry only after actual settlement.
  await waitFor(async () => await evaluate("(()=>{getComputedStyle(window.auditSelector,'::before').transform;return window.auditSelector.getAnimations({subtree:true}).every(a=>a.playState!=='running')})()") === true, "RTL selection pill animation settlement");
  await check("(()=>{const r=window.auditSelector.getBoundingClientRect(),s=getComputedStyle(window.auditSelector,'::before'),x=new DOMMatrixReadOnly(s.transform).m41,w=parseFloat(s.width),b=document.activeElement.getBoundingClientRect();return Math.abs((r.right-3-w/2+x)-(b.left+b.width/2))<2})()", "RTL selection pill aligns with the selected option");
  await evaluate("window.auditSelector.dir='ltr';window.auditOption.focus()");
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("window.auditOption.click()");
  await delay(40);
  await check("window.auditChart.getAnimations({subtree:true}).every(a=>a.playState!=='running') && document.activeElement===window.auditOption", "reduced-motion range update retains focus with no running motion");
  const reducedDocument = await call("DOM.getDocument");
  const reducedOption = await call("DOM.querySelector", { nodeId: (reducedDocument["root"] as { nodeId: number }).nodeId, selector: ".range-selector button" });
  await call("CSS.forcePseudoState", { nodeId: reducedOption["nodeId"], forcedPseudoClasses: ["active"] });
  await check("(()=>{const s=getComputedStyle(window.auditOption);return (s.scale==='none'||s.scale==='1')&&(s.translate==='none'||/^0px(?: 0px)?$/.test(s.translate))})()", "reduced-motion press stays geometrically still");
  await call("CSS.forcePseudoState", { nodeId: reducedOption["nodeId"], forcedPseudoClasses: [] });
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await evaluate("document.querySelector('.privacy-toggle').click();[...window.auditSelector.querySelectorAll('button')].find(b=>b.textContent==='6M').click()");
  await delay(60);
  await check("document.querySelector('.privacy-toggle').getAttribute('aria-pressed')==='true' && window.auditChart.querySelector('.chart-svg').getAnimations().some(a=>a.playState==='running') && !window.auditChart.querySelector('[data-value]')", "hidden-amount range changes retain motion without exposing values");
  await evaluate("document.querySelector('.privacy-toggle').click()");
  await delay(40);
  await check("window.auditChart.querySelector('.chart-svg').getAnimations().every(a=>a.playState!=='running')", "privacy changes immediately cancel a running plot cue");
  await openDetails();
  await survey("Portfolio / desktop / disclosures open");
  await check("(()=>{const groups=[...document.querySelectorAll('.recent-fund-history-group')];return groups.length>0&&groups.every(group=>group.querySelectorAll('tbody tr').length===3)&&document.querySelector('.recent-fund-history a[href=\"#months\"]')!==null})()", "recent fund history shows three dated statements and the full comparison link");
  await evaluate("document.querySelector('.privacy-toggle').click()");
  await check("[...document.querySelectorAll('.recent-fund-history .amount')].every(amount=>amount.classList.contains('masked')||amount.textContent.trim()==='-')", "recent fund history hides amounts immediately");
  await evaluate("document.querySelector('.privacy-toggle').click()");
  const fund = await evaluate("document.querySelector('.holdings-table a')?.getAttribute('href')") as string;
  await visit(fund.slice(1));
  await openDetails();
  // Fund journey: figures first, then the chart, then the statement history, newest first, in reading order.
  await check("(()=>{const hero=document.querySelector('.fund-hero');const chart=document.querySelector('#fund-chart, .chart');const history=document.querySelector('.fund-history');return !!hero&&!!chart&&!!history&&!!(hero.compareDocumentPosition(chart)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(chart.compareDocumentPosition(history)&Node.DOCUMENT_POSITION_FOLLOWING)&&hero.querySelectorAll('.fund-figure').length===5})()", "fund page leads with its figures, then the chart, then its history");
  await check("(()=>{const rows=[...document.querySelectorAll('.fund-history tbody tr')];return rows.length>1&&rows.length<=12&&Date.parse(rows[0].querySelector('th').textContent)>Date.parse(rows[1].querySelector('th').textContent)})()", "fund statement history is newest first");
  await check("document.querySelector('.fund-hero').getBoundingClientRect().height<320", "fund figures do not stretch into an empty card");
  await survey("Fund / desktop / disclosures open");
  await evaluate("window.auditFundSelector=document.querySelector('.range-selector');window.auditFundOption=window.auditFundSelector.querySelectorAll('button')[0];window.auditFundOption.focus();window.auditFundOption.click()");
  await delay(50);
  await check("document.querySelector('.range-selector')===window.auditFundSelector && document.activeElement===window.auditFundOption", "fund period change also preserves selector and focus");
  await visit("months");
  await openDetails();
  // Best and worst marks are off until asked for; when on, each portfolio row marks exactly its largest and smallest displayed figures, in text as well as colour, without moving any column.
  await check("document.querySelectorAll('.matrix-mark').length===0&&!document.querySelector('.matrix-marks-toggle input').checked", "best and worst marks are off by default");
  await evaluate("window.auditHeadLefts=()=>[...document.querySelectorAll('.month-matrices thead')].map(head=>[...head.querySelectorAll('th')].map(th=>Math.round(th.getBoundingClientRect().left)).join(','))");
  await evaluate("window.auditHeadsBefore=window.auditHeadLefts()");
  await evaluate("document.querySelector('.matrix-marks-toggle input').click()");
  await delay(300);
  await check("(()=>{const n=text=>{const t=text.replace(/[^0-9,\\-+]/g,'');return t===''||t==='-'?null:parseFloat(t.replace(',','.'))};const rows=[...document.querySelectorAll('.matrix.totals tbody tr')];return rows.length>=9&&rows.every(row=>{const cells=[...row.querySelectorAll('td')];const values=cells.map(cell=>n(cell.textContent));const present=values.filter(v=>v!==null);const marked=cells.some(cell=>cell.matches('.matrix-best, .matrix-worst'));if(present.length<3||Math.max(...present)===Math.min(...present))return !marked;const high=Math.max(...present);const low=Math.min(...present);return cells.every((cell,i)=>cell.classList.contains('matrix-best')===(values[i]===high)&&cell.classList.contains('matrix-worst')===(values[i]===low))})})()", "each portfolio row marks exactly its largest and smallest displayed figures");
  await check("(()=>{const cells=[...document.querySelectorAll('.matrix td.matrix-best, .matrix td.matrix-worst')];return cells.length>0&&cells.every(cell=>{const glyph=cell.querySelector('.matrix-mark');const text=cell.querySelector('.visually-hidden')?.textContent??'';return glyph?.getAttribute('aria-hidden')==='true'&&(cell.classList.contains('matrix-best')?text.includes('Best in row'):text.includes('Worst in row'))})&&document.querySelectorAll('.month-matrices .table-scroll')[1].querySelectorAll('.matrix-mark').length===0})()", "every mark is also written in text, and the fund table carries none");
  await check("window.auditHeadLefts().join('|')===window.auditHeadsBefore.join('|')", "turning marks on moves no column");
  await evaluate("document.querySelector('.matrix-marks-toggle input').click()");
  await delay(300);
  await check("document.querySelectorAll('.matrix-mark').length===0&&window.auditHeadLefts().join('|')===window.auditHeadsBefore.join('|')", "turning marks off removes them and restores the matrix exactly");
  await survey("Months / desktop / disclosures open");
  // Checkpoints: the sample chart draws value-only markers (never joined), and the screen lists them with the form switched off while signed out.
  await visit("overview");
  await waitFor(async () => await evaluate("document.querySelectorAll('.portfolio-trend .checkpoint-marker').length>=1") === true, "sample checkpoint markers on the Performance chart");
  await check("[...document.querySelectorAll('.portfolio-trend .chart-series')].filter(g=>g.querySelector('.checkpoint-marker')).every(g=>!g.querySelector('path.line'))", "checkpoint markers are never joined by a line");
  await visit("checkpoints");
  await survey("Checkpoints / desktop / signed out");
  await check("document.querySelectorAll('.checkpoint-list > li').length===2 && !!document.querySelector('.checkpoint-form button[type=submit]').disabled", "the sample checkpoints are listed and saving is switched off while signed out");
  await visit("overview", 1440, "many");
  await openDetails();
  await survey("Portfolio / twelve funds / search and disclosures");
  // With twelve funds the total still equals the sum of its rows; a search hides it behind an explanation instead of a partial sum.
  await check("(()=>{const n=text=>parseFloat(text.replace(/[^0-9,\\-]/g,'').replace(',','.'));const body=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.holdings-group)')];const total=document.querySelector('.desktop-holdings .holdings-table tfoot tr.holdings-total');const sum=index=>body.reduce((acc,row)=>acc+(Number.isNaN(n(row.children[index].textContent))?0:n(row.children[index].textContent)),0);return body.length>=10&&!!total&&Math.abs(n(total.children[1].textContent)-sum(1))<0.05&&Math.abs(n(total.children[4].textContent)-sum(4))<0.05&&Math.abs(n(total.children[5].textContent)-sum(5))<0.05})()", "twelve funds: the total row still equals the sum of its rows");
  await evaluate("(()=>{const input=document.getElementById('fund-search');input.value='Fund A';input.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await delay(400);
  await check("(()=>{const foot=document.querySelector('.desktop-holdings .holdings-table tfoot');return foot.querySelectorAll('td[colspan]').length===1&&foot.textContent.includes('Totals cover every fund')&&!foot.querySelector('.pill')})()", "a search replaces the totals with an explanation instead of a partial sum");
  await evaluate("(()=>{const input=document.getElementById('fund-search');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await delay(400);
  await check("!!document.querySelector('.desktop-holdings .holdings-table tfoot .pill')", "clearing the search brings the totals back");
  // Twelve funds with two sold read as two blocks with their counts; the sold block folds away without changing the total.
  await check("(()=>{const heads=[...document.querySelectorAll('.desktop-holdings .holdings-group')];const text=heads.map(row=>row.textContent.replace(/\\s+/g,' ').trim());const held=document.querySelectorAll('#holdings-held-rows tr:not(.holdings-group)').length;const closed=document.querySelectorAll('#holdings-closed-rows tr:not(.holdings-group)').length;return heads.length===2&&text[0].startsWith('Held funds')&&text[0].endsWith(String(held))&&text[1].startsWith('Closed funds')&&text[1].endsWith(String(closed))&&held>0&&closed>0&&document.querySelector('.group-toggle').getAttribute('aria-expanded')==='true'})()", "long holdings lists group held and closed funds with their counts");
  await evaluate("document.querySelector('.group-toggle').click()");
  await delay(300);
  await check("document.querySelector('.group-toggle').getAttribute('aria-expanded')==='false'&&document.querySelectorAll('#holdings-closed-rows tr:not(.holdings-group)').length===0&&!!document.querySelector('.desktop-holdings .holdings-table tfoot .pill')", "folding the closed funds keeps the total row");
  await evaluate("document.querySelector('.group-toggle').click()");
  await delay(300);
  await check("document.querySelector('.group-toggle').getAttribute('aria-expanded')==='true'&&document.querySelectorAll('#holdings-closed-rows tr:not(.holdings-group)').length>0", "opening the closed funds shows them again");
  // Short histories have no returns grid; three years of demo history show it, with no reminder (the demo's dates are invented), and its figures are the Month by month matrix's own.
  await check("!document.querySelector('.returns-card') && !document.querySelector('.attention')", "a history within one calendar year has no returns grid and demo data asks for nothing");
  await visit("overview", 1440, "long");
  await openDetails();
  await check("(()=>{const rows=[...document.querySelectorAll('.returns-table tbody tr')];return rows.length===3&&rows.every(row=>row.querySelectorAll('td').length===12)&&!document.querySelector('.attention')&&document.querySelector('.returns-card').getBoundingClientRect().width>600})()", "three years of demo history show the monthly returns grid and no reminder");
  await survey("Portfolio / three years / monthly returns");
  await evaluate("window.auditGridValues=[...document.querySelectorAll('.returns-cell')].map(cell=>cell.textContent.trim()).filter(text=>text!=='-')");
  await evaluate("location.hash='#months'");
  await waitFor(async () => await evaluate("!!document.querySelector('.matrix.totals')") === true, "month matrix for the long history");
  await check("(()=>{const rows=[...document.querySelectorAll('.matrix.totals tbody tr')];const at=rows.findIndex(row=>row.textContent.includes('Growth from previous month'));const cells=[...rows[at+1].querySelectorAll('td')].map(cell=>cell.textContent.trim()).filter(text=>text!=='-');return cells.length===window.auditGridValues.length&&cells.every((text,index)=>text===window.auditGridValues[index])})()", "the returns grid shows exactly the month-on-month percentages of the Month by month matrix, in order");
  await visit("expenses");
  await openDetails();
  // A long record uses the wide card's width (two columns, still newest first) without overflowing; the phone keeps one column.
  await check("(()=>{const list=document.querySelector('.expense-record-list');const rows=[...list.children];return rows.length>=6&&getComputedStyle(list).columnCount==='2'&&list.scrollWidth<=list.clientWidth+1&&rows.every(row=>row.getBoundingClientRect().width>200)&&document.documentElement.scrollWidth<=innerWidth})()", "a long expense record flows into two columns on a wide screen");
  await survey("Expenses / desktop / initial and disclosures");
  if (await evaluate("![...document.querySelectorAll('.expense-week-list button')].some(b=>b.querySelector('.expense-week-state').textContent==='Recorded')") === true) {
    await evaluate("document.querySelector('.expense-week-controls button[aria-label=\"Previous week\"]').click()");
    await waitFor(async () => await evaluate("[...document.querySelectorAll('.expense-week-list button')].some(b=>b.querySelector('.expense-week-state').textContent==='Recorded')") === true, "a recorded synthetic workday in the previous week");
  }
  await evaluate("[...document.querySelectorAll('.expense-week-list button')].find(b=>b.querySelector('.expense-week-state').textContent==='Recorded').click()");
  await delay(100);
  await evaluate("const addedCost=document.querySelector('#expense-4');addedCost.value='4,50';addedCost.dispatchEvent(new Event('input',{bubbles:true}))");
  await delay(100);
  await check("document.querySelector('.expense-save-button').textContent==='Save added expenses'", "Expenses: adding to a saved blank is a direct save");
  await evaluate("document.querySelector('.expense-save-button').click()");
  await delay(250);
  await check("!document.querySelector('.expense-review') && document.querySelector('#expense-4').value==='4,50' && document.querySelector('.expense-save-button').disabled", "Expenses: incremental addition saved without correction review");
  await evaluate("const input=document.querySelector('#expense-0');if(input){input.value='7,50';input.dispatchEvent(new Event('input',{bubbles:true}))}");
  await delay(100);
  await evaluate("[...document.querySelectorAll('.expense-entry button')].find(b=>b.textContent==='Review correction')?.click()");
  await delay(250);
  await check("document.querySelector('.expense-review dl').children.length===1", "Expenses: correction review shows only changed fields");
  await survey("Expenses / correction review / synthetic draft only");
  await evaluate("[...document.querySelectorAll('.expense-review button')].find(b=>b.textContent==='Keep editing')?.click()");
  await delay(100);
  await evaluate("[...document.querySelectorAll('.expense-entry button')].find(b=>b.textContent==='Discard draft')?.click()");
  await delay(150);
  await visit("import");
  await openDetails();
  await survey("Import / file entry and JSON tools");
  await evaluate("document.querySelector('[aria-controls=manual-entry-panel]').click()");
  await delay(250);
  await survey("Import / manual fields");
  await check("document.querySelector('.manual-fund button').textContent==='Remove fund'", "Manual entry: a new row has a draft-removal action");
  await evaluate("document.querySelector('.manual-fund button').click()");
  await delay(450);
  await check("document.querySelector('.manual-entry .notice').textContent.includes('Nothing has been saved.') && !document.querySelector('.manual-entry .notice').textContent.includes('sale')", "Manual entry: new-row removal has no sale implication");
  await survey("Import / removal and undo notice");
  await evaluate("document.querySelector('#undo-removed-fund').click()");
  await delay(450);
  await check("!!document.querySelector('.manual-fund') && document.activeElement?.id.endsWith('-name')", "Manual entry: undo restores the row and field focus");
  // One statement, start to review: the journey shows what is done, the categories are reference, and each explanation is said once.
  await visit("import", 1440, "many");
  const singleDocument = await call("DOM.getDocument");
  const singleInput = await call("DOM.querySelector", { nodeId: (singleDocument["root"] as { nodeId: number }).nodeId, selector: "input[type=file]" });
  await call("DOM.setFileInputFiles", { nodeId: singleInput["nodeId"], files: [resolve("dist/acceptance/onboarding/individual/synthetic-bank-2026-03-31.xlsx")] });
  await waitFor(async () => await evaluate("document.body.innerText.includes('Review ready')") === true, "single statement review");
  await check("(()=>{const steps=[...document.querySelectorAll('.journey-steps li')];return steps[0].dataset.done==='true'&&steps[1].getAttribute('aria-current')==='step'&&!steps[2].dataset.done&&steps[0].textContent.includes('completed')})()", "the import journey marks finished steps and the current one");
  await check("(()=>{const details=[...document.querySelectorAll('.review .more details')].find(d=>d.querySelector('summary')?.textContent.includes('Categories in the file'));return !!details&&!details.open&&!!details.querySelector('table')})()", "the file's categories are reference material behind a closed disclosure");
  await check("(()=>{const inputs=[...document.querySelectorAll('.fund-question input[type=text]')];return inputs.length>0&&inputs.every(input=>{const ids=(input.getAttribute('aria-describedby')??'').split(' ').filter(Boolean);return ids.length>0&&ids.every(id=>!!document.getElementById(id))})&&document.querySelectorAll('.fund-question .cash-field-help').length===0})()", "starting balance fields share one explanation and every field still points to real help text");
  await visit("history");
  await openDetails();
  const document = await call("DOM.getDocument");
  const input = await call("DOM.querySelector", { nodeId: (document["root"] as { nodeId: number }).nodeId, selector: "#statement-file" });
  await call("DOM.setFileInputFiles", { nodeId: input["nodeId"], files: [resolve("dist/acceptance/onboarding/combined/synthetic-history.xlsx")] });
  await waitFor(async () => await evaluate("document.body.innerText.includes('Check your statements')") === true, "synthetic history review");
  await openDetails();
  await survey("History / generated synthetic XLSX selection review");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Review selected statements in date order').click()");
  await waitFor(async () => await evaluate("document.querySelectorAll('.fund-question input[type=text]').length===2") === true, "opening-balance review");
  await evaluate("document.querySelectorAll('.fund-question input[type=text]').forEach(n=>{n.value='1.000,00';n.dispatchEvent(new Event('input',{bubbles:true}))})");
  await delay(100);
  await evaluate("[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()");
  await waitFor(async () => await evaluate("!!document.querySelector('.questions .choice')") === true, "second-statement movement review");
  await evaluate("document.querySelector('.questions .choice input').click()");
  await waitFor(async () => await evaluate("document.querySelectorAll('.cash-movements input').length===4") === true, "movement fields revealed");
  await check("!document.querySelector('.questions .summary')", "Cash review: blank movement amounts prevent a completed preview");
  await evaluate("[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()");
  await delay(100);
  await check("document.querySelector('#excel-history-heading').textContent==='Review statement 2 of 3' && !!document.querySelector('.fund-question .field-error')", "Cash review: continuing with blank amounts stays on the same review and explains the missing answer");
  await check("[...document.querySelectorAll('.cash-movements label')].every(n=>/Money (added to|received from) this fund/.test(n.textContent))", "Cash review: plain-language labels identify money direction");
  await check("(()=>{const inputs=[...document.querySelectorAll('.cash-movements input')];return inputs.length>0&&document.querySelectorAll('.questions [id$=\"-movement-help\"]').length===1&&inputs.every(input=>{const help=document.getElementById(input.getAttribute('aria-describedby')??'');return !!help&&help.textContent.includes('Money received')})})()", "Cash review: money added and received are explained once and every amount field points to that explanation");
  await evaluate("(()=>{const fields=document.querySelectorAll('.cash-movements input');['200','50'].forEach((v,i)=>{fields[i].value=v;fields[i].dispatchEvent(new Event('input',{bubbles:true}))});document.querySelectorAll('.cash-movements button')[1].click()})()");
  await delay(100);
  await check("[...document.querySelectorAll('.cash-movements input')].map(n=>n.value).join('|')==='200|50|0|0'", "Cash review: the per-fund no-movement action explicitly fills both zeroes");
  await check("document.querySelector('.fund-summary li').textContent.includes('1.150,00') && document.querySelector('.fund-summary').textContent.includes('Still held')", "Cash review: preview preserves full money in/out and canonical net invested");
  await survey("History / money added and received / desktop");
  await evaluate("document.querySelectorAll('.questions .choice input')[1].click()");
  await delay(450);
  await check("!document.querySelector('.cash-movements')", "Cash review: no-movement selection collapses the amount fields");
  await check("document.querySelector('.fund-summary li').textContent.includes('1.000,00') && !document.querySelector('.fund-summary li').textContent.includes('1.150,00')", "Cash review: hidden draft movements do not affect a no-movement preview");
  await evaluate("document.querySelector('.questions .choice input').click()");
  await delay(450);
  await check("[...document.querySelectorAll('.cash-movements input')].map(n=>n.value).join('|')==='200|50|0|0'", "Cash review: changing the global answer retains the edited amounts");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await call("Emulation.setTouchEmulationEnabled", { enabled: true });
  await survey("History / money added and received / phone");
  await evaluate("document.documentElement.style.fontSize='200%'");
  await check("document.documentElement.scrollWidth<=innerWidth", "Cash review: phone layout has no horizontal overflow at 200% text");
  await evaluate("document.documentElement.style.fontSize=''");
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("document.querySelectorAll('.questions .choice input')[1].click()");
  await delay(100);
  await evaluate("document.querySelector('.questions .choice input').click()");
  await delay(100);
  await check("document.querySelectorAll('.cash-movements input').length===4 && [...document.querySelectorAll('.cash-movements')].every(n=>n.getAnimations({subtree:true}).every(a=>a.playState!=='running'))", "Cash review: reduced motion keeps the same fields without moving them");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Return to statement selection (reset answers)').click()");
  await delay(450);
  await visit("connection");
  await openDetails();
  await survey("Your data / signed out / advanced controls");
  for (const route of ["overview", "expenses", "months", "checkpoints", "import", "connection"]) {
    await visit(route, 390);
    if (route === "months") {
      // Opening state: both tables open on the newest statement, which is tinted, and they line up column for column.
      // The tables keep following the end while layout settles (fonts, scrollbars), so wait for that rather than asserting at the first paint.
      const atNewest = "[...document.querySelectorAll('.month-matrices .table-scroll')].every(region=>region.scrollLeft>=region.scrollWidth-region.clientWidth-2)";
      try { await waitFor(async () => await evaluate(atNewest) === true, "both month tables open on the newest statement"); assertions++; }
      catch (error) {
        console.log(`Month tables geometry: ${String(await evaluate("JSON.stringify([...document.querySelectorAll('.month-matrices .table-scroll')].map(region=>({left:region.scrollLeft,width:region.scrollWidth,client:region.clientWidth})))"))}`);
        throw error;
      }
      await check("(()=>{const heads=[...document.querySelectorAll('.month-matrices thead')].map(head=>[...head.querySelectorAll('th')].slice(2));const tinted=heads.map(row=>row.filter(th=>th.classList.contains('matrix-selected')));return tinted.every(row=>row.length===1&&row[0]===[...row[0].parentElement.children].at(-1))&&heads[0].every((th,i)=>Math.abs(th.getBoundingClientRect().left-heads[1][i].getBoundingClientRect().left)<=2)})()", "the newest column is tinted and both tables share column positions");
      // Linked scrolling and frozen names, in both tables.
      await evaluate("(()=>{const regions=document.querySelectorAll('.month-matrices .table-scroll');window.auditFundNameLeft=regions[1].querySelector('tbody th.matrix-label').getBoundingClientRect().left;regions[1].scrollLeft=Math.max(0,regions[1].scrollLeft-200)})()");
      await delay(300);
      await check("(()=>{const regions=[...document.querySelectorAll('.month-matrices .table-scroll')];return Math.abs(regions[0].scrollLeft-regions[1].scrollLeft)<=1&&regions[1].scrollLeft<regions[1].scrollWidth-regions[1].clientWidth-50&&Math.abs(regions[1].querySelector('tbody th.matrix-label').getBoundingClientRect().left-window.auditFundNameLeft)<2})()", "scrolling either month table moves both, and fund names stay frozen");
      // The statement picker drives the tint.
      await evaluate("(()=>{const select=document.querySelector('.mobile-months select');select.value=select.options[select.options.length-1].value;select.dispatchEvent(new Event('change',{bubbles:true}))})()");
      await delay(300);
      await check("(()=>{const heads=[...document.querySelectorAll('.month-matrices thead')].map(head=>[...head.querySelectorAll('th')].slice(2));return heads.every(row=>row.filter(th=>th.classList.contains('matrix-selected')).length===1&&row[0].classList.contains('matrix-selected'))})()", "choosing an earlier statement moves the tint to its column in both tables");
      await evaluate("(()=>{const select=document.querySelector('.mobile-months select');select.value=select.options[0].value;select.dispatchEvent(new Event('change',{bubbles:true}))})()");
      await delay(300);
      await check("!!document.querySelector('.month-matrices .totals') && !document.querySelector('.month-matrices')?.closest('details:not([open])')", "month comparison is visible without expansion on phone");
      await evaluate("window.auditTotalsScroll=document.querySelector('[aria-label=\"Portfolio totals by month\"].table-scroll');window.auditTotalsScroll.scrollLeft=0;window.auditLabels=[...window.auditTotalsScroll.querySelectorAll('.matrix-label')];window.auditLefts=window.auditLabels.map(label=>label.getBoundingClientRect().left);window.auditFirstValue=window.auditTotalsScroll.querySelector('tbody td').getBoundingClientRect().left;window.auditTotalsScroll.scrollLeft=200");
      await check("window.auditTotalsScroll.scrollLeft>0 && window.auditLabels.length===6 && window.auditLabels.every((label,index)=>Math.abs(label.getBoundingClientRect().left-window.auditLefts[index])<2) && window.auditTotalsScroll.querySelector('tbody td').getBoundingClientRect().left<window.auditFirstValue-10", "portfolio row labels stay pinned while statement values scroll");
    }
    await openDetails();
    await survey(`${route} / phone / disclosures open`);
    if (route === "expenses") await check("getComputedStyle(document.querySelector('.expense-record-list')).columnCount==='auto'&&document.documentElement.scrollWidth<=innerWidth", "the phone expense record stays one column");
    if (route === "overview") await check("Math.round(document.querySelector('.portfolio-trend .chart-svg').getBoundingClientRect().height)===200", "phone Performance plot keeps its compact height");
    if (route === "overview") {
      await check("getComputedStyle(document.querySelector('.holdings-sort-mobile')).display!=='none'&&getComputedStyle(document.querySelector('.desktop-holdings')).display==='none'", "phone holdings offer one sort list instead of table headers");
      await evaluate("window.auditPhoneNames=()=>[...document.querySelectorAll('.mobile-holdings .holding-name')].map(n=>n.textContent).join('|');window.auditPhoneDefault=window.auditPhoneNames();(()=>{const select=document.getElementById('holdings-sort');select.value='gainPercent:asc';select.dispatchEvent(new Event('change',{bubbles:true}))})()");
      await delay(300);
      await check("window.auditPhoneNames()!==window.auditPhoneDefault && document.getElementById('holdings-sort').value==='gainPercent:asc'", "the phone sort list reorders holdings");
      await evaluate("(()=>{const select=document.getElementById('holdings-sort');select.value='';select.dispatchEvent(new Event('change',{bubbles:true}))})()");
      await delay(300);
      await check("window.auditPhoneNames()===window.auditPhoneDefault", "choosing the default order restores the saved order");
    }
    if (route === "overview") {
      const point = await evaluate("(()=>{const n=document.querySelector('.chart-svg');n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()") as { x: number; y: number };
      await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await delay(60);
      await check("!!document.querySelector('.chart-guide')", "touch chart inspection produces a visible guide");
    }
    await check("document.documentElement.scrollWidth<=innerWidth", `${route}: phone reflow`);
  }
  await visit("overview", 320);
  await evaluate("document.documentElement.style.fontSize='200%'");
  await check("document.documentElement.scrollWidth<=innerWidth", "Portfolio: 320px layout has no horizontal overflow at 200% text");
  await evaluate("document.documentElement.style.fontSize=''");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call("Emulation.setTouchEmulationEnabled", { enabled: false });
  await call("Page.navigate", { url: `${origin}/privacy/` });
  await waitFor(async () => await evaluate("document.querySelector('h1')?.textContent==='FolioDash privacy policy'") === true, "static privacy page");
  await survey("Privacy / static public page links");
  // Use a synthetic checked device copy to exercise earlier-history review without Google writes.
  await visit("import");
  const funds = [{ isin: "US0378331005", name: "Synthetic Fund A", fullName: "Synthetic Fund A", firstDate: "2026-01-31" }, { isin: "AU0000XVGZA3", name: "Synthetic Fund B", fullName: "Synthetic Fund B", firstDate: "2026-01-31" }];
  const holdings = (action: string) => Object.fromEntries(funds.map(fund => [fund.isin, { value: 100000, netInvested: 100000, moneyIn: 0, moneyOut: 0, status: "active", action, cashVerified: true, comment: "" }]));
  const ledger = { revision: "synthetic-revision", funds, snapshots: [{ date: "2026-01-31", fundsSubtotal: 200000, holdings: holdings("Start") }, { date: "2026-02-28", fundsSubtotal: 200000, holdings: holdings("Keep") }] };
  const syntheticCopy = { version: 1, workbook: { id: "synthetic-audit", url: "https://example.invalid/synthetic-audit" }, ledger, syncedAt: 1 };
  await evaluate(`localStorage.setItem('foliodash.ledger.v1',${JSON.stringify(JSON.stringify(syntheticCopy))})`);
  // A release build has a Google client ID and prepares sign-in for a remembered
  // workbook. This offline fixture never signs in or saves to Google.
  await call("Page.addScriptToEvaluateOnNewDocument", { source: "window.google={accounts:{oauth2:{initTokenClient:()=>({requestAccessToken:()=>{throw new Error('Synthetic audit must not sign in')}})}}}" });
  await call("Page.reload", { ignoreCache: true });
  await waitFor(async () => await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Add earlier history')") === true, "earlier history entry");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Add earlier history').click()");
  await waitFor(async () => await evaluate("!!document.querySelector('#backfill-date')") === true, "earlier history form");
  await survey("Earlier history / manual values / desktop");
  await evaluate("document.querySelector('#backfill-add-fund').click()");
  await waitFor(async () => await evaluate("document.activeElement?.id==='backfill-name-2'") === true, "focus on the added fund");
  await evaluate("document.querySelector('[aria-label=\"Remove fund 2 from this draft\"]').click()");
  await waitFor(async () => await evaluate("document.activeElement?.id==='backfill-name-1'") === true, "focus after removing a fund");
  await check("document.querySelectorAll('.backfill-entry .manual-fund').length===1", "Earlier history: adding and removing a draft fund restores focus");
  await evaluate(`(()=>{const entries={'backfill-date':'2025-11-30','backfill-name-1':'Synthetic Fund A','backfill-isin-1':'US0378331005','backfill-value-1':'1.000,00'};for(const [id,value] of Object.entries(entries)){const n=document.getElementById(id);n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  await delay(100);
  await evaluate("document.querySelector('.manual-entry form').requestSubmit()");
  await waitFor(async () => await evaluate("!!document.querySelector('.questions input[type=text]')") === true, "earlier opening review");
  await evaluate("(()=>{const n=document.querySelector('.questions input[type=text]');n.value='1.000,00';n.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await delay(100);
  await evaluate("[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()");
  await waitFor(async () => await evaluate("document.body.innerText.includes('Earlier month reviewed')") === true, "earlier month accepted");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Add another earlier month').click()");
  await evaluate("document.querySelectorAll('input[name=backfill-method]')[1].click()");
  await waitFor(async () => await evaluate("!!document.querySelector('#backfill-file')") === true, "earlier Excel file input");
  const backfillDoc = await call("DOM.getDocument");
  const backfillFile = await call("DOM.querySelector", { nodeId: (backfillDoc["root"] as { nodeId: number }).nodeId, selector: "#backfill-file" });
  await call("DOM.setFileInputFiles", { nodeId: backfillFile["nodeId"], files: [resolve("dist/acceptance/onboarding/individual/synthetic-bank-2026-01-31.xlsx")] });
  await waitFor(async () => await evaluate("document.body.innerText.includes('Statement ready:')") === true, "earlier Excel statement read");
  await survey("Earlier history / Excel selection / desktop");
  await evaluate("(()=>{const n=document.querySelector('#backfill-date');n.value='2025-12-31';n.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await delay(100);
  await evaluate("document.querySelector('.manual-entry form').requestSubmit()");
  await waitFor(async () => await evaluate("!!document.querySelector('.questions .choice input')") === true, "earlier Excel movements");
  await evaluate("document.querySelectorAll('.questions .choice input')[1].click()");
  await evaluate("(()=>{const n=document.querySelector('.fund-question input[id$=\"-in-AU0000XVGZA3\"]');n.value='1.000,00';n.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await delay(100);
  await evaluate("[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()");
  await waitFor(async () => await evaluate("document.body.innerText.includes('Earlier month reviewed')") === true, "earlier Excel month accepted");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Review movements to first saved month').click()");
  await waitFor(async () => await evaluate("!!document.querySelector('.questions .choice input')") === true, "earlier boundary review");
  await evaluate("document.querySelectorAll('.questions .choice input')[1].click()");
  await delay(100);
  await evaluate("[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()");
  await waitFor(async () => await evaluate("document.body.innerText.includes('Review changes before saving')") === true, "earlier history preview");
  await check("document.querySelector('.summary table')?.rows.length===3", "Earlier history: the preview includes both saved months");
  await evaluate("document.querySelector('.summary details').open=true");
  await check("document.querySelector('.summary details table')?.textContent.includes('Synthetic Fund A')", "Earlier history: the preview exposes fund-level changes");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Back to movements').click()");
  await waitFor(async () => await evaluate("!!document.querySelectorAll('.questions .choice input')[1]?.checked") === true, "retained boundary answer");
  await evaluate("[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()");
  await waitFor(async () => await evaluate("document.body.innerText.includes('Review changes before saving')") === true, "earlier preview restored");
  await check("document.querySelector('.summary table')?.rows.length===3", "Earlier history: returning to the preview keeps reviewed movements");
  await survey("Earlier history / preview / desktop");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await call("Emulation.setTouchEmulationEnabled", { enabled: true });
  await survey("Earlier history / preview / phone");
  await check("document.documentElement.scrollWidth<=innerWidth && !!document.querySelector('[aria-label=\"Changes by month\"].table-scroll')", "Earlier history: the comparison scrolls inside the phone layout");
  await evaluate("document.documentElement.style.fontSize='200%'");
  await check("document.documentElement.scrollWidth<=innerWidth", "Earlier history: phone comparison remains contained at 200% text");
  await evaluate("document.documentElement.style.fontSize=''");
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Back to movements').click()");
  await waitFor(async () => await evaluate("!!document.querySelectorAll('.questions .choice input')[1]?.checked") === true, "earlier boundary in reduced motion");
  await evaluate("[...document.querySelectorAll('.questions button')].find(b=>b.textContent==='Keep these answers and continue').click()");
  await waitFor(async () => await evaluate("document.body.innerText.includes('Review changes before saving')") === true, "earlier preview in reduced motion");
  await check("document.querySelector('.backfill-phase').getAnimations({subtree:true}).every(a=>a.playState!=='running')", "Earlier history: reduced motion keeps the preview without running transitions");
  await evaluate("localStorage.removeItem('foliodash.ledger.v1')");
}, Number(process.env["FOLIODASH_AUDIT_PORT"] ?? 4197));

writeFileSync(resolve(output, "report.json"), `${JSON.stringify({ assertions, controlSamples, states: report, problems, limits: ["Synthetic local Chromium only", "Pseudo-state sampling proves CSS response; actual range keys/clicks are tested separately", "Real Google, physical devices, other engines and screen readers not verified"] }, null, 2)}\n`);
if (problems.length) throw new Error(`Interaction audit failed:\n${problems.join("\n")}`);
console.log(`Interaction audit passed: ${String(assertions)} journey assertions and ${String(controlSamples)} control samples across ${String(report.length)} rendered states. Report: dist/interaction-audit/report.json`);
