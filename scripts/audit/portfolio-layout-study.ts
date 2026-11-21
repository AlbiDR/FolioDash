// Local design evidence only. Uses the repository's fresh synthetic Chrome runner, not a signed-in browser.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { buildPortfolioStudy } from "../artifacts/portfolio-layout-study.ts";
import { styleViolations } from "../verify/code/style-policy.ts";
import { STUDY_CSS } from "../artifacts/portfolio-study/styles.ts";
import { withLocalBrowser } from "../lib/local-browser.ts";

assert.deepEqual(
  styleViolations([{ path: "portfolio-layout-study.css", text: STUDY_CSS }]),
  [],
  "study style contract",
);

const output = resolve("dist/portfolio-layout-study");
mkdirSync(output, { recursive: true });
const preview = buildPortfolioStudy();
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const results: { name: string; measurements: unknown }[] = [];
const screens = [
  { name: "desktop", width: 1440, height: 1100, scheme: "light", zoom: 1 },
  { name: "tablet", width: 768, height: 1024, scheme: "light", zoom: 1 },
  { name: "mobile", width: 390, height: 844, scheme: "light", zoom: 1 },
  { name: "narrow", width: 320, height: 812, scheme: "light", zoom: 1 },
  { name: "desktop-dark", width: 1440, height: 1100, scheme: "dark", zoom: 1 },
  { name: "mobile-dark", width: 390, height: 844, scheme: "dark", zoom: 1 },
  { name: "narrow-text-200", width: 320, height: 812, scheme: "light", zoom: 2 },
] as const;

await withLocalBrowser(
  async ({ origin, call, evaluate, waitFor }) => {
    for (const screen of screens) {
      await call("Emulation.setDeviceMetricsOverride", {
        width: screen.width,
        height: screen.height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await call("Emulation.setEmulatedMedia", {
        features: [
          { name: "prefers-color-scheme", value: screen.scheme },
          { name: "prefers-reduced-motion", value: "reduce" },
        ],
      });
      await call("Page.navigate", { url: `${origin}/index.html?case=${screen.name}` });
      await waitFor(
        async () =>
          (await evaluate(
            `location.search === "?case=${screen.name}" && document.readyState==='complete' && document.styleSheets.length===3 && document.documentElement.dataset.studyReady==='true'`,
          )) === true,
        "study",
      );
      await evaluate(`document.documentElement.style.fontSize = '${String(screen.zoom * 100)}%'; true`);
      const measurements = (await evaluate(`(() => {
        const visible = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const controls = [...document.querySelectorAll('a,button,summary,[tabindex="0"]')].filter(visible);
        const small = controls.filter(e => { const r=e.getBoundingClientRect(); return r.width < 48 || r.height < 48; }).map(e=>e.textContent.trim());
        const order = ['.summary','.performance','.changes','#holdings','#allocation','#comparisons'].map(s=>({selector:s,top:document.querySelector(s).getBoundingClientRect().top}));
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,small,order,
          headings:document.querySelectorAll('h1').length,mains:document.querySelectorAll('main').length,
          running:document.getAnimations().filter(a=>a.playState==='running').length,
          scroll:getComputedStyle(document.documentElement).scrollBehavior};
      })()`)) as {
        width: number;
        scrollWidth: number;
        small: string[];
        order: { selector: string; top: number }[];
        headings: number;
        mains: number;
        running: number;
        scroll: string;
      };
      if (measurements.scrollWidth > measurements.width) {
        console.error(
          await evaluate(
            "[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1 && e.getClientRects().length).map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className:'svg',right:e.getBoundingClientRect().right})).slice(0,20)",
          ),
        );
      }
      assert.ok(measurements.scrollWidth <= measurements.width, `${screen.name}: page overflow`);
      assert.deepEqual(measurements.small, [], `${screen.name}: undersized targets`);
      assert.equal(measurements.headings, 1);
      assert.equal(measurements.mains, 1);
      assert.equal(measurements.running, 0);
      assert.notEqual(measurements.scroll, "smooth");
      if (screen.width <= 640) {
        assert.ok(
          measurements.order.every((section, i, order) => i === 0 || section.top > (order[i - 1]?.top ?? 0)),
          `${screen.name}: content reading order`,
        );
      }
      assert.equal(
        await evaluate(
          "(()=>{const labels=[...document.querySelectorAll('.plot-dates span')].filter(e=>e.getClientRects().length);return labels.every((e,i)=>i===0 || labels[i-1].getBoundingClientRect().right<=e.getBoundingClientRect().left)})()",
        ),
        true,
        `${screen.name}: chart date labels overlap`,
      );
      await evaluate(`${axe};true`);
      const violations = await evaluate(
        `axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))`,
      );
      assert.deepEqual(violations, [], `${screen.name}: axe violations`);
      // The disclosure is a real accessible values table; privacy must cover its open state too.
      await evaluate("document.querySelector('details').open=true; document.querySelector('#privacy').click(); true");
      assert.equal(
        await evaluate(`document.querySelector('#privacy').getAttribute('aria-pressed')==='true' &&
          [...document.querySelectorAll('.sensitive')].every(e=>e.textContent==='••••') &&
          [...document.querySelectorAll('.chart-sensitive')].every(e=>e.hidden) &&
          !document.body.innerText.includes('128.450') && document.getAnimations().length===0`),
        true,
        `${screen.name}: immediate privacy including table and charts`,
      );
      await evaluate("document.querySelector('#privacy').click(); document.querySelector('details').open=false; true");
      assert.equal(await evaluate("document.querySelector('.headline').textContent==='128.450,00 €'"), true);
      const metrics = await call("Page.getLayoutMetrics");
      const size = metrics["cssContentSize"] as { width: number; height: number };
      const capture = await call("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: screen.width, height: size.height, scale: 1 },
      });
      writeFileSync(resolve(output, `${screen.name}.png`), Buffer.from(String(capture["data"]), "base64"));
      if (screen.name === "mobile") {
        const viewport = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        writeFileSync(resolve(output, "mobile-viewport.png"), Buffer.from(String(viewport["data"]), "base64"));
      }
      results.push({ name: screen.name, measurements });
    }

    // Finite entrance, keyboard activation and actual pointer feedback, separate from reduced motion.
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await call("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: "light" },
        { name: "prefers-reduced-motion", value: "no-preference" },
      ],
    });
    await call("Page.navigate", { url: `${origin}/index.html?case=interaction` });
    await waitFor(
      async () =>
        (await evaluate(
          "location.search==='?case=interaction' && document.readyState==='complete' && document.styleSheets.length===3 && document.documentElement.dataset.studyReady==='true'",
        )) === true,
      "study",
    );
    await waitFor(
      async () => (await evaluate("document.getAnimations().every(a=>a.playState!=='running')")) === true,
      "settled entrance",
    );
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await evaluate("document.querySelector('#privacy').focus(); true");
    assert.equal(await evaluate("document.querySelector('#privacy').matches(':focus-visible')"), true);
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    assert.equal(await evaluate("document.querySelector('#privacy').getAttribute('aria-pressed')"), "true");
    await evaluate("document.querySelector('#privacy').click(); document.activeElement.blur(); true");
    const point = (await evaluate(
      "(()=>{const r=document.querySelector('#privacy').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    )) as { x: number; y: number };
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await delay(300);
    assert.equal(await evaluate("document.querySelector('#privacy').matches(':hover')"), true);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#privacy')).translate"), "0px -2px");
    await call("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await delay(180);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#privacy')).scale"), "0.97");
    await call("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
    await delay(300);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#privacy')).scale"), "none");
    assert.equal(await evaluate("document.querySelector('#privacy').getAttribute('aria-pressed')"), "true");
    results.push({ name: "interaction", measurements: "Keyboard focus/Space, hover, press, release, privacy PASS" });
    // A compact review board; the full-height originals remain beside it for detailed inspection.
    for (const name of ["desktop", "mobile-viewport"]) {
      copyFileSync(resolve(output, `${name}.png`), resolve(preview, `${name}.png`));
    }
    writeFileSync(
      resolve(preview, "board.html"),
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Portfolio study review board</title><link rel="stylesheet" href="tokens.css"><style>
      *{box-sizing:border-box}body{margin:0;padding:24px;background:var(--color-background);color:var(--color-text);font:var(--text-small)/var(--leading-body) var(--font-body)}
      header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;height:40px}h1{font-size:var(--text-lead);margin:0}p{color:var(--color-muted);margin:0}
      .board{display:grid;grid-template-columns:1100px 268px;gap:24px}.frame{height:990px;overflow:hidden;border:1px solid var(--color-border);border-radius:var(--shape-xl);background:var(--color-surface)}
      img{display:block;width:100%;height:auto}.label{font-size:var(--text-caption);margin-bottom:8px;color:var(--color-muted)}.phone{height:auto}.phone-note{margin-top:16px;font-size:var(--text-small)}</style>
      <header><h1>FolioDash / Portfolio composition study 01</h1><p>Synthetic data · opening layouts</p></header>
      <div class="board"><section><div class="label">DESKTOP · 1440 CSS PX</div><div class="frame"><img src="desktop.png" alt="Desktop Portfolio study"></div></section>
      <section><div class="label">PHONE · 390 × 844 CSS PX</div><div class="frame phone"><img src="mobile-viewport.png" alt="Phone Portfolio study, first viewport"></div><p class="phone-note">A single reading order: summary, performance, changes, holdings and allocation.</p><p class="phone-note">Full mobile and dark layouts accompany the responsive preview.</p></section></div></html>`,
    );
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await call("Page.navigate", { url: `${origin}/board.html` });
    await waitFor(
      async () =>
        (await evaluate(
          "location.pathname==='/board.html' && document.readyState==='complete' && document.images.length===2 && [...document.images].every(i=>i.complete && i.naturalWidth>0)",
        )) === true,
      "review board images",
    );
    const board = await call("Page.captureScreenshot", { format: "png" });
    writeFileSync(resolve(output, "preview-board.png"), Buffer.from(String(board["data"]), "base64"));
  },
  4207,
  preview,
);

writeFileSync(
  resolve(output, "report.json"),
  `${JSON.stringify({ results, limits: "Synthetic local Chrome; design evidence only" }, null, 2)}\n`,
);
console.log(
  `Portfolio study passed: ${String(screens.length)} layouts, axe, privacy, reading order and control checks. Evidence: ${output}`,
);
