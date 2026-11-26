// Evidence from the actual built Portfolio, using signed-out synthetic data and a fresh Chrome profile.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { withLocalBrowser } from "../lib/local-browser.ts";
import { createSteps } from "./interactions/browser-steps.ts";
import { assertPortfolioLayout } from "./portfolio-layout.ts";
import { assertSidebarCollapse } from "./sidebar-collapse.ts";

const output = resolve("dist/portfolio-polish");
mkdirSync(output, { recursive: true });
const results: { name: string; result: unknown }[] = [];

await withLocalBrowser(async (browser) => {
  const { call, evaluate, waitFor, origin } = browser;
  const { visit } = createSteps(browser);
  // Inspect real arrival keyframes, including delayed cards. Exact text must already be present.
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  // Freeze the animation clock before mounting: even a busy CI runner observes the actual first frame.
  await call("Animation.enable");
  await call("Animation.setPlaybackRate", { playbackRate: 0 });
  const initialCount = await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem('foliodash.privacy.v1', 'shown');
      const observer = new MutationObserver(() => {
        const frame = document.querySelector('.hero-value [data-figure-count]')?.getAttribute('data-figure-count');
        if (frame == null) return;
        window.firstPortfolioCount = frame;
        observer.disconnect();
      });
      observer.observe(document, { attributes: true, childList: true, subtree: true });`,
  });
  await call("Page.navigate", { url: `${origin}/?demo=many&polish=arrival#overview` });
  await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: initialCount["identifier"] });
  await waitFor(
    async () => (await evaluate("!!document.querySelector('.portfolio-dashboard > .hero')")) === true,
    "Portfolio arrival",
  );
  const inspectArrival = async (selector: string, label: string) => {
    const arrival = (await evaluate(`(() => {
      const cards=[...document.querySelectorAll(${JSON.stringify(selector)})];
      const animations=cards.flatMap(e=>e.getAnimations()).filter(a=>a.animationName==='rise');
      animations.forEach(a=>{a.pause();a.currentTime=0});
      const delays=animations.map(a=>a.effect.getTiming().delay);
      const samples = [0, 0.25, 0.78, 1].map(progress => {
        for (const animation of animations) {
          const {delay, duration} = animation.effect.getTiming();
          animation.currentTime = progress === 0 ? 0 : delay + progress * duration;
        }
        return cards.map(card => {
          const style = getComputedStyle(card);
          const shift = style.transform === 'none' ? 0 : new DOMMatrixReadOnly(style.transform).m42;
          return {opacity: Number(style.opacity), shift};
        });
      });
      const readable=cards.every(e=>e.textContent.trim().length>0);
      animations.forEach(a=>a.cancel());
      return {delays,samples,readable};
    })()`)) as { delays: number[]; samples: { opacity: number; shift: number }[][]; readable: boolean };
    assert.ok(arrival.delays.length >= 3, `${label}: real section arrivals exist`);
    assert.ok(
      arrival.delays[0] === 0 && (arrival.delays[1] ?? 0) > 0 && (arrival.delays[2] ?? 0) > (arrival.delays[1] ?? 0),
      `${label}: first three sections arrive in order`,
    );
    const [first, middle, rebound, settled] = arrival.samples;
    assert.ok(
      first?.every(({ opacity, shift }) => opacity === 0 && shift > 0),
      `${label}: transparent start`,
    );
    assert.ok(
      middle?.every(({ opacity, shift }) => opacity > 0 && opacity < 1 && shift > 0),
      `${label}: rising fade`,
    );
    assert.ok(
      rebound?.every(({ opacity, shift }) => opacity === 1 && shift < 0 && shift >= -2),
      `${label}: soft rebound`,
    );
    assert.ok(
      settled?.every(({ opacity, shift }) => opacity === 1 && shift === 0),
      `${label}: fully settled`,
    );
    assert.ok(arrival.readable, `${label}: section text exists on the first frame`);
    results.push({ name: label, result: arrival });
  };
  await inspectArrival(".portfolio-dashboard > *", "Portfolio cold open");
  assert.match(String(await evaluate("window.firstPortfolioCount")), /^0,00/, "the opening headline starts at zero");
  const details = (await evaluate(`(() => {
    const animationFor = (element, name) => element?.getAnimations().find(a=>a.animationName===name);
    const read = (selector, name) => {
      const element = document.querySelector(selector);
      const animation = animationFor(element, name);
      if (!animation) return null;
      animation.pause();
      const { delay, duration } = animation.effect.getTiming();
      animation.currentTime = delay;
      const from = getComputedStyle(element).scale;
      animation.currentTime = delay + duration / 2;
      const middle = getComputedStyle(element).scale;
      animation.currentTime = delay + duration;
      const end = getComputedStyle(element).scale;
      animation.cancel();
      return { from, middle, end };
    };
    const title = animationFor(document.querySelector('.hero-value'), 'text-arrive');
    const supporting = animationFor(document.querySelector('.hero-gain'), 'text-arrive');
    return {
      staggeredText: !!title && !!supporting && title.effect.getTiming().delay < supporting.effect.getTiming().delay,
      line: read('.portfolio-trend .plot-arrive', 'plot-rise'),
      sparkline: read('.sparkline .plot-arrive', 'plot-rise'),
      bars: read('.bars .bar.motion-bar-rise', 'plot-rise'),
      allocation: read('.donut-arrive', 'ring-grow'),
      weight: read('.share-bar > span', 'bar-grow'),
    };
  })()`)) as { staggeredText: boolean } & Record<
    "line" | "sparkline" | "bars" | "allocation" | "weight",
    { from: string; middle: string; end: string } | null
  >;
  assert.ok(details.staggeredText, "headline and supporting text arrive at different times");
  for (const [name, from] of [
    ["line", "1 0"],
    ["sparkline", "1 0"],
    ["bars", "1 0"],
    ["allocation", "0"],
    ["weight", "0 1"],
  ] as const) {
    const mark = details[name];
    assert.equal(mark?.from, from, `${name} starts collapsed`);
    assert.notEqual(mark.middle, from, `${name} grows through an intermediate frame`);
    assert.equal(mark.end, "none", `${name} settles to canonical geometry`);
  }
  results.push({ name: "staggered text and growing chart marks", result: details });
  for (const [route, surface] of [
    ["activity", ".activity-dashboard"],
    ["overview", ".portfolio-dashboard"],
  ] as const) {
    await evaluate(`document.querySelector('.nav-link[href="#${route}"]').click()`);
    await waitFor(
      async () =>
        (await evaluate(`!!document.querySelector('${surface}') && !document.getElementById('main-content').inert`)) ===
        true,
      route,
    );
    await inspectArrival(`${surface} > *`, `${route} after navigation`);
  }
  // Return as soon as Activity commits, before passive effects can refresh the route listener.
  await evaluate(`(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.activity-dashboard')) return;
      observer.disconnect();
      window.returnedFromActivity = true;
      history.replaceState(null, '', '#overview');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    observer.observe(document.getElementById('main-content'), { childList: true, subtree: true });
    document.querySelector('.nav-link[href="#activity"]').click();
  })()`);
  await waitFor(
    async () =>
      (await evaluate(
        "window.returnedFromActivity===true && location.hash==='#overview' && !!document.querySelector('.portfolio-dashboard') && !document.getElementById('main-content').inert",
      )) === true,
    "Portfolio after returning immediately from Activity",
  );
  results.push({ name: "immediate return from Activity", result: true });
  await call("Animation.setPlaybackRate", { playbackRate: 1 });

  // A page entered from inside the app shows its figures at once (FD-029, decision 2): no counting layer, ever.
  await visit("activity", 1440, "many");
  const entered = (await evaluate(`new Promise(resolve => {
    const deadline = performance.now() + 1500;
    let firstText, counted = false;
    document.querySelector('.nav-link[href="#overview"]').click();
    function sample() {
      const figure = document.querySelector('.hero-value .amount');
      if (figure) {
        firstText ??= figure.textContent;
        counted ||= !!figure.querySelector('[data-figure-count]') || figure.closest('[data-counting]') !== null;
      }
      if (performance.now() > deadline) {
        resolve({ firstText, finalText: figure?.textContent, counted });
        return;
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  })`)) as { firstText?: string; finalText?: string; counted: boolean };
  assert.ok(entered.firstText, "the headline renders on entry from Activity");
  assert.equal(entered.counted, false, "an in-app entry never counts the headline");
  assert.equal(entered.firstText, entered.finalText, "the headline shows its exact amount from its first frame");
  results.push({ name: "headline on Activity to Portfolio", result: entered });

  // Privacy still interrupts a running count, which a cold open now starts.
  const privacy = await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem('foliodash.privacy.v1', 'shown');
      const observer = new MutationObserver(() => {
        const overlay = document.querySelector('.hero-value .figure-count[data-figure-count]');
        const toggle = document.querySelector('.privacy-toggle');
        if (!overlay || !toggle || window.privacyInterrupt) return;
        observer.disconnect();
        const figure = overlay.closest('.amount') ?? overlay.closest('.animated-figure');
        toggle.click();
        requestAnimationFrame(() => {
          window.privacyInterrupt = {
            hidden: !!document.querySelector('.hero-value .masked, .hero-value [aria-label="Amount hidden"]'),
            transient: document.querySelector('.hero-value .figure-count')?.getAttribute('data-figure-count') ?? null,
            figure: !!figure,
          };
        });
      });
      observer.observe(document, { attributes: true, childList: true, subtree: true });`,
  });
  await call("Page.navigate", { url: `${origin}/?demo=many&polish=privacy#overview` });
  await waitFor(async () => (await evaluate("!!window.privacyInterrupt")) === true, "a cold-open count is interrupted");
  await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: privacy["identifier"] });
  const interrupted = (await evaluate("window.privacyInterrupt")) as { hidden: boolean; transient: string | null };
  assert.equal(interrupted.hidden, true, "privacy masks the count while it is running");
  assert.equal(interrupted.transient, null, "privacy removes the transient digits");
  results.push({ name: "privacy interrupts an active count", result: interrupted });

  await visit("overview", 1440, "many");
  await waitFor(
    async () => (await evaluate("document.getAnimations().every(a=>a.playState!=='running')")) === true,
    "settled cards",
  );
  results.push({ name: "sidebar collapse and reopen", result: await assertSidebarCollapse(browser) });
  await evaluate(`(() => {
    const rows=[...document.querySelectorAll('.desktop-holdings tbody tr:not(.holdings-group):not(.closed)')];
    window.polishRow=rows[1];window.polishText=window.polishRow.textContent;
    window.polishHeadline=document.querySelector('.hero-value').textContent;
    window.polishPaths=[...document.querySelectorAll('.portfolio-trend path.line')].map(p=>p.getAttribute('d'));
    const input=document.getElementById('fund-search');
    input.value=window.polishRow.querySelector('a').textContent.trim();input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await waitFor(
    async () => (await evaluate("window.polishRow.getAnimations().some(a=>a.playState==='running')")) === true,
    "surviving search row glides",
  );
  assert.equal(
    await evaluate("window.polishRow.isConnected && window.polishRow.textContent===window.polishText"),
    true,
    "filter retains the keyed row and its exact figures",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.hero-value').textContent===window.polishHeadline && JSON.stringify(window.polishPaths)===JSON.stringify([...document.querySelectorAll('.portfolio-trend path.line')].map(p=>p.getAttribute('d')))",
    ),
    true,
    "filter never changes headline or canonical chart paths",
  );
  await waitFor(
    async () =>
      (await evaluate(
        "window.polishRow.getAnimations().length===0 && getComputedStyle(window.polishRow).transform==='none'",
      )) === true,
    "filter row settles",
  );
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("document.querySelector('.fund-search-controls button').click()");
  await waitFor(
    async () => (await evaluate("document.getElementById('fund-search').value===''")) === true,
    "clear search",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.desktop-holdings tbody tr')].every(r=>r.getAnimations().length===0)",
    ),
    true,
    "reduced motion clears search immediately",
  );
  results.push({
    name: "search continuity",
    result: "Key identity, movement, settled geometry, unchanged financial content and reduced motion PASS",
  });

  const screens = [
    { name: "desktop-dark", width: 1440, scheme: "dark", variant: "many", text: 100 },
    { name: "desktop-light", width: 1440, scheme: "light", variant: "many", text: 100 },
    { name: "desktop-wide", width: 1920, scheme: "dark", variant: "many", text: 100 },
    { name: "tablet-dark", width: 768, scheme: "dark", variant: "typical", text: 100 },
    { name: "changes-expanded", width: 600, scheme: "dark", variant: "many", text: 100 },
    { name: "tablet-wide", width: 1000, scheme: "light", variant: "many", text: 100 },
    { name: "sidebar-constrained", width: 1181, scheme: "dark", variant: "many", text: 100 },
    { name: "desktop-edge", width: 1400, scheme: "dark", variant: "many", text: 100 },
    { name: "phone-dark", width: 390, scheme: "dark", variant: "many", text: 100 },
    { name: "phone-light", width: 390, scheme: "light", variant: "typical", text: 100 },
    { name: "narrow", width: 320, scheme: "light", variant: "many", text: 100 },
    { name: "narrow-text-200", width: 320, scheme: "light", variant: "many", text: 200 },
    { name: "single", width: 390, scheme: "dark", variant: "single", text: 100 },
    { name: "empty", width: 390, scheme: "light", variant: "empty", text: 100 },
  ];
  for (const screen of screens) {
    await visit("overview", screen.width, screen.variant);
    await call("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: screen.scheme },
        { name: "prefers-reduced-motion", value: "reduce" },
      ],
    });
    await evaluate(
      `document.documentElement.style.fontSize='${String(screen.text)}%'; new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))`,
    );
    const layout = (await evaluate(`(() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      heading:document.querySelector('h1').textContent,mains:document.querySelectorAll('main').length,
      hero:document.querySelector('.hero-value')?.textContent ?? null,
      background:getComputedStyle(document.documentElement).getPropertyValue('--color-hero').trim(),
      running:document.getAnimations().filter(a=>a.playState==='running').length}))()`)) as {
      width: number;
      scrollWidth: number;
      mains: number;
      running: number;
    };
    assert.ok(layout.scrollWidth <= layout.width, `${screen.name}: no page overflow`);
    assert.equal(layout.mains, 1);
    assert.equal(layout.running, 0);
    const layoutEvidence = await assertPortfolioLayout(evaluate, screen);
    if (layoutEvidence !== undefined) results.push(layoutEvidence);
    assert.equal(
      await evaluate(`(() => {
      const svg=document.querySelector('.portfolio-trend .chart-svg');if(!svg)return true;
      const edge=svg.viewBox.baseVal.width;
      const ticks=[...svg.querySelectorAll('.chart-value-axis > g')].map(group=>{
        const label=group.querySelector('text');
        const grid=group.querySelector('line');
        return {gap:label.getBBox().x-grid.x2.baseVal.value,
          end:label.getBBox().x+label.getBBox().width};
      });
      const outerGap=edge-Math.max(...ticks.map(tick=>tick.end));
      return ticks.length>0 && outerGap>=3 && outerGap<=6 &&
        ticks.every(tick=>tick.gap>=7 && tick.gap<=9);
    })()`),
      true,
      `${screen.name}: value-axis labels fit with a compact gutter and clear the grid`,
    );

    // Privacy must mask exact amounts immediately while keeping the existing chart shape policy.
    assert.equal(
      await evaluate(`new Promise(done => {
      document.querySelector('.privacy-toggle').click(); requestAnimationFrame(() => {
      const hidden=document.querySelector('.privacy-toggle').getAttribute('aria-pressed')==='true';
      const hero=document.querySelector('.hero-value');
      const safe=!hero || !/[0-9]/.test(hero.textContent);
      document.querySelector('.privacy-toggle').click(); requestAnimationFrame(() => done(hidden&&safe));
      });
    })`),
      true,
      `${screen.name}: immediate privacy`,
    );
    const capture = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(resolve(output, `${screen.name}.png`), Buffer.from(String(capture["data"]), "base64"));
    // The settled dashboard itself is available in full; screenshots never hide the sample boundary.
    if (screen.name === "desktop-dark" || screen.name === "phone-dark") {
      const metrics = await call("Page.getLayoutMetrics");
      const size = metrics["cssContentSize"] as { width: number; height: number };
      const full = await call("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: screen.width, height: size.height, scale: 1 },
      });
      writeFileSync(resolve(output, `${screen.name}-full.png`), Buffer.from(String(full["data"]), "base64"));
    }
    results.push({ name: screen.name, result: layout });
    if (["narrow", "phone-dark", "changes-expanded", "sidebar-constrained", "desktop-dark"].includes(screen.name)) {
      await evaluate("document.querySelector('.period-results').scrollIntoView({block:'center',behavior:'instant'})");
      const card = (await evaluate(`(() => {
        const r = document.querySelector('.period-results').getBoundingClientRect();
        return {x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height};
      })()`)) as { x: number; y: number; width: number; height: number };
      const shot = await call("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { ...card, scale: 1 },
      });
      writeFileSync(resolve(output, `changes-${screen.name}.png`), Buffer.from(String(shot["data"]), "base64"));
    }
  }
}, 4248);

writeFileSync(
  resolve(output, "report.json"),
  `${JSON.stringify({ results, limits: "Actual production renderer, local synthetic Chrome; no Google or physical-device proof" }, null, 2)}\n`,
);
console.log(`Portfolio polish PASS: page arrivals, search motion and layout checks. Evidence: ${output}`);
