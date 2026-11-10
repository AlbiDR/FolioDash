// Production-renderer control discovery and state probes. Only the invented, signed-out demo is used.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { withLocalBrowser } from "./localBrowser.ts";

interface RenderedControl { readonly id: string; readonly tag: string; readonly label: string; readonly family: string; readonly disabled: boolean; readonly signature: string; readonly duration: boolean; readonly animated: readonly string[] }
const output = resolve("dist/interaction-audit");
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
    const title = ({overview:"Portfolio",expenses:"Work expenses",months:"Month by month",import:"Update your portfolio",history:"Import a whole history",connection:"Your data"} as Readonly<Record<string,string>>)[route];
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
    const hover = await evaluate("matchMedia('(hover:hover) and (pointer:fine)').matches") === true;
    await force(hover ? ["hover"] : ["focus", "focus-visible"]);
    const inspection = await snapshot();
    await force(["active"]);
    const pressed = await snapshot();
    await force([]);
    await delay(240);
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
      if (["action", "period-option", "choice", "chart-mark"].includes(control.family) && !animates(control, pressed.find(entry => entry.id === control.id))) problems.push(`${state}: ${control.family} ${control.label}: missing press feedback`);
    }
    if (problems.length > previousProblems) console.log(problems.slice(previousProblems).join("\n"));
    controlSamples += rest.length;
    console.log(`Inspected ${String(rest.length)} controls: ${state}.`);
  };

  // Portfolio: inspect the complete range-to-chart journey, not only selector declarations.
  await visit("overview");
  await survey("Portfolio / desktop / initial");
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
  await evaluate("window.auditSelector.querySelectorAll('button')[3].click()");
  await delay(50);
  await evaluate("window.auditSelector.querySelectorAll('button')[1].click()");
  await delay(40);
  await evaluate("window.auditSelector.querySelectorAll('button')[2].click()");
  await delay(280);
  await check("window.auditSelector===document.querySelector('.range-selector') && window.auditSelector.querySelector('[aria-pressed=true]').textContent==='1Y'", "rapid range changes settle on the latest period");
  await evaluate("window.auditSelector.querySelectorAll('button')[3].focus()");
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
  await delay(240);
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
  await evaluate("document.querySelector('.privacy-toggle').click();window.auditSelector.querySelectorAll('button')[1].click()");
  await delay(60);
  await check("document.querySelector('.privacy-toggle').getAttribute('aria-pressed')==='true' && window.auditChart.querySelector('.chart-svg').getAnimations().some(a=>a.playState==='running') && !window.auditChart.querySelector('[data-value]')", "hidden-amount range changes retain motion without exposing values");
  await evaluate("document.querySelector('.privacy-toggle').click()");
  await delay(40);
  await check("window.auditChart.querySelector('.chart-svg').getAnimations().every(a=>a.playState!=='running')", "privacy changes immediately cancel a running plot cue");
  await openDetails();
  await survey("Portfolio / desktop / disclosures open");
  const fund = await evaluate("document.querySelector('.holdings-table a')?.getAttribute('href')") as string;
  await visit(fund.slice(1));
  await openDetails();
  await survey("Fund / desktop / disclosures open");
  await evaluate("window.auditFundSelector=document.querySelector('.range-selector');window.auditFundOption=window.auditFundSelector.querySelectorAll('button')[0];window.auditFundOption.focus();window.auditFundOption.click()");
  await delay(50);
  await check("document.querySelector('.range-selector')===window.auditFundSelector && document.activeElement===window.auditFundOption", "fund period change also preserves selector and focus");
  await visit("months");
  await openDetails();
  await survey("Months / desktop / disclosures open");
  await visit("overview", 1440, "many");
  await openDetails();
  await survey("Portfolio / twelve funds / search and disclosures");
  await visit("expenses");
  await openDetails();
  await survey("Expenses / desktop / initial and disclosures");
  await evaluate("document.querySelector('.expense-week-list button').click()");
  await delay(100);
  await evaluate("const input=document.querySelector('#expense-0');if(input){input.value='7,50';input.dispatchEvent(new Event('input',{bubbles:true}))}");
  await delay(100);
  await evaluate("[...document.querySelectorAll('.expense-entry button')].find(b=>b.textContent==='Review correction')?.click()");
  await delay(250);
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
  await evaluate("document.querySelector('.manual-fund button').click()");
  await delay(450);
  await survey("Import / removal and undo notice");
  await visit("history");
  await openDetails();
  const document = await call("DOM.getDocument");
  const input = await call("DOM.querySelector", { nodeId: (document["root"] as { nodeId: number }).nodeId, selector: "#statement-file" });
  await call("DOM.setFileInputFiles", { nodeId: input["nodeId"], files: [resolve("dist/acceptance/onboarding/combined/synthetic-history.xlsx")] });
  await waitFor(async () => await evaluate("document.body.innerText.includes('Check your statements')") === true, "synthetic history review");
  await openDetails();
  await survey("History / generated synthetic XLSX selection review");
  await visit("connection");
  await openDetails();
  await survey("Your data / signed out / advanced controls");
  for (const route of ["overview", "expenses", "months", "import", "connection"]) {
    await visit(route, 390);
    await openDetails();
    await survey(`${route} / phone / disclosures open`);
    if (route === "overview") {
      const point = await evaluate("(()=>{const n=document.querySelector('.chart-svg');n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()") as { x: number; y: number };
      await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await delay(60);
      await check("!!document.querySelector('.chart-guide')", "touch chart inspection produces a visible guide");
    }
    await check("document.documentElement.scrollWidth<=innerWidth", `${route}: phone reflow`);
  }
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call("Emulation.setTouchEmulationEnabled", { enabled: false });
  await call("Page.navigate", { url: `${origin}/privacy/` });
  await waitFor(async () => await evaluate("document.querySelector('h1')?.textContent==='FolioDash privacy policy'") === true, "static privacy page");
  await survey("Privacy / static public page links");
});

writeFileSync(resolve(output, "report.json"), `${JSON.stringify({ assertions, controlSamples, states: report, problems, limits: ["Synthetic local Chromium only", "Pseudo-state sampling proves CSS response; actual range keys/clicks are tested separately", "Real Google, physical devices, other engines and screen readers not verified"] }, null, 2)}\n`);
if (problems.length) throw new Error(`Interaction audit failed:\n${problems.join("\n")}`);
console.log(`Interaction audit passed: ${String(assertions)} journey assertions and ${String(controlSamples)} control samples across ${String(report.length)} rendered states. Report: dist/interaction-audit/report.json`);
