// Captures only the signed-out synthetic production demo in a fresh local-only browser.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { readFiles, treeDigest, writeCaptureReceipt } from "./prepare-pages.ts";
import { type LocalBrowser, withLocalBrowser } from "./local-browser.ts";
import { CAPTURED, type CapturedView, type RouteName } from "./readme-views.ts";

// Every README image is drawn without the page background, so the cards sit on GitHub's own light or dark canvas.
// Opaque surfaces replace frosted glass, which would otherwise show whatever lies behind the picture through the bar.
const CLEAR_CSS =
  "html,body{background:transparent!important}body::before{display:none!important}:root{--glass:var(--color-surface)!important;--glass-edge:transparent!important;--glass-blur:none!important}.topbar,.main-nav{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}.more{display:none!important}";
// A desktop picture shows the cards only. The bars only hide: removing them would reflow the page.
const DESKTOP_CSS = ".topbar,.main-nav{visibility:hidden!important}";
const DEFAULT_INCLUDE = ".get-started,.notice,#main-content > *";
const APP = resolve("dist/web");
const OUTPUT = resolve("dist/readme");

async function capture(
  browser: LocalBrowser,
  file: string,
  theme: "light" | "dark",
  route: RouteName,
  view: CapturedView,
  mobile = false,
): Promise<void> {
  const { call, evaluate, waitFor, origin: ORIGIN } = browser;
  const width = mobile ? 390 : 1440;
  let height = mobile ? 844 : 1120;
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile });
  await call("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });
  await call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  const url = `${ORIGIN}/?demo=typical&readme=${encodeURIComponent(file)}${view.hash}`;
  await call("Page.navigate", { url });
  await waitFor(
    async () =>
      (await evaluate(
        `location.href === ${JSON.stringify(url)} && document.readyState === "complete" && document.querySelector('.privacy-toggle') !== null && ${view.open === undefined ? `document.querySelector('h1')?.textContent === ${JSON.stringify(view.heading)}` : `document.querySelector(${JSON.stringify(view.open)}) !== null`}`,
      )) === true,
    `the ${route} view`,
  );
  if (view.open !== undefined) {
    // A detail screen is reached the way a person reaches it: through the first link the demo offers.
    await evaluate(`document.querySelector(${JSON.stringify(view.open)})?.click()`);
    await waitFor(
      async () =>
        (await evaluate(
          `location.hash.startsWith('#fund/') && (document.querySelector('h1')?.textContent ?? '') !== '' && document.querySelector('h1')?.textContent !== 'Portfolio'`,
        )) === true,
      `the ${route} detail`,
    );
  }
  await evaluate("document.fonts.ready");
  // These are the app's ordinary controls; the captured DOM and financial values are unchanged.
  await evaluate(
    "(()=>{const toggle=document.querySelector('.privacy-toggle');if(toggle?.getAttribute('aria-pressed')==='true')toggle.click()})()",
  );
  if (route === "expenses") {
    await waitFor(
      async () => (await evaluate("document.querySelector('.expense-entry') !== null")) === true,
      "the expense editor",
    );
    // Previous steps one calendar day, so from a weekend or a Monday it takes up to three steps back to the last invented recorded workday.
    for (let step = 0; step < 4; step++) {
      if (
        (await evaluate(
          "document.querySelector('.expense-entry .expense-state')?.textContent === 'Recorded workday'",
        )) === true
      )
        break;
      await evaluate("document.querySelector('.expense-date-controls button')?.click()");
      await delay(250);
    }
    await waitFor(
      async () =>
        (await evaluate(
          "document.querySelectorAll('.expense-fields input').length === 5 && document.querySelector('.expense-entry .expense-state')?.textContent === 'Recorded workday'",
        )) === true,
      "a complete invented workday",
    );
  }
  await waitFor(
    async () =>
      (await evaluate(
        "document.querySelector('.privacy-toggle')?.getAttribute('aria-pressed') === 'false' && document.getAnimations().every(animation => animation.playState !== 'running')",
      )) === true,
    "visible demo values and idle rendering",
  );
  await delay(300);
  // A phone draws the short word "Demo"; the full "Demo data" sentence is then the status control's accessible name.
  const safe = await evaluate(
    `(()=>{const text=document.body.innerText;const chip=document.querySelector('.status-chip');return (text.includes('Demo data') || (text.includes('Demo') && chip?.getAttribute('aria-label')==='Demo data')) && !text.includes('Synced with Google') && !text.includes('Saved on this device') && document.querySelector('.privacy-toggle')?.getAttribute('aria-pressed')==='false' && ![...document.scripts].some(script=>script.src && new URL(script.src).origin!==location.origin) && document.documentElement.scrollWidth<=innerWidth})()`,
  );
  if (safe !== true) throw new Error("Capture stopped: synthetic-demo, network or rendering checks failed.");
  await evaluate("window.scrollTo(0,0)");
  let clip: Record<string, number> | undefined;
  // Applied after the safety checks above, which read the page's visible text.
  await evaluate(
    `(()=>{const style=document.createElement('style');style.textContent=${JSON.stringify(`${CLEAR_CSS}${mobile ? "" : DESKTOP_CSS}${view.crop?.hide === undefined ? "" : `${view.crop.hide}{display:none!important}`}${view.crop?.style ?? ""}`)};document.head.append(style)})()`,
  );
  await delay(300);
  if (!mobile) {
    // Only the named elements (and what they sit in) stay visible, so a neighbour cannot leak into the margin around the crop.
    // Hidden elements keep their space: nothing reflows.
    await evaluate(`((include)=>{const roots=[...document.querySelectorAll(include)];const keep=new Set();for(const root of roots)for(let el=root;el;el=el.parentElement)keep.add(el);
      const walk=el=>{if(roots.some(root=>root.contains(el)))return;if(!keep.has(el)){el.style.visibility='hidden';return}for(const child of el.children)walk(child)};walk(document.body)})(${JSON.stringify(view.crop?.include ?? DEFAULT_INCLUDE)})`);
    // The crop follows what is painted (text, backgrounds, borders, inputs, graphics) inside the named elements, not their boxes, so a
    // wide empty wrapper cannot stretch the picture. Anything clipped by a scrolling ancestor is cut to what is visible.
    const box = await evaluate(`((include)=>{const rects=[];const seen=new Set();
      const visible=(rect,node)=>{let r={left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom};for(let el=node instanceof Element?node:node.parentElement;el&&el!==document.documentElement;el=el.parentElement){const cs=getComputedStyle(el);if(cs.overflowX!=='visible'||cs.overflowY!=='visible'){const b=el.getBoundingClientRect();if(cs.overflowX!=='visible'){r.left=Math.max(r.left,b.left);r.right=Math.min(r.right,b.right)}if(cs.overflowY!=='visible'){r.top=Math.max(r.top,b.top);r.bottom=Math.min(r.bottom,b.bottom)}}}return r.right>r.left&&r.bottom>r.top?r:null};
      const add=(rect,node)=>{const r=visible(rect,node);if(r)rects.push(r)};
      const paints=cs=>{const bg=cs.backgroundColor;return (bg!=='transparent'&&!(bg.startsWith('rgba')&&bg.replace(/ /g,'').endsWith(',0)')))||cs.backgroundImage!=='none'||cs.boxShadow!=='none'||['Top','Right','Bottom','Left'].some(side=>parseFloat(cs['border'+side+'Width'])>0&&cs['border'+side+'Style']!=='none')};
      const visit=el=>{if(seen.has(el))return;seen.add(el);const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return;
        if(paints(cs)||/^(img|svg|canvas|input|select|textarea)$/i.test(el.tagName)){const r=el.getBoundingClientRect();if(r.width>0&&r.height>0)add(r,el)}
        if(/^svg$/i.test(el.tagName))return;
        for(const child of el.childNodes){if(child.nodeType===3&&child.textContent.trim()!==''){const range=document.createRange();range.selectNodeContents(child);for(const q of range.getClientRects())if(q.width>0&&q.height>0)add(q,child)}else if(child.nodeType===1)visit(child)}};
      document.querySelectorAll(include).forEach(visit);
      return rects.length===0?null:{left:Math.min(...rects.map(r=>r.left)),top:Math.min(...rects.map(r=>r.top)),right:Math.max(...rects.map(r=>r.right)),bottom:Math.max(...rects.map(r=>r.bottom))}})(${JSON.stringify(view.crop?.include ?? DEFAULT_INCLUDE)})`);
    if (typeof box !== "object" || box === null) throw new Error("Unexpected screenshot framing.");
    const { left, top, right, bottom } = box as Record<string, number>;
    if (![left, top, right, bottom].every((value) => Number.isFinite(value)) || (bottom ?? 0) - (top ?? 0) < 300)
      throw new Error("Unexpected screenshot framing.");
    // Room for the cards' shadows, so they are not cut off at the edge of the picture.
    const margin = 36;
    height = Math.min(Math.ceil((bottom ?? 0) - (top ?? 0)) + 2 * margin, 2000);
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: Math.ceil((bottom ?? 0) + margin + 20),
      deviceScaleFactor: 2,
      mobile,
    });
    await delay(200);
    clip = {
      x: Math.max(0, (left ?? 0) - margin),
      y: Math.max(0, (top ?? 0) - margin),
      width: Math.ceil((right ?? 0) - (left ?? 0)) + 2 * margin,
      height,
      scale: 1,
    };
  }
  const screenshot = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
    ...(clip === undefined ? {} : { clip }),
  });
  if (typeof screenshot["data"] !== "string") throw new Error("Chrome returned no screenshot.");
  writeFileSync(join(OUTPUT, file), Buffer.from(screenshot["data"], "base64"));
  console.log(
    `Captured ${file}: signed-out demo, ${theme}, ${String(clip === undefined ? width : clip["width"])}x${String(height)}, 2x.`,
  );
}

// This snapshot predates every browser request; the checked app is never rebuilt.
const appFiles = readFiles(APP);
if (!appFiles.has("index.html") || !appFiles.has("sw.js"))
  throw new Error("Run npm run verify before capturing README screenshots.");
const appDigest = treeDigest(appFiles);
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
}).trim();
rmSync(OUTPUT, { recursive: true, force: true });
mkdirSync(OUTPUT, { recursive: true });
await withLocalBrowser(
  async (browser) => {
    for (const [route, view] of CAPTURED) {
      await capture(browser, `${view.file}-light.png`, "light", route, view);
      await capture(browser, `${view.file}-dark.png`, "dark", route, view);
      if (view.mobile !== undefined) await capture(browser, view.mobile, "dark", route, view, true);
    }
    writeCaptureReceipt(APP, OUTPUT, appDigest, revision);
  },
  Number(process.env["FOLIODASH_AUDIT_PORT"] ?? 4197),
);
