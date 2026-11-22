// Control inspection: samples every rendered control at rest, hover, focus, press and release.
import type { LocalBrowser } from "../../lib/local-browser.ts";
import { counters, problems, report, type RenderedControl } from "./state.ts";

export function surveyStates({ call, evaluate, waitFor }: LocalBrowser) {
  const snapshot = async (assign = false): Promise<RenderedControl[]> =>
    (await evaluate(`(()=>{
    const selector='button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="option"],[role="slider"],[role="link"],[tabindex]:not([tabindex="-1"]),.chart-svg';
    const nodes=[...document.querySelectorAll(selector)].filter(n=>{const r=n.getBoundingClientRect();let p=n.parentElement;while(p){if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(n))return false;p=p.parentElement}return r.width>0&&r.height>0&&!n.closest('[hidden],[inert],[aria-hidden=true]')&&getComputedStyle(n).visibility!=='hidden'});
    return nodes.map((n,i)=>{if(${String(assign)})n.setAttribute('data-interaction-audit',String(i));const s=getComputedStyle(n);return {id:n.getAttribute('data-interaction-audit'),tag:n.tagName.toLowerCase(),label:n.getAttribute('href')?.startsWith('mailto:')?'Contact email':(n.getAttribute('aria-label')||n.textContent||n.getAttribute('type')||n.tagName).trim().replace(/\\s+/g,' ').slice(0,90),family:s.getPropertyValue('--interaction-family').trim(),disabled:n.matches(':disabled,[aria-disabled=true]'),signature:JSON.stringify({'box-shadow':s.boxShadow,'border-color':s.borderColor,'background-color':s.backgroundColor,opacity:s.opacity,filter:s.filter,scale:s.scale,translate:s.translate,transform:s.transform,'text-underline-offset':s.textUnderlineOffset}),animated:s.transitionProperty.split(',').map((p,i)=>parseFloat(s.transitionDuration.split(',')[i%s.transitionDuration.split(',').length])>0?p.trim():'').filter(Boolean),duration:s.transitionDuration.split(',').some(v=>parseFloat(v)>0)}})
  })()`)) as RenderedControl[];
  const survey = async (state: string): Promise<void> => {
    const previousProblems = problems.length;
    // Owner journeys intentionally focus the active period and Undo. CSS state sampling must
    // start unfocused; otherwise applying focus again tests an already-active state.
    await evaluate("document.activeElement?.blur();getComputedStyle(document.documentElement).opacity");
    await waitFor(
      async () =>
        (await evaluate(
          "document.getAnimations().every(a=>a.playState!=='running'||a.effect?.getComputedTiming().iterations===Infinity)",
        )) === true,
      `${state}: neutral animation settlement`,
    );
    const rest = await snapshot(true);
    report.push({ state, controls: rest });
    const document = await call("DOM.getDocument");
    const rootId = (document["root"] as { nodeId: number }).nodeId;
    const selected = await call("DOM.querySelectorAll", { nodeId: rootId, selector: "[data-interaction-audit]" });
    const ids = selected["nodeIds"] as number[];
    const force = async (pseudoClasses: readonly string[]): Promise<void> => {
      await Promise.all(
        ids.map((nodeId) => call("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudoClasses })),
      );
      // Flush style and let the browser begin its transitions before checking their actual completion.
      await evaluate("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))");
      await waitFor(
        async () =>
          (await evaluate(
            "document.getAnimations().every(a=>a.playState!=='running'||a.effect?.getComputedTiming().iterations===Infinity)",
          )) === true,
        `${state}: forced state animation settlement`,
      );
    };
    const hover =
      !process.argv.includes("--focus-only") &&
      (await evaluate("matchMedia('(hover:hover) and (pointer:fine)').matches")) === true;
    await force(hover ? ["hover"] : ["focus", "focus-visible"]);
    const inspection = await snapshot();
    await force(["focus", "focus-visible"]);
    const focused = await snapshot();
    await force(["active"]);
    const pressed = await snapshot();
    await force([]);
    await waitFor(
      async () =>
        (await evaluate(
          "document.getAnimations().every(a=>a.playState!=='running'||a.effect?.getComputedTiming().iterations===Infinity)",
        )) === true,
      `${state}: release animation settlement`,
    );
    const released = await snapshot();
    const animates = (before: RenderedControl, after: RenderedControl | undefined): boolean => {
      if (after === undefined) return false;
      const a = JSON.parse(before.signature) as Record<string, string>;
      const b = JSON.parse(after.signature) as Record<string, string>;
      return Object.keys(a).some(
        (property) =>
          a[property] !== b[property] && (before.animated.includes(property) || before.animated.includes("all")),
      );
    };
    for (const control of rest) {
      if (!control.family) problems.push(`${state}: ${control.tag} ${control.label}: no interaction family`);
      if (control.disabled) continue;
      if (released.find((entry) => entry.id === control.id)?.signature !== control.signature)
        problems.push(
          `${state}: ${control.family} ${control.label}: release did not settle back to its original state`,
        );
      const seen = inspection.find((entry) => entry.id === control.id);
      if (
        !animates(
          control,
          control.family === "chart-inspection" && !hover ? pressed.find((entry) => entry.id === control.id) : seen,
        )
      )
        problems.push(
          `${state}: ${control.family} ${control.label}: missing animated ${hover ? "hover" : "focus"} feedback`,
        );
      if (
        control.family !== "chart-inspection" &&
        !animates(
          control,
          focused.find((entry) => entry.id === control.id),
        )
      )
        problems.push(`${state}: ${control.family} ${control.label}: missing animated keyboard focus feedback`);
      if (
        ["action", "period-option", "choice", "chart-mark"].includes(control.family) &&
        !animates(
          control,
          pressed.find((entry) => entry.id === control.id),
        )
      )
        problems.push(`${state}: ${control.family} ${control.label}: missing press feedback`);
    }
    if (problems.length > previousProblems) console.log(problems.slice(previousProblems).join("\n"));
    counters.controlSamples += rest.length;
    console.log(`Inspected ${String(rest.length)} controls: ${state}.`);
  };
  return { survey };
}
