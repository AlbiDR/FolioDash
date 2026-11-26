// How each screen arrives in the actual production renderer, with synthetic data in a fresh Chrome profile, held under
// recorded ceilings that may only fall (docs/design/polished-by-default.md, phase 1). The document's animation clock is
// frozen before each arrival, so every CSS and Web Animations motion the arrival starts is still present to be
// counted, whatever the runner's speed. Not counted: count-ups (reported, not held), whose number depends on which
// figures are in view; the sidebar's selection, which moves on its own frame loop; and the outgoing page's exit, which
// a timer cancels while the clock is frozen. `npm run audit:choreography -- --record` lowers the ceilings in
// config/motion-baseline.json to the measurement, and still fails if any arrival rose.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { type LocalBrowser, withLocalBrowser } from "../lib/local-browser.ts";
import { type Ceilings, type Choreography, choreographyProblems, loweredCeilings } from "./choreography-policy.ts";

const BASELINE = resolve("config/motion-baseline.json");
const output = resolve("dist/choreography");
const recording = process.argv.includes("--record");

const TITLES: Readonly<Record<string, string>> = {
  overview: "Portfolio",
  months: "Month by month",
  checkpoints: "Checkpoints",
  expenses: "Work expenses",
  activity: "Activity",
  import: "Update your portfolio",
  history: "Import a whole history",
  connection: "Your data",
};
const ROUTES = ["overview", "fund", ...Object.keys(TITLES).filter((route) => route !== "overview")];

type Measured = Choreography & { readonly names: readonly string[]; readonly countUps: number };

// Every animation the arrival started, frozen at its first frame. A count-up runs on its own clock with no target; it is
// found through the attribute it sets while counting and reported apart, because it starts only for figures in view.
const MEASURE = `(() => {
  const names = new Set(); const targets = new Set(); let settle = 0; let loops = 0;
  for (const animation of document.getAnimations()) {
    names.add(animation instanceof CSSAnimation ? animation.animationName
      : animation instanceof CSSTransition ? 'transition ' + animation.transitionProperty : 'script');
    if (animation.effect?.target) targets.add(animation.effect.target);
    const end = animation.effect?.getComputedTiming().endTime ?? 0;
    if (end === Infinity) loops++; else settle = Math.max(settle, Number(end));
  }
  const countUps = document.querySelectorAll('[data-counting]').length;
  return { kinds: names.size, elements: targets.size, settle: Math.round(settle), loops, countUps, names: [...names].sort() };
})()`;

// Each case loads its own address: navigating to an address that differs only in its fragment is a same-document hash
// change, not a page load, so a shared address would measure an in-app entry and call it a cold open.
const address = (origin: string, hash: string, label: string): string =>
  `${origin}/?demo=typical&arrival=${encodeURIComponent(label)}#${hash}`;

async function measureArrival({ evaluate, waitFor }: LocalBrowser, hash: string, url: string): Promise<Measured> {
  const route = hash.startsWith("fund/") ? "fund" : hash;
  const title = TITLES[route];
  try {
    await waitFor(
      async () =>
        (await evaluate(
          `location.href===${JSON.stringify(url)} && document.readyState==='complete' && !!document.querySelector('#main-content :is(.dash,.screen,.account,.import,.get-started)') && !document.querySelector('#main-content .notice[data-busy=true]') && ${title === undefined ? "!!document.querySelector('#fund-chart-title')" : `document.querySelector('h1')?.textContent===${JSON.stringify(title)}`}`,
        )) === true,
      `${hash} arrives`,
    );
  } catch (error) {
    // Name what the page was showing, so a timeout on a slow runner can be told apart from a real regression.
    const state = await evaluate(`JSON.stringify({
      href: location.href, ready: document.readyState, h1: document.querySelector('h1')?.textContent ?? null,
      content: [...document.querySelectorAll('#main-content :is(.dash,.screen,.account,.import,.get-started)')].map(e => e.className),
      busy: [...document.querySelectorAll('#main-content .notice[data-busy=true]')].map(e => e.textContent),
      exiting: document.querySelector('[data-page-exiting]') !== null,
    })`).catch(() => "unavailable");
    throw new Error(`${error instanceof Error ? error.message : String(error)} Page state: ${String(state)}`, {
      cause: error,
    });
  }
  // Nothing finishes while the clock is frozen, so the arrival is complete once three readings agree.
  let previous = "";
  let agreeing = 0;
  let measured = (await evaluate(MEASURE)) as Measured;
  await waitFor(async () => {
    measured = (await evaluate(MEASURE)) as Measured;
    const reading = JSON.stringify(measured);
    agreeing = reading === previous ? agreeing + 1 : 0;
    previous = reading;
    if (agreeing < 2) await delay(250);
    return agreeing >= 2;
  }, `${hash} arrival is complete`);
  return measured;
}

const freeze = async (call: LocalBrowser["call"], frozen: boolean): Promise<void> => {
  await call("Animation.setPlaybackRate", { playbackRate: frozen ? 0 : 1 });
};

const settled = async ({ evaluate, waitFor }: LocalBrowser, label: string): Promise<void> => {
  await waitFor(
    async () =>
      (await evaluate(
        "document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity) && !document.querySelector('[data-counting]')",
      )) === true,
    `${label} settles`,
  );
};

const measurements: Record<string, Measured> = {};

await withLocalBrowser(async (browser) => {
  const { call, evaluate, origin } = browser;
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
  await call("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ],
  });
  // A fixed Wednesday: Expenses shows its entry form on a weekday and a notice at weekends, so the date must not vary.
  // A synthetic client ID: every release build carries a real one, which changes Your data and the sign-in notices, so
  // a local build without one would otherwise measure different screens from CI's.
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      localStorage.setItem('foliodash.privacy.v1', 'shown');
      localStorage.setItem('foliodash.client.v1', '123456-syntheticaudit.apps.googleusercontent.com');
      const today = Date.parse('2026-11-18T12:00:00Z');
      const NativeDate = Date;
      window.Date = new Proxy(NativeDate, {
        construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [today], newTarget),
        get: (target, key, receiver) => key === 'now' ? () => today : Reflect.get(target, key, receiver),
        apply: () => new NativeDate(today).toString(),
      });
    })();`,
  });
  await call("Animation.enable");

  await freeze(call, false);
  const start = address(origin, "overview", "start");
  await call("Page.navigate", { url: start });
  await measureArrival(browser, "overview", start);
  const fundHash = String(await evaluate("document.querySelector('a[href^=\"#fund/\"]')?.getAttribute('href') ?? ''"));
  if (!fundHash.startsWith("#fund/")) throw new Error("The synthetic Portfolio has no fund link to follow.");

  for (const route of ROUTES) {
    const hash = route === "fund" ? fundHash.slice(1) : route;
    // A cold open: the first frame of a fresh page load.
    await freeze(call, true);
    const open = address(origin, hash, `${route}-open`);
    await call("Page.navigate", { url: open });
    measurements[`${route}:open`] = await measureArrival(browser, hash, open);
    // An in-app entry: settle on another screen at full speed, then arrive by navigation with the clock frozen.
    const from = route === "connection" ? "overview" : "connection";
    await freeze(call, false);
    const departure = address(origin, from, `${route}-enter`);
    await call("Page.navigate", { url: departure });
    await measureArrival(browser, from, departure);
    await settled(browser, from);
    await freeze(call, true);
    await evaluate(`location.hash = ${JSON.stringify(`#${hash}`)}`);
    measurements[`${route}:enter`] = await measureArrival(browser, hash, address(origin, hash, `${route}-enter`));
    await freeze(call, false);
  }
}, 4211);

mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, "report.json"), `${JSON.stringify(measurements, null, 2)}\n`);
const measured = Object.fromEntries(
  Object.entries(measurements).map(([name, { kinds, elements, settle, loops }]) => [
    name,
    { kinds, elements, settle, loops },
  ]),
);
const ceilings = (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {}) as Ceilings;
// Recording lowers what fell and leaves new cases at their measurement; a rise still fails, so it is never mistaken for
// a recorded success and first discovered in CI.
const recorded = recording ? loweredCeilings(measured, ceilings) : ceilings;
if (recording) writeFileSync(BASELINE, `${JSON.stringify(recorded, null, 2)}\n`);
const problems = choreographyProblems(measured, recorded);
if (problems.length > 0) {
  console.error(
    `Choreography audit failed: ${String(problems.length)} problems (docs/design/polished-by-default.md). A deliberate reduction is recorded with npm run audit:choreography -- --record; a ceiling never rises without an owner decision.\n${problems.join("\n")}`,
  );
  process.exit(1);
}
console.log(
  recording
    ? `Choreography ceilings recorded for ${String(Object.keys(measured).length)} arrivals in ${BASELINE}.`
    : `Choreography audit passed: ${String(Object.keys(measured).length)} arrivals within their ceilings. Report: dist/choreography/report.json`,
);
