// Evidence from the actual built Portfolio, using signed-out synthetic data and a fresh Chrome profile.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { withLocalBrowser } from "../lib/local-browser.ts";
import { createSteps } from "./interactions/browser-steps.ts";

const output = resolve("dist/portfolio-polish");
mkdirSync(output, { recursive: true });
const results: { name: string; result: unknown }[] = [];

await withLocalBrowser(async (browser) => {
  const { call, evaluate, waitFor, origin } = browser;
  const { visit } = createSteps(browser);
  // Inspect real arrival keyframes at their first frame, including delayed cards. Figures must already be visible.
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
      const firstFrame=cards.map(e=>({opacity:getComputedStyle(e).opacity,transform:getComputedStyle(e).transform}));
      const readable=cards.every(e=>e.textContent.trim().length>0);
      animations.forEach(a=>a.cancel());
      return {delays,firstFrame,readable};
    })()`)) as { delays: number[]; firstFrame: { opacity: string; transform: string }[]; readable: boolean };
    assert.ok(arrival.delays.length >= 3, `${label}: real section arrivals exist`);
    assert.ok(
      arrival.delays[0] === 0 && (arrival.delays[1] ?? 0) > 0 && (arrival.delays[2] ?? 0) > (arrival.delays[1] ?? 0),
      `${label}: first three sections arrive in order`,
    );
    assert.ok(
      arrival.firstFrame.every(({ opacity, transform }) => opacity === "1" && transform !== "none"),
      `${label}: sections rise and stay fully visible`,
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
      bars: read('.bars .bar.plot-arrive', 'plot-rise'),
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
  await call("Animation.setPlaybackRate", { playbackRate: 1 });

  for (const hideDuringCount of [false, true]) {
    await visit("activity", 1440, "many");
    const count = (await evaluate(`new Promise(resolve => {
      let first, middle, exact;
      const deadline = performance.now() + 3000;
      document.querySelector('.nav-link[href="#overview"]').click();
      function sample() {
        const figure = document.querySelector('.hero-value .amount');
        const frame = figure?.querySelector('.figure-count')?.getAttribute('data-figure-count');
        if (first === undefined && frame != null) {
          first = frame;
          exact = figure.textContent;
          if (${String(hideDuringCount)}) {
            document.querySelector('.privacy-toggle').click();
            requestAnimationFrame(() => resolve({
              first, exact, hidden: figure.classList.contains('masked'),
              transient: figure.querySelector('.figure-count').getAttribute('data-figure-count'),
            }));
            return;
          }
        }
        if (frame != null && frame !== first && frame !== exact) middle = frame;
        if ((first !== undefined && frame == null) || performance.now() > deadline) {
          resolve({first, middle, exact, final: figure?.textContent, counting: figure?.hasAttribute('data-counting')});
          return;
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    })`)) as {
      first?: string;
      middle?: string;
      exact?: string;
      final?: string;
      counting?: boolean;
      hidden?: boolean;
      transient?: string | null;
    };
    assert.match(count.first ?? "", /^0,00/);
    if (hideDuringCount) {
      assert.equal(count.hidden, true, "privacy masks the count while it is running");
      assert.equal(count.transient, null, "privacy removes the transient digits");
    } else {
      assert.ok(count.middle, "the headline passes through an intermediate amount");
      assert.equal(count.final, count.exact, "the headline lands on its exact amount");
      assert.equal(count.counting, false, "the transient layer is removed");
    }
    results.push({
      name: hideDuringCount ? "privacy interrupts an active count" : "headline count on Activity to Portfolio",
      result: count,
    });
  }

  await visit("overview", 1440, "many");
  await waitFor(
    async () => (await evaluate("document.getAnimations().every(a=>a.playState!=='running')")) === true,
    "settled cards",
  );
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
    { name: "tablet-wide", width: 1000, scheme: "light", variant: "many", text: 100 },
    { name: "tablet-edge", width: 1180, scheme: "dark", variant: "many", text: 100 },
    { name: "desktop-edge", width: 1181, scheme: "dark", variant: "many", text: 100 },
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
    if (screen.variant === "many" && screen.text === 100) {
      const gridAligned = await evaluate(`(() => {
        const dashboard = document.querySelector('.portfolio-dashboard');
        const holdings = dashboard.querySelector('.portfolio-holdings').getBoundingClientRect();
        const rail = dashboard.querySelector('.portfolio-rail').getBoundingClientRect();
        const cards = [...dashboard.querySelector('.portfolio-rail').children].map(e => e.getBoundingClientRect());
        const analysis = dashboard.querySelector('.analysis-grid');
        const analysisCards = [...analysis.children].map(e => e.getBoundingClientRect());
        const gap = parseFloat(getComputedStyle(dashboard).gap);
        const near = (a, b) => Math.abs(a - b) < 1;
        const tablet = matchMedia('(min-width: 47.501rem) and (max-width: 73.75rem)').matches;
        const phone = matchMedia('(max-width: 47.5rem)').matches;
        if (cards.length !== 2) return false;
        if (tablet) return near(holdings.left, rail.left) && near(holdings.right, rail.right)
          && near(cards[0].left, rail.left) && near(cards[1].right, rail.right)
          && near(cards[1].left - cards[0].right, gap) && near(cards[0].top, cards[1].top)
          && near(analysisCards.at(-1).left, analysisCards.at(-2).left)
          && near(analysisCards.at(-1).right, analysisCards.at(-2).right);
        if (phone) return near(holdings.left, rail.left) && near(holdings.right, rail.right)
          && near(cards[0].left, cards[1].left) && near(cards[0].right, cards[1].right)
          && near(cards[1].top - cards[0].bottom, gap);
        return near(holdings.top, rail.top) && near(rail.bottom, cards.at(-1).bottom)
          && near(rail.left - holdings.right, gap)
          && near(cards[1].top - cards[0].bottom, gap)
          && near(analysisCards[0].top, analysisCards[1].top)
          && near(analysisCards.at(-1).top, analysisCards.at(-2).top)
          && near(analysisCards[0].width, analysisCards.at(-1).width)
          && near(analysisCards[1].width, analysisCards.at(-2).width);
      })()`);
      assert.equal(gridAligned, true, `${screen.name}: holdings and supporting cards align to the dashboard grid`);
    }
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
  }
}, 4248);

writeFileSync(
  resolve(output, "report.json"),
  `${JSON.stringify({ results, limits: "Actual production renderer, local synthetic Chrome; no Google or physical-device proof" }, null, 2)}\n`,
);
console.log(`Portfolio polish PASS: page arrivals, search motion and layout checks. Evidence: ${output}`);
