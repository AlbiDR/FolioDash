// Range selector journey: selection, keys, motion, reduced motion and privacy.
import { setTimeout as delay } from "node:timers/promises";
import type { JourneyContext } from "./browser-steps.ts";

export async function rangeSelectorJourney({ call, evaluate, waitFor, check, visit }: JourneyContext): Promise<void> {
  await visit("overview");
  await check(
    "[...document.querySelectorAll('.range-selector button')].every(n=>getComputedStyle(n).getPropertyValue('--interaction-family').trim()==='period-option')",
    "period options retain their specific contract classification",
  );
  await evaluate(
    "window.auditSelector=document.querySelector('.range-selector');window.auditOption=window.auditSelector.querySelector('button');window.auditChart=document.querySelector('#total-chart-title').closest('figure');window.auditPaths=[...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d'));window.auditOption.focus();window.auditOption.click()",
  );
  await delay(70);
  await check(
    "document.querySelector('.range-selector')===window.auditSelector && document.querySelector('.range-selector button')===window.auditOption && document.activeElement===window.auditOption",
    "range change retains DOM and keyboard focus",
  );
  await check(
    "document.querySelector('.range-selector button[aria-pressed=true]').textContent==='3M' && document.querySelectorAll('.range-selector button[tabindex=\"0\"]').length===1",
    "range selection and roving tab stop",
  );
  await check(
    "window.auditSelector.getAnimations({subtree:true}).some(a=>a.transitionProperty==='transform'&&a.playState==='running')",
    "selection pill is moving between positions",
  );
  await check(
    "window.auditChart.querySelector('.chart-svg').getAnimations().some(a=>a.playState==='running')",
    "resulting chart has an update cue",
  );
  await check(
    "JSON.stringify([...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d')))!==JSON.stringify(window.auditPaths)",
    "range applies actual chart geometry immediately",
  );
  await evaluate(
    "window.auditGeometry=[...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d'))",
  );
  await delay(250);
  await check(
    "JSON.stringify(window.auditGeometry)===JSON.stringify([...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d')))",
    "chart cue never interpolates financial paths",
  );
  await evaluate(
    "window.auditPaths=[...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d'));window.auditOption.click()",
  );
  await delay(50);
  await check(
    "!window.auditChart.querySelector('.chart-svg').getAnimations().some(a=>a.playState==='running') && JSON.stringify([...window.auditChart.querySelectorAll('path.line')].map(p=>p.getAttribute('d')))===JSON.stringify(window.auditPaths)",
    "active-period reselect does not restart chart or change data",
  );
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight" });
  await delay(40);
  await check(
    "document.activeElement.textContent==='6M' && document.activeElement.getAttribute('aria-pressed')==='true'",
    "arrow key synchronizes focus and selection",
  );
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "End", code: "End" });
  await delay(50);
  await check(
    "document.activeElement.textContent==='All' && document.activeElement.getAttribute('aria-pressed')==='true'",
    "End selects All",
  );
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
  await check(
    "window.auditSelector===document.querySelector('.range-selector') && window.auditSelector.querySelector('[aria-pressed=true]').textContent==='3M'",
    "rapid range changes settle on the latest period",
  );
  await evaluate("[...window.auditSelector.querySelectorAll('button')].find(b=>b.textContent==='All').focus()");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    text: "\r",
    unmodifiedText: "\r",
  });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await delay(50);
  await check(
    "document.activeElement.textContent==='All' && document.activeElement.getAttribute('aria-pressed')==='true'",
    "Enter activates the focused period",
  );
  await evaluate("window.auditOption.focus()");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    text: " ",
    unmodifiedText: " ",
  });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await delay(50);
  await check(
    "document.activeElement===window.auditOption && document.activeElement.getAttribute('aria-pressed')==='true'",
    "Space activates the focused period",
  );
  await evaluate("window.auditSelector.dir='rtl'");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight" });
  await delay(50);
  await check("document.activeElement.textContent==='All'", "RTL arrow navigation reverses correctly");
  // Renderer scheduling on CI can outlast a fixed delay; inspect final geometry only after actual settlement.
  await waitFor(
    async () =>
      (await evaluate(
        "(()=>{getComputedStyle(window.auditSelector,'::before').transform;return window.auditSelector.getAnimations({subtree:true}).every(a=>a.playState!=='running')})()",
      )) === true,
    "RTL selection pill animation settlement",
  );
  await check(
    "(()=>{const r=window.auditSelector.getBoundingClientRect(),s=getComputedStyle(window.auditSelector,'::before'),x=new DOMMatrixReadOnly(s.transform).m41,w=parseFloat(s.width),b=document.activeElement.getBoundingClientRect();return Math.abs((r.right-3-w/2+x)-(b.left+b.width/2))<2})()",
    "RTL selection pill aligns with the selected option",
  );
  await evaluate("window.auditSelector.dir='ltr';window.auditOption.focus()");
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("window.auditOption.click()");
  await delay(40);
  await check(
    "window.auditChart.getAnimations({subtree:true}).every(a=>a.playState!=='running') && document.activeElement===window.auditOption",
    "reduced-motion range update retains focus with no running motion",
  );
  const reducedDocument = await call("DOM.getDocument");
  const reducedOption = await call("DOM.querySelector", {
    nodeId: (reducedDocument["root"] as { nodeId: number }).nodeId,
    selector: ".range-selector button",
  });
  await call("CSS.forcePseudoState", { nodeId: reducedOption["nodeId"], forcedPseudoClasses: ["active"] });
  await check(
    "(()=>{const s=getComputedStyle(window.auditOption);return (s.scale==='none'||s.scale==='1')&&(s.translate==='none'||/^0px(?: 0px)?$/.test(s.translate))})()",
    "reduced-motion press stays geometrically still",
  );
  await call("CSS.forcePseudoState", { nodeId: reducedOption["nodeId"], forcedPseudoClasses: [] });
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await evaluate(
    "document.querySelector('.privacy-toggle').click();[...window.auditSelector.querySelectorAll('button')].find(b=>b.textContent==='6M').click()",
  );
  await delay(60);
  await check(
    "document.querySelector('.privacy-toggle').getAttribute('aria-pressed')==='true' && window.auditChart.querySelector('.chart-svg').getAnimations().some(a=>a.playState==='running') && !window.auditChart.querySelector('[data-value]')",
    "hidden-amount range changes retain motion without exposing values",
  );
  await evaluate("document.querySelector('.privacy-toggle').click()");
  await delay(40);
  await check(
    "window.auditChart.querySelector('.chart-svg').getAnimations().every(a=>a.playState!=='running')",
    "privacy changes immediately cancel a running plot cue",
  );
}
